import path from 'node:path';
import { stat, writeFile } from 'node:fs/promises';
import { H2Database } from '../apps/web/lib/db/h2';
import { validateProfileExport } from '@ziwei/domain/profiles-transfer';
import type { BirthProfile } from '@ziwei/domain/ziwei/profiles';

async function main() {
  const args=process.argv.slice(2);
  function option(flag:string){const index=args.indexOf(flag);if(index<0||!args[index+1]||args[index+1].startsWith('--'))throw new Error('用法：npm run export:h2 -- --data-dir /原数据库目录 --out /备份/紫微档案.json');return path.resolve(args[index+1]);}
  const directory=option('--data-dir');const output=option('--out');
  if(!(await stat(path.join(directory,'ziwei.mv.db'))).isFile())throw new Error('指定目录没有 ziwei.mv.db；不会创建新库。');
  try { await stat(path.join(directory,'ziwei.lock.db'));throw new Error('请先停止使用这份数据库的网站服务，再执行只读导出。'); } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
  const database=new H2Database(directory,{readOnly:true});
  try {
    const data=await validateProfileExport({format:'ziwei-profiles',version:1,exportedAt:new Date().toISOString(),profiles:await database.request<BirthProfile[]>('list')});
    await writeFile(output,`${JSON.stringify(data,null,2)}\n`,{flag:'wx',mode:0o600});
    console.log(`已只读导出 ${data.profiles.length} 份档案至 ${output}。既有文件不会被覆盖。`);
  } finally { await database.close(); }
}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
