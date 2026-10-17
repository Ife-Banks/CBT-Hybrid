import { describe, expect, it, vi } from 'vitest';
import { chunk, estimateEtaMs, processInBatches } from './batch';

describe('batch helpers', () => {
  describe('chunk', () => {
    it('splits into fixed-size groups with a short tail', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('returns a single group when the size exceeds the list', () => {
      expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    });

    it('treats a non-positive size as one', () => {
      expect(chunk([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
    });

    it('returns nothing for an empty list', () => {
      expect(chunk([], 5)).toEqual([]);
    });
  });

  describe('processInBatches', () => {
    it('preserves input order and returns handler results', async () => {
      const items = [1, 2, 3, 4, 5];
      const seen: number[] = [];
      const results = await processInBatches(items, async (item) => {
        seen.push(item);
        return item * 2;
      }, { batchSize: 2 });

      expect(results).toEqual([2, 4, 6, 8, 10]);
      expect(seen).toEqual(items);
    });

    it('reports progress after each batch', async () => {
      const progress: Array<{ processed: number; percent: number }> = [];
      await processInBatches(
        [1, 2, 3, 4, 5],
        async (item) => item,
        {
          batchSize: 2,
          onProgress: (p) => {
            progress.push({ processed: p.processed, percent: p.percent });
          },
        },
      );

      expect(progress).toEqual([
        { processed: 2, percent: 40 },
        { processed: 4, percent: 80 },
        { processed: 5, percent: 100 },
      ]);
    });

    it('stops early when the signal is aborted', async () => {
      const signal = { aborted: false };
      const handler = vi.fn(async (item: number) => {
        if (item === 3) signal.aborted = true;
        return item;
      });

      const results = await processInBatches([1, 2, 3, 4, 5], handler, {
        batchSize: 1,
        signal,
      });

      // Batch 3 sets the flag; batch 4 sees it and stops.
      expect(results).toEqual([1, 2, 3]);
    });

    it('handles an empty list without calling the handler', async () => {
      const handler = vi.fn(async (item: number) => item);
      expect(await processInBatches([], handler)).toEqual([]);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('estimateEtaMs', () => {
    it('extrapolates from the observed rate', () => {
      // 10 of 100 records in 1000ms → 100ms each → 90 left → 9000ms.
      expect(estimateEtaMs(10, 100, 1000)).toBe(9000);
    });

    it('returns null when there is nothing to extrapolate', () => {
      expect(estimateEtaMs(0, 100, 1000)).toBeNull();
      expect(estimateEtaMs(100, 100, 1000)).toBeNull();
      expect(estimateEtaMs(5, 100, 0)).toBeNull();
    });
  });
});
