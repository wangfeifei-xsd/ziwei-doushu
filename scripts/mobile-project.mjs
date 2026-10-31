import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const native=path.join(root,'apps/native');const require=createRequire(path.join(native,'package.json'));
const cli=path.join(path.dirname(require.resolve('@tauri-apps/cli/package.json')),'tauri.js');
const platform=process.argv[2];if(!['android','ios'].includes(platform))throw new Error('指定 android 或 ios。');
execFileSync(process.execPath,[cli,platform,'init','--ci','--skip-targets-install'],{cwd:native,stdio:'inherit'});
if(platform==='android'&&process.env.SIGN_BUILD==='true'){
 for(const key of ['ANDROID_KEYSTORE','ANDROID_KEY_ALIAS','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_PASSWORD','RUNNER_TEMP'])if(!process.env[key])throw new Error(`签名缺少 ${key}`);
 const secret=path.join(process.env.RUNNER_TEMP,'ziwei-release.jks');await writeFile(secret,Buffer.from(process.env.ANDROID_KEYSTORE,'base64'),{mode:0o600});
 const file=path.join(native,'src-tauri/gen/android/app/build.gradle.kts');let source=await readFile(file,'utf8');
 if(!source.includes('ZIWEI_RELEASE_SIGNING')){
  if(!source.includes('buildTypes {')||!source.includes('getByName("release") {'))throw new Error('Android 模板改变，无法安全接入 release 签名。');
  source=source.replace('buildTypes {',`// ZIWEI_RELEASE_SIGNING: credentials are read at build time only.
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("RUNNER_TEMP") + "/ziwei-release.jks")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {`).replace('getByName("release") {','getByName("release") {\n            signingConfig = signingConfigs.getByName("release")');
  await writeFile(file,source);
 }
}
