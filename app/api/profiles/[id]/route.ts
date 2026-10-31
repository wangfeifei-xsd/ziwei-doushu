import { deleteProfile, getProfile, updateProfile } from '@/lib/db/profiles';
import { isProfileId, parseProfileForm } from '@/lib/ziwei/profiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!isProfileId(id)) return Response.json({ error: '档案编号无效。' }, { status: 400 });
  try {
    const profile = await getProfile(id);
    if (!profile) return Response.json({ error: '档案不存在或已更新，请返回档案管理重新选择。' }, { status: 404 });
    return Response.json({ profile }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Profile read failed', error);
    return Response.json({ error: '暂时无法读取档案，请稍后重试。' }, { status: 503 });
  }
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  if (!isProfileId(id)) return Response.json({ error: '档案编号无效。' }, { status: 400 });
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
    const profile = await updateProfile(id, form);
    if (profile === 'duplicate') return Response.json({ error: '已有完全相同的档案，请修改资料或直接使用已有档案。' }, { status: 409 });
    if (!profile) return Response.json({ error: '档案已被删除，请刷新列表后重试。' }, { status: 404 });
    return Response.json({ profile }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Profile update failed', error);
    return Response.json({ error: '档案更新失败，请稍后重试。' }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!isProfileId(id)) return Response.json({ error: '档案编号无效。' }, { status: 400 });
  try {
    const deleted = await deleteProfile(id);
    if (!deleted) return Response.json({ error: '档案不存在或已删除。' }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Profile delete failed', error);
    return Response.json({ error: '删除失败，请稍后重试。' }, { status: 503 });
  }
}
