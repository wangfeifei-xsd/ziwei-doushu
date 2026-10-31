import{readdir,mkdir,cp}from'node:fs/promises';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import path from'node:path';
const root=path.resolve('apps/native/src-tauri/gen/android/app/build/outputs');const output=path.resolve('dist/artifacts');await mkdir(output,{recursive:true});const files=[];
async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else if(/\.(apk|aab)$/.test(file))files.push(file);}}await visit(root);
if(!files.some(file=>file.endsWith('.apk'))||process.env.SIGN_BUILD==='true'&&!files.some(file=>file.endsWith('.aab')))throw new Error('缺少所需 Android 产物。');
for(const file of files){
 if(file.endsWith('.apk')){
  const signer=path.join(process.env.ANDROID_HOME,'build-tools/37.0.0/apksigner');const report=execFileSync(signer,['verify','--print-certs',file],{encoding:'utf8'});
  if(process.env.SIGN_BUILD==='true'){
   const cert=execFileSync('keytool',['-exportcert','-keystore',path.join(process.env.RUNNER_TEMP,'ziwei-release.jks'),'-alias',process.env.ANDROID_KEY_ALIAS,'-storepass:env','ANDROID_KEYSTORE_PASSWORD']);
   const expected=createHash('sha256').update(cert).digest('hex');if(!report.toLowerCase().includes(expected))throw new Error('APK 签名与指定 release keystore 不一致。');
  }
 }
 await cp(file,path.join(output,`${process.env.SIGN_BUILD==='true'?'release-signed':'debug'}-${path.basename(file)}`));
}
