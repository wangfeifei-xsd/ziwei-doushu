import 'server-only';
import { readRecord, searchRecords, datasetStatus, clearDatasetCache } from '../../../server/dataset/reader.mjs';
import type { DatasetRepository } from '@ziwei/domain/ziwei/dataset';
export const dataset: DatasetRepository = { read:readRecord, search:searchRecords, status:datasetStatus, clearCache:async()=>{clearDatasetCache();} };
