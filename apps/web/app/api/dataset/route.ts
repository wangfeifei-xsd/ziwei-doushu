import { dataset } from '@/lib/dataset';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const key=new URL(request.url).searchParams.get('key');
    return Response.json(key ? {record:await dataset.read(key,request.signal)} : await dataset.status(request.signal),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'资料读取失败。'},{status:400});}
}
export async function POST(request: Request) {
  try {
    if(Number(request.headers.get('content-length'))>4096)return Response.json({error:'查询过长。'},{status:413});
    const text=await request.text();if(text.length>4096)return Response.json({error:'查询过长。'},{status:413});
    return Response.json(await dataset.search(JSON.parse(text),request.signal),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'查询失败。'},{status:400});}
}
export async function DELETE(request: Request) {
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'来源不匹配。'},{status:403});
  await dataset.clearCache();return Response.json({ok:true});
}
