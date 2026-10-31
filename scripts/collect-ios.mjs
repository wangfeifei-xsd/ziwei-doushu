import{readdir,mkdir,cp}from'node:fs/promises';import{execFileSync}from'node:child_process';import path from'node:path';
const mode=process.argv[2];const output=path.resolve('dist/artifacts');await mkdir(output,{recursive:true});const base=path.resolve('apps/native/src-tauri/gen/apple/build');const found=[];
async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory()){if(e.name.endsWith('.app'))found.push(file);else await visit(file);}else if(e.name.endsWith('.ipa'))found.push(file);}}await visit(base);
if(mode==='simulator'){
 let app;
 for(const file of found.filter(name=>name.endsWith('.app'))){try{const platform=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :DTPlatformName',path.join(file,'Info.plist')],{encoding:'utf8'}).trim();if(platform==='iphonesimulator'){app=file;break;}}catch{}}
 if(!app)throw new Error('没有找到实际的 iOS 模拟器 .app；不会生成伪 IPA。');
 const plist=path.join(app,'Info.plist');
 const executable=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleExecutable',plist],{encoding:'utf8'}).trim();
 const display=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleDisplayName',plist],{encoding:'utf8'}).trim();
 if(!/^[\x20-\x7e]+$/.test(executable)||display!=='紫微命盘')throw new Error('iOS 需要 ASCII 可执行文件名及中文显示名；请检查平台配置合并。');
 execFileSync('tar',['-czf',path.join(output,'ziwei-ios-simulator.app.tar.gz'),'-C',path.dirname(app),path.basename(app)]);
 await mkdir('.runtime',{recursive:true});await import('node:fs/promises').then(fs=>fs.writeFile('.runtime/ios-simulator-app.txt',app));
}else if(mode==='device'){
 const files=found.filter(name=>name.endsWith('.ipa'));if(!files.length)throw new Error('签名构建没有产生 IPA。');for(const file of files)await cp(file,path.join(output,path.basename(file)));
}else throw new Error('指定 simulator 或 device。');
