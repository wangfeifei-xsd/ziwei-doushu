import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {syncNativeIcons} from './sync-native-icons.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const native=path.join(root,'apps/native');
const platform=process.argv[2];if(!['android','ios'].includes(platform))throw new Error('指定 android 或 ios。');
// Tauri records the package-manager invocation in Gradle/Xcode callbacks.
// Direct `node tauri.js` initialization without npm's environment records
// `node tauri ...`, which fails when Gradle builds the native library.
execFileSync(process.platform==='win32'?'npm.cmd':'npm',['run','tauri','--',platform,'init','--ci','--skip-targets-install'],{cwd:native,stdio:'inherit',shell:process.platform==='win32'});
await syncNativeIcons(platform);
if(platform==='android'){
 // CLI 2.12.4 generates SDK 37 defaults, but Google's stable repository and
 // the locked Tauri Android libraries currently provide SDK 36.
 const api=process.env.ANDROID_API_LEVEL||'36';const tools=process.env.ANDROID_BUILD_TOOLS_VERSION||'36.0.0';
 if(!/^\d+$/.test(api)||!/^\d+\.\d+\.\d+$/.test(tools))throw new Error('Android SDK/build-tools 版本无效。');
 const file=path.join(native,'src-tauri/gen/android/app/build.gradle.kts');let source=await readFile(file,'utf8');
 if(!/\bcompileSdk\s*=\s*\d+/.test(source)||!/\btargetSdk\s*=\s*\d+/.test(source))throw new Error('Android 模板改变，无法锁定 SDK。');
 source=source.replace(/\bcompileSdk\s*=\s*\d+/,`compileSdk = ${api}`).replace(/\btargetSdk\s*=\s*\d+/,`targetSdk = ${api}`);
 if(/\bbuildToolsVersion\s*=\s*"[^"]+"/.test(source))source=source.replace(/\bbuildToolsVersion\s*=\s*"[^"]+"/,`buildToolsVersion = "${tools}"`);
 else source=source.replace(`compileSdk = ${api}`,`compileSdk = ${api}\n    buildToolsVersion = "${tools}"`);
 await writeFile(file,source);
}
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
