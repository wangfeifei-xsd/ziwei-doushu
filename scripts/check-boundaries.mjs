import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const builtins=new Set(builtinModules.flatMap(name=>[name,`node:${name}`]));
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):/\.[cm]?[tj]sx?$/.test(e.name)?[path.join(dir,e.name)]:[]);}
const problems=[];let count=0;
for(const pkg of ['domain','content','runtime','ui','features'])for(const file of files(path.join(root,'packages',pkg,'src'))){
 const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);count++;
 function visit(node){
  let specifier;
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))specifier=node.moduleSpecifier?.text;
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)specifier=node.arguments[0]?.text;
  const forbidden=specifier&&(builtins.has(specifier)||/^(next(?:\/|$)|@tauri-apps\/|server-only$)/.test(specifier)||(pkg==='domain'&&/^(react(?:-dom)?(?:\/|$)|@ziwei\/(?!domain))/.test(specifier)));
  if(forbidden)problems.push(`${path.relative(root,file)}: 禁止依赖 ${specifier}`);
  if(ts.isIdentifier(node)&&['window','document','navigator','localStorage','sessionStorage','XMLHttpRequest','fetch'].includes(node.text)&&pkg==='domain')problems.push(`${path.relative(root,file)}: 领域代码禁止 ${node.text}`);
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='fetch'&&['ui','features'].includes(pkg))problems.push(`${path.relative(root,file)}: 共享业务禁止直接联网`);
  ts.forEachChild(node,visit);
 }visit(tree);
}
const reactVersions=new Set();
for(const dir of ['apps/web','apps/native','packages/features','packages/ui','packages/runtime']){
 const require=createRequire(path.join(root,dir,'package.json'));reactVersions.add(require('react/package.json').version);
}
if(reactVersions.size!==1)problems.push('宿主与共享组件加载了多份 React 版本。');
if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}else console.log(`✓ 依赖边界通过：${count} 个源文件；React ${[...reactVersions][0]}。`);
