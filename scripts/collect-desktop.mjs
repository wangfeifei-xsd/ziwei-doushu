import{readdir,mkdir,cp,readFile,writeFile}from'node:fs/promises';import{execFileSync}from'node:child_process';import path from'node:path';
const [platform,target]=process.argv.slice(2);const base=path.resolve('apps/native/src-tauri/target',target,'release/bundle');const output=path.resolve('dist/artifacts');await mkdir(output,{recursive:true});
if(platform==='macos'){
 const folder=path.join(base,'macos');const app=(await readdir(folder)).find(name=>name.endsWith('.app'));if(!app)throw new Error('缺少 macOS .app。');
 // Linker-only arm64 signatures do not seal the .app resources. Check every
 // bundle, including local ad-hoc builds, before distributing it.
 execFileSync('codesign',['--verify','--deep','--strict','--verbose=2',path.join(folder,app)],{stdio:'inherit'});
 if(process.env.SIGN_BUILD==='true')execFileSync('xcrun',['stapler','validate',path.join(folder,app)],{stdio:'inherit'});
 execFileSync('tar',['-czf',path.join(output,'ziwei-macos-arm64.app.tar.gz'),'-C',folder,app]);
 const images=(await readdir(path.join(base,'dmg'))).filter(name=>name.endsWith('.dmg'));
 if(!images.length)throw new Error('缺少 macOS DMG。');
 for(const name of images){
  const image=path.join(base,'dmg',name);
  execFileSync(process.execPath,['scripts/check-macos-dmg.mjs',image],{stdio:'inherit'});
  await cp(image,path.join(output,name));
 }
 await writeFile(path.join(output,'macOS-安装说明.txt'),process.env.SIGN_BUILD==='true'
  ?'本包已使用 Developer ID 签名并公证。打开 DMG，将紫微命盘.app 拖入 Applications 后启动。\n'
  :'本包使用本地 ad-hoc 签名，资源完整性已校验，但没有 Apple Developer ID 和公证。\n打开 DMG，将紫微命盘.app 拖入 Applications。首次启动可能被 macOS 拦截。\n确认来源为自己的 GitHub Actions，核对 SHA256SUMS 后，可在「系统设置 → 隐私与安全性」允许打开。\n若仍提示“已损坏”，仅对已安装的本应用执行：\nxattr -dr com.apple.quarantine "/Applications/紫微命盘.app"\n不要关闭全局 Gatekeeper。正式分发请配置 Apple 签名证书与公证凭据。\n');
}else if(platform==='windows'){
 const binary=await readFile(path.resolve(base,'../ziwei-native.exe'));const pe=binary.readUInt32LE(0x3c);
 if(binary.toString('ascii',0,2)!=='MZ'||binary.toString('ascii',pe,pe+4)!=='PE\0\0'||binary.readUInt16LE(pe+4)!==0x8664)throw new Error('Windows 应用不是 x64 PE 可执行文件。');
 const folder=path.join(base,'nsis');const names=(await readdir(folder)).filter(name=>name.endsWith('.exe'));if(!names.length)throw new Error('缺少 NSIS 安装器。');
 for(const name of names){const file=path.join(folder,name);if(process.env.SIGN_BUILD==='true')execFileSync('powershell.exe',['-NoProfile','-Command','if ((Get-AuthenticodeSignature -LiteralPath $env:ZIWEI_SIGNED_FILE).Status -ne "Valid") { throw "Invalid installer signature" }'],{env:{...process.env,ZIWEI_SIGNED_FILE:file},stdio:'inherit'});await cp(file,path.join(output,name));}
}else throw new Error('未知桌面平台。');
