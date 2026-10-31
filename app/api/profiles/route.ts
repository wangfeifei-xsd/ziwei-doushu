import { listProfiles, saveProfile } from '@/lib/db/profiles';
import { parseProfileForm } from '@/lib/ziwei/profiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ profiles: await listProfiles() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Profile list failed', error);
    return Response.json({ error: '暂时无法读取档案，请检查 H2 数据库和 Java 运行环境后重试。' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let form;
  try {
    if (!request.headers.get('content-type')?.includes('application/json')) {
      return Response.json({ error: '档案必须使用 JSON 提交。' }, { status: 415 });
    }
    if (Number(request.headers.get('content-length')) > 8192) {
      return Response.json({ error: '档案内容过长。' }, { status: 413 });
    }
    const body = await request.text();
    if (Buffer.byteLength(body) > 8192) return Response.json({ error: '档案内容过长。' }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { return Response.json({ error: '档案内容必须是有效的 JSON。' }, { status: 400 }); }
    form = parseProfileForm(input);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '出生资料格式不正确。' }, { status: 400 });
  }
  try {
    return Response.json({ profile: await saveProfile(form) }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Profile save failed', error);
    return Response.json({ error: '档案保存失败，请检查 H2 数据库和 Java 运行环境后重试。' }, { status: 503 });
  }
}
