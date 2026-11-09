import type { DatasetLoadStatus } from '@ziwei/domain/ziwei/dataset';

export default function DatasetStatus({ records }: { records: DatasetLoadStatus[] }) {
  if (!records.length) return null;
  return <div role="status" aria-label="本次档案资料" className="px-4 py-2 text-xs leading-6" style={{ color: 'var(--tx-2)' }}>
    {records.map(record => <p key={`${record.person}/${record.key}`}>
      {record.person}：{record.integrity.complete
        ? `已加载 ${record.integrity.actualTopics}/${record.integrity.expectedTopics} 个专题，原文完整提供。`
        : `${record.status}。${record.reason ?? ''}本次仅参考当前命盘与古籍。`}
    </p>)}
  </div>;
}
