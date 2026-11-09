import { datasetBirth, datasetKey, fullDatasetContext, datasetLoadStatus, type DatasetLoadStatus, type DatasetContext, type DatasetRepository } from '@ziwei/domain/ziwei/dataset';
import { getLearningCase } from '@ziwei/domain/ziwei/learning-cases';
import { generateChart } from '@ziwei/domain/ziwei/algorithm';
import type { AIMessage } from '@ziwei/domain/ai/errors';
import { buildChartContext, isRecord } from './context';

function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if ((error instanceof Error && error.name === 'TimeoutError') || /超时|timeout/i.test(message)) return '档案读取超时。';
  if (/校验|损坏|生辰不一致/.test(message)) return '档案校验失败，未注入资料。';
  if (/缺失|不存在|ENOENT/.test(message)) return '档案文件缺失。';
  return '档案暂时无法读取。';
}

/** The host supplies the complete matching record; questions never select or trim its text. */
export async function enrichDataset(
  messages: AIMessage[], body: unknown, kind: 'interpret' | 'heming', repository: DatasetRepository, signal: AbortSignal,
  onStatus?: (records: DatasetLoadStatus[]) => void,
): Promise<AIMessage[]> {
  if (!isRecord(body)) return messages;
  const lesson = getLearningCase(body.learningCaseId);
  const inputs = kind === 'heming' ? [body.chartA, body.chartB] : [lesson ? generateChart({ ...lesson.birth }) : body.chart];
  const results: (DatasetContext | DatasetLoadStatus)[] = [];
  for (let i = 0; i < inputs.length; i++) {
    signal.throwIfAborted();
    const { chart } = buildChartContext(inputs[i], kind === 'heming' ? undefined : body.selection);
    const key = datasetKey(chart.birthInfo);
    const person = kind === 'heming' ? (i === 0 ? '甲方' : '乙方') : '当前盘';
    try { datasetBirth(key); } catch {
      results.push(datasetLoadStatus(person, key, '超出资料覆盖范围', '资料覆盖 1950–2026 年。'));
      continue;
    }
    try {
      const record = await repository.read(key, signal);
      signal.throwIfAborted();
      results.push(record ? fullDatasetContext(record, key, person) : datasetLoadStatus(person, key, '未找到同生辰记录'));
    } catch (error) {
      signal.throwIfAborted();
      results.push(datasetLoadStatus(person, key, '资料暂不可用', failureReason(error)));
    }
  }
  onStatus?.(results.map(({ person, key, status, reason, integrity }) => ({ person, key, status, ...(reason ? { reason } : {}), integrity })));
  const newline = messages[1].content.indexOf('\n');
  const context = JSON.parse(messages[1].content.slice(newline + 1));
  const content = messages[1].content.slice(0, newline + 1) + JSON.stringify({ ...context, dataset: results });
  return [{ ...messages[0], content: messages[0].content + '\n'
    + 'dataset 按人物提供同生辰档案的全部十三专题原文，保留标题、条件、例外、重复段落和原始顺序，未按本次问题筛选。它是 generatedAt 标明日期的旧版模板生成资料，不能当成真实经历或覆盖当前结构化命盘。旧年份、当前大限、亮度及流派描述须与本次命盘和所选运限核对；存在冲突时说明版本与差异，不能直接套用或默默改写。引用档案时注明 key（出生键）、topic 和 version，保持甲乙人物归属；档案没有站内阅读页，不生成档案链接。古籍引用使用已有 path。integrity.complete 为 false 时说明本次未收到该人物完整档案，仅依据实际提供的命盘和古籍，不能补造缺失档案。' },
    { ...messages[1], content }, ...messages.slice(2)];
}
