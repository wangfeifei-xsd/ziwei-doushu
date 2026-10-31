import { listProfiles } from '@/lib/db/profiles';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await listProfiles();
    return Response.json({ok:true,service:'ziwei-web',instance:process.env.ZIWEI_SERVICE_ID||''},{headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({ok:false,error:'档案数据库暂不可用。'},{status:503});
  }
}
