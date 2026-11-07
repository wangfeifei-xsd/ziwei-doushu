import type {DatasetRecord,DatasetQuery,DatasetPage,DatasetStatus} from '../../packages/domain/src/ziwei/dataset';
export function datasetRoot(): string;
export function validateKey(key: string): number;
export function scanYear(year: number,signal?: AbortSignal): AsyncGenerator<DatasetRecord>;
export function readRecord(key: string,signal?: AbortSignal): Promise<DatasetRecord|null>;
export function searchRecords(query: DatasetQuery,signal?: AbortSignal): Promise<DatasetPage>;
export function datasetStatus(): Promise<DatasetStatus>;
export function clearDatasetCache(): void;
