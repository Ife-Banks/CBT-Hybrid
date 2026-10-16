/**
 * RFC 8785 (JCS) style canonical JSON: object keys are sorted by UTF-16 code
 * unit, arrays keep their order, and no insignificant whitespace is emitted.
 * Used so a pack manifest signs and hashes to a stable byte sequence.
 */
export function canonicalJson(value: unknown): string {
  return serialise(value);
}

function serialise(value: unknown): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error('Cannot canonicalise a non-finite number');
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map(serialise).join(',')}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      const body = keys.map((key) => `${JSON.stringify(key)}:${serialise(record[key])}`).join(',');
      return `{${body}}`;
    }
    default:
      throw new Error(`Cannot canonicalise a value of type ${typeof value}`);
  }
}
