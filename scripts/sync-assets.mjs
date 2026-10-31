import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
for (const app of ['web', 'native']) {
 const dest = new URL(`apps/${app}/public/`, root);
 await mkdir(dest, {recursive:true});
 await cp(new URL('assets/public/',root),dest,{recursive:true});
}
