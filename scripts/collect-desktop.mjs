import{readdir,mkdir,cp}from'node:fs/promises';import{execFileSync}from'node:child_process';import path from'node:path';
const [platform,target]=process.argv.slice(2);const base=path.resolve('apps/native/src-tauri/target',target,'release/bundle');const output=path.resolve('dist/artifacts');await mkdir(output,{recursive:true});
if(platform==='macos'){
 const folder=path.join(base,'macos');const app=(await readdir(folder)).find(name=>name.endsWith('.app'));if(!app)throw new Error('缺少 macOS .app。');
 if(process.env.SIGN_BUILD==='true'){execFileSync('codesign',['--verify','--deep','--strict',path.join(folder,app)],{stdio:'inherit'});execFileSync('xcrun',['stapler','validate',path.join(folder,app)],{stdio:'inherit'});}
 execFileSync('tar',['-czf',path.join(output,'ziwei-macos-arm64.app.tar.gz'),'-C',folder,app]);
 for(const name of await readdir(path.join(base,'dmg')))if(name.endsWith('.dmg'))await cp(path.join(base,'dmg',name),path.join(output,name));
}else if(platform==='windows'){
 const folder=path.join(base,'nsis');const names=(await readdir(folder)).filter(name=>name.endsWith('.exe'));if(!names.length)throw new Error('缺少 NSIS 安装器。');
 for(const name of names){const file=path.join(folder,name);if(process.env.SIGN_BUILD==='true')execFileSync('powershell.exe',['-NoProfile','-Command','if ((Get-AuthenticodeSignature -LiteralPath $env:ZIWEI_SIGNED_FILE).Status -ne "Valid") { throw "Invalid installer signature" }'],{env:{...process.env,ZIWEI_SIGNED_FILE:file},stdio:'inherit'});await cp(file,path.join(output,name));}
}else throw new Error('未知桌面平台。');
