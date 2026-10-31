import path from 'node:path';
function repoRoot() {
  const cwd=process.cwd();
  return process.env.ZIWEI_REPO_ROOT || (path.basename(cwd)==='web' && path.basename(path.dirname(cwd))==='apps' ? path.resolve(cwd,'../..') : cwd);
}
export function defaultDataDir() { return process.env.ZIWEI_DATA_DIR || path.join(repoRoot(), 'data'); }
export function serverAsset(relative: string) { return path.resolve(process.env.ZIWEI_WEB_ROOT || path.join(repoRoot(),'apps/web'), relative); }
