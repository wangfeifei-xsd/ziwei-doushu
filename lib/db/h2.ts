import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

type Action = 'list' | 'get' | 'save' | 'update' | 'delete';
interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One embedded H2 process per Next.js worker, reused through development reloads. */
export class H2Database {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private ready: Promise<void>;
  private failure: Error | null = null;

  constructor(dataDir = process.env.H2_DATA_DIR || path.join(process.cwd(), 'data')) {
    const databasePath = path.resolve(dataDir, 'ziwei');
    if (/[;\r\n]/.test(databasePath)) throw new Error('H2 数据目录不能包含分号或换行。');
    mkdirSync(/* turbopackIgnore: true */ path.dirname(databasePath), { recursive: true, mode: 0o700 });
    // Assets are explicitly traced in next.config.js; JAVA_BIN is a runtime executable.
    this.child = spawn(/* turbopackIgnore: true */ process.env.JAVA_BIN || 'java', [
      '-Dh2.bindAddress=127.0.0.1',
      '--class-path', path.join(process.cwd(), 'vendor/h2/h2-2.5.252.jar'),
      path.join(process.cwd(), 'server/h2/ProfileStore.java'), databasePath,
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const lines = createInterface({ input: this.child.stdout });
    const onExit = () => { this.child.kill(); };
    process.once('exit', onExit);
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error('H2 数据库启动超时，请检查 Java 和数据目录。'));
      }, 30_000);
      const failed = (error: Error) => {
        clearTimeout(timer);
        reject(error);
        this.fail(error);
      };
      this.child.once('error', () => failed(new Error('无法启动 H2，请安装 Java 17+ JDK 或设置 JAVA_BIN。')));
      this.child.once('close', () => {
        lines.close();
        process.removeListener('exit', onExit);
        failed(this.failure || new Error('H2 数据库连接已关闭，请重试。'));
      });
      lines.on('line', line => {
        if (line === 'READY') {
          clearTimeout(timer);
          resolve();
          return;
        }
        try {
          const response = JSON.parse(line);
          const entry = this.pending.get(response.requestId);
          if (!entry) return;
          clearTimeout(entry.timer);
          this.pending.delete(response.requestId);
          if (response.error) entry.reject(new Error('档案读写失败，请检查数据库目录权限。'));
          else entry.resolve(response.result);
        } catch {
          failed(new Error('H2 数据库返回了无效的响应。'));
        }
      });
    });
    // Avoid printing stored birth data or SQL parameters when reporting failures.
    this.child.stderr.on('data', chunk => {
      console.error('[H2]', String(chunk).slice(0, 2000));
    });
    this.child.stdin.on('error', () => this.fail(new Error('H2 数据库连接中断，请重试。')));
  }

  get closed() { return this.failure !== null; }

  private fail(error: Error) {
    this.failure = error;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.child.kill();
  }

  async request<T>(action: Action, id = '', form = '', targetId = ''): Promise<T> {
    await this.ready;
    if (this.failure) throw this.failure;
    if (id && !/^[a-f0-9]{64}$/.test(id)) throw new Error('无效的档案编号。');
    if (targetId && !/^[a-f0-9]{64}$/.test(targetId)) throw new Error('无效的档案编号。');
    const requestId = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('H2 数据库响应超时，请重试。')), 15_000);
      this.pending.set(requestId, { resolve: result => resolve(result as T), reject, timer });
      this.child.stdin.write(`${requestId}\t${action}\t${id}\t${Buffer.from(form).toString('base64')}\t${targetId}\n`);
    });
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      this.child.once('close', resolve);
      this.child.stdin.end();
    });
  }
}
