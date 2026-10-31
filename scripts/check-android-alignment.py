"""Check every packaged native .so, including dependencies, rather than only libapp."""
import os, pathlib, subprocess, tempfile, zipfile, re
base=pathlib.Path('apps/native/src-tauri/gen/android/app/build/outputs')
apks=list(base.rglob('*.apk'))
if not apks: raise SystemExit('No APK to validate')
ndk=pathlib.Path(os.environ['NDK_HOME'])
readelf=next(ndk.glob('toolchains/llvm/prebuilt/*/bin/llvm-readelf'))
zipalign=pathlib.Path(os.environ['ANDROID_HOME'])/'build-tools/37.0.0/zipalign'
count=0
for apk in apks:
    subprocess.run([str(zipalign),'-c','-P','16','-v','4',str(apk)],check=True,stdout=subprocess.DEVNULL)
    with zipfile.ZipFile(apk) as archive, tempfile.TemporaryDirectory() as directory:
        for name in archive.namelist():
            if not name.endswith('.so'): continue
            file=pathlib.Path(directory)/pathlib.Path(name).name
            file.write_bytes(archive.read(name))
            report=subprocess.check_output([str(readelf),'-lW',str(file)],text=True)
            aligns=[int(line.split()[-1],16) for line in report.splitlines() if line.strip().startswith('LOAD ')]
            if not aligns or any(value<16384 for value in aligns): raise SystemExit(f'16 KB ELF alignment failed: {name}')
            count+=1
if not count: raise SystemExit('No native libraries were inspected')
print(f'16 KB page alignment: {count} packaged native libraries passed, APK zip alignment passed')
