import base64, json, os, pathlib, plistlib, subprocess, sys
record=pathlib.Path(os.environ.get('RUNNER_TEMP','/tmp'))/'ziwei-ios-profile-path.txt'
if '--cleanup' in sys.argv:
    if record.exists(): pathlib.Path(record.read_text()).unlink(missing_ok=True); record.unlink()
    raise SystemExit(0)
for key in ['IOS_PROFILE','APPLE_DEVELOPMENT_TEAM']:
    if not os.environ.get(key): raise SystemExit(f'Missing signing credential: {key}')
raw=base64.b64decode(os.environ['IOS_PROFILE'])
tmp=record.with_suffix('.mobileprovision');tmp.write_bytes(raw);tmp.chmod(0o600)
try: profile=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(tmp)],stderr=subprocess.DEVNULL))
finally: tmp.unlink(missing_ok=True)
identifier=json.loads(pathlib.Path('apps/native/src-tauri/tauri.conf.json').read_text())['identifier']
team=os.environ['APPLE_DEVELOPMENT_TEAM']
if profile['Entitlements'].get('application-identifier')!=f'{team}.{identifier}': raise SystemExit('Profile does not match bundle identifier/team')
folder=pathlib.Path.home()/'Library/MobileDevice/Provisioning Profiles';folder.mkdir(parents=True,exist_ok=True)
dest=folder/f"{profile['UUID']}.mobileprovision";dest.write_bytes(raw);dest.chmod(0o600);record.write_text(str(dest))
yml=pathlib.Path('apps/native/src-tauri/gen/apple/project.yml')
text=yml.read_text().replace('        ENABLE_BITCODE: false',f'''        CODE_SIGN_STYLE: Manual
        DEVELOPMENT_TEAM: {team}
        CODE_SIGN_IDENTITY: Apple Distribution
        PROVISIONING_PROFILE_SPECIFIER: {profile['UUID']}
        ENABLE_BITCODE: false''')
yml.write_text(text)
subprocess.run(['xcodegen','generate','--spec','project.yml'],cwd=yml.parent,check=True)
