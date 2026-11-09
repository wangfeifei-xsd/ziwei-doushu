import { createReadStream } from 'node:fs';
import { createZstdDecompress, constants } from 'node:zlib';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { DatasetRecord } from '@ziwei/domain/ziwei/dataset';

// Read source independently of the enrichment code. Serialize decoding to keep
// the large zstd window bounded while loading several real browser fixtures.
let pending: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<DatasetRecord | null>>();
export function readRecord(key: string): Promise<DatasetRecord | null> {
  const cached = cache.get(key);
  if (cached) return cached;
  const task = pending.then(async () => {
    const input = createReadStream(path.resolve(`assets/datasets/ziwei-v4.0-13d/year-${key.slice(0, 4)}.jsonl.zst`));
    const decoder = createZstdDecompress({ params: { [constants.ZSTD_d_windowLogMax]: 27 } });
    input.on('error', error => decoder.destroy(error));
    input.pipe(decoder);
    const lines = createInterface({ input: decoder, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        const record = JSON.parse(line) as DatasetRecord;
        if (record.k === key) return record;
      }
      return null;
    } finally { lines.close(); input.destroy(); decoder.destroy(); }
  });
  pending = task.catch(() => {});
  cache.set(key, task);
  return task;
}
