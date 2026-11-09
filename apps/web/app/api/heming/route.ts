import { hemingMessages } from '@ziwei/features/ai/prompts';
import { handleAIRequest } from '@/lib/ai/server';
import { enrichDataset } from '@ziwei/features/ai/dataset';
import { dataset } from '@/lib/dataset';

export const runtime = 'nodejs';
export const maxDuration = 600;

export async function POST(request: Request) {
  return handleAIRequest(request, (body,onDataset,signal)=>enrichDataset(hemingMessages(body),body,'heming',dataset,signal,onDataset));
}
