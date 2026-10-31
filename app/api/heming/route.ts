import { hemingMessages } from '@/lib/ai/prompts';
import { handleAIRequest } from '@/lib/ai/server';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request) {
  return handleAIRequest(request, hemingMessages);
}
