/**
 * Batch/chunk processing helpers (Phase 8, tasks 2 and 4).
 *
 * Roster and pack pulls can carry thousands of records. Processing them one at
 * a time keeps memory flat – only a batch is ever held "in hand" – while the
 * progress callback gives the UI a running percentage and ETA.
 */

export interface BatchProgress {
  processed: number;
  total: number;
  /** 0-100, rounded. */
  percent: number;
  batchIndex: number;
  batchCount: number;
}

export interface BatchOptions {
  /** Records handled per commit group. Defaults to 100. */
  batchSize?: number;
  /** Called after each batch commits. May be async. */
  onProgress?: (progress: BatchProgress) => void | Promise<void>;
  /** Cooperative cancellation: set `aborted` to stop after the current batch. */
  signal?: { aborted: boolean };
}

/** Split a list into fixed-size chunks (last chunk may be shorter). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batchSize = Math.max(1, Math.floor(size));
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    batches.push(items.slice(start, start + batchSize) as T[]);
  }
  return batches;
}

/**
 * Run `handler` for every item, in batches, awaiting each item. A progress
 * callback fires once per batch, between commits, so a long pull reports
 * durably rather than per record.
 *
 * Returns the collected handler results in input order.
 */
export async function processInBatches<T, R>(
  items: readonly T[],
  handler: (item: T, index: number) => Promise<R>,
  options: BatchOptions = {},
): Promise<R[]> {
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 100));
  const total = items.length;
  const batches = chunk(items, batchSize);
  const batchCount = batches.length;
  const results: R[] = [];
  let processed = 0;

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
    if (options.signal?.aborted) break;
    const batch = batches[batchIndex];
    if (!batch) continue;

    for (let offset = 0; offset < batch.length; offset++) {
      const item = batch[offset] as T;
      const index = batchIndex * batchSize + offset;
      results.push(await handler(item, index));
      processed++;
    }

    // Yield so callers on the same event loop (health checks, other requests)
    // are not starved during a long sync.
    await Promise.resolve();

    if (options.onProgress) {
      await options.onProgress({
        processed,
        total,
        percent: total === 0 ? 100 : Math.round((processed / total) * 100),
        batchIndex,
        batchCount,
      });
    }
  }

  return results;
}

/**
 * Estimate remaining milliseconds from a processing rate. Returns null when the
 * rate is not yet meaningful (nothing processed or nothing left).
 */
export function estimateEtaMs(
  processed: number,
  total: number,
  elapsedMs: number,
): number | null {
  if (processed <= 0 || total <= processed || elapsedMs <= 0) return null;
  const perRecord = elapsedMs / processed;
  const remaining = total - processed;
  return Math.round(perRecord * remaining);
}
