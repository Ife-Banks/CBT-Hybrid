import type { ConflictResolution, MergeResult } from './types';

/**
 * Conflict detection and merge strategies (Phase 8, tasks 1, 6 and 7).
 *
 * The rules are deliberately pure and side-effect free so they can be reasoned
 * about in isolation: the service layer only decides *when* to call them and
 * what to persist.
 *
 * Detection uses a simple version vector: `base` is the version the cloud and
 * the school last agreed on. A conflict exists when both sides have advanced
 * past `base` with different values.
 */

/** Strategy names accepted by {@link resolveConflict}. */
export type ConflictStrategy =
  | 'local_wins'
  | 'remote_wins'
  | 'newest_wins'
  | 'merge'
  | 'manual';

/** Ordered list of strategies, for validation and docs. */
export const CONFLICT_STRATEGIES: readonly ConflictStrategy[] = [
  'local_wins',
  'remote_wins',
  'newest_wins',
  'merge',
  'manual',
];

export function isConflictStrategy(value: string): value is ConflictStrategy {
  return (CONFLICT_STRATEGIES as readonly string[]).includes(value);
}

/** Deterministic JSON stringify with sorted keys, for structural comparison. */
function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

/** Structural equality that ignores key order. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Whether a record changed relative to its last-agreed base version. */
export function hasChanged(version: number, baseVersion: number): boolean {
  return version > baseVersion;
}

/** Both sides changed since the base: a genuine conflict. */
export function isConflicted(
  localVersion: number,
  remoteVersion: number,
  baseVersion: number,
): boolean {
  return hasChanged(localVersion, baseVersion) && hasChanged(remoteVersion, baseVersion);
}

/**
 * Three-way merge. For every field:
 *  - both sides equal            → keep it
 *  - only one side changed       → take the changed side (auto-merge)
 *  - both changed differently    → record a field conflict
 *
 * A field left in conflict keeps the local value so nothing is silently
 * dropped; the caller decides whether that is acceptable (`merge` strategy)
 * or whether the whole record needs manual review.
 */
export function threeWayMerge<T extends Record<string, unknown>>(
  base: Partial<T> | null | undefined,
  local: T,
  remote: T,
): MergeResult<T> {
  const baseRecord = (base ?? {}) as Record<string, unknown>;
  const localRecord = local as Record<string, unknown>;
  const remoteRecord = remote as Record<string, unknown>;

  const merged: Record<string, unknown> = {};
  const autoMerged: string[] = [];
  const conflicts: string[] = [];

  const keys = new Set<string>([
    ...Object.keys(baseRecord),
    ...Object.keys(localRecord),
    ...Object.keys(remoteRecord),
  ]);

  for (const key of keys) {
    const baseValue = baseRecord[key];
    const localValue = localRecord[key];
    const remoteValue = remoteRecord[key];

    if (deepEqual(localValue, remoteValue)) {
      merged[key] = localValue;
      continue;
    }
    if (deepEqual(localValue, baseValue)) {
      // Only the remote side moved.
      merged[key] = remoteValue;
      autoMerged.push(key);
      continue;
    }
    if (deepEqual(remoteValue, baseValue)) {
      // Only the local side moved.
      merged[key] = localValue;
      autoMerged.push(key);
      continue;
    }

    // Both sides moved, to different values.
    conflicts.push(key);
    merged[key] = localValue;
  }

  return { merged: merged as T, autoMerged, conflicts };
}

export interface ResolveConflictInput<T extends Record<string, unknown>> {
  /** Last value both sides agreed on, if known. */
  base?: Partial<T> | null;
  local: T;
  remote: T;
  localVersion: number;
  remoteVersion: number;
  baseVersion: number;
  localUpdatedAt?: string | null;
  remoteUpdatedAt?: string | null;
  strategy: ConflictStrategy;
}

export interface ResolveConflictOutput<T extends Record<string, unknown>> {
  /** The value to apply locally. */
  value: T;
  /** The strategy that was actually applied, or null when left unresolved. */
  resolution: ConflictResolution | null;
  /** True when the conflict is fully settled by this call. */
  resolved: boolean;
  /** Fields that were merged automatically (merge strategy only). */
  autoMergedFields: string[];
  /** Fields changed on both sides; non-empty means manual attention is needed. */
  conflictFields: string[];
}

/**
 * Apply a strategy to a detected conflict and return the value to persist.
 * `manual` (and a `merge` that still has field conflicts) return `resolved:
 * false` so the caller records an open conflict for a human to settle.
 */
export function resolveConflict<T extends Record<string, unknown>>(
  input: ResolveConflictInput<T>,
): ResolveConflictOutput<T> {
  const { strategy } = input;

  if (strategy === 'local_wins') {
    return {
      value: input.local,
      resolution: 'local_wins',
      resolved: true,
      autoMergedFields: [],
      conflictFields: [],
    };
  }

  if (strategy === 'remote_wins') {
    return {
      value: input.remote,
      resolution: 'remote_wins',
      resolved: true,
      autoMergedFields: [],
      conflictFields: [],
    };
  }

  if (strategy === 'newest_wins') {
    const localAt = input.localUpdatedAt ?? '';
    const remoteAt = input.remoteUpdatedAt ?? '';
    // Remote wins only when it is strictly newer; ties favour the local copy so
    // a school keeps its edits when clocks disagree.
    const remoteIsNewer = remoteAt > localAt;
    return {
      value: remoteIsNewer ? input.remote : input.local,
      resolution: remoteIsNewer ? 'remote_wins' : 'local_wins',
      resolved: true,
      autoMergedFields: [],
      conflictFields: [],
    };
  }

  if (strategy === 'manual') {
    return {
      value: input.local,
      resolution: null,
      resolved: false,
      autoMergedFields: [],
      conflictFields: [],
    };
  }

  // strategy === 'merge'
  const mergeResult = threeWayMerge<T>(input.base, input.local, input.remote);
  const fullyMerged = mergeResult.conflicts.length === 0;
  return {
    value: mergeResult.merged,
    resolution: fullyMerged ? 'merged' : null,
    resolved: fullyMerged,
    autoMergedFields: mergeResult.autoMerged,
    conflictFields: mergeResult.conflicts,
  };
}
