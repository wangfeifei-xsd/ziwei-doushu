import { test, expect, type Page } from '@playwright/test';

type NativeFixture = {
  completeUnlock(): void;
  response: 'valid' | 'malformed';
  requests: number;
};

async function nativeSettings(page: Page, locked = true) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(initiallyLocked => {
    const settings = {
      baseURL: 'https://fixture.example/v1', model: 'fixture', mode: 'responses',
      apiKey: '', hasApiKey: true, hasVault: true, locked: initiallyLocked,
      configured: !initiallyLocked, source: 'saved',
    };
    const fixture = {
      completeUnlock: () => {}, response: 'valid', requests: 0,
    };
    Object.assign(window, { isTauri: true, __nativeFixture: fixture, __TAURI_INTERNALS__: {
      transformCallback: () => 1, unregisterCallback: () => {},
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        if (command === 'bootstrap') return {};
        if (command === 'platform_info') return { mobile: true };
        if (command === 'model_get') return { ...settings };
        if (command === 'model_unlock') {
          if (args.password !== 'test-password') throw '密钥库无法解锁，请检查密码；原文件未修改。';
          await new Promise<void>(resolve => { fixture.completeUnlock = resolve; });
          settings.locked = false; settings.configured = true;
          return { ...settings };
        }
        if (command === 'model_lock') {
          settings.locked = true; settings.configured = false;
          return { ...settings };
        }
        if (command === 'ai_stream') {
          if (settings.locked) throw '密钥库已锁定，请先解锁。';
          fixture.requests++;
          const channel = args.channel as { onmessage(event: { type: string; bytes: number[] }): void };
          const data = fixture.response === 'malformed'
            ? 'data: this-is-not-json\n\n'
            : 'event: response.output_text.delta\rdata: {"type":"response.output_text.delta","delta":"OK"}\r\revent: response.completed\rdata: {"type":"response.completed","response":{"status":"completed"}}\r\r';
          channel.onmessage({ type: 'chunk', bytes: Array.from(new TextEncoder().encode(data)) });
        }
        return null;
      },
    } });
  }, locked);
  await page.goto('/#/settings/model');
  await expect(page.getByRole('heading', { name: '服务连接', exact: true })).toBeVisible();
}

test('原生模型配置：等待解锁完成后才允许测试连接', async ({ page }, info) => {
  test.skip(info.project.name !== 'vite', '验证原生适配器与界面，IPC 由隔离夹具替代。');
  await nativeSettings(page);
  await page.getByPlaceholder('密钥库解锁密码（至少 8 个字符）').fill('test-password');
  await page.getByRole('button', { name: '解锁', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在解锁…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '测试连接', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.completeUnlock());
  await expect(page.getByText('密钥库已解锁，本次启动可使用已保存的密钥。', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('密钥库解锁密码（至少 8 个字符）')).toHaveValue('');
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(page.getByText(/连接成功，模型已返回有效响应/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.requests)).toBe(1);
});

test('原生模型配置：密码错误在解锁按钮旁显示并可重试', async ({ page }, info) => {
  test.skip(info.project.name !== 'vite', '原生密钥库界面回归。');
  await nativeSettings(page);
  await page.getByPlaceholder('密钥库解锁密码（至少 8 个字符）').fill('wrong-password');
  await page.getByRole('button', { name: '解锁', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请检查密码');
  await expect(page.getByRole('alert')).toBeInViewport();
  await expect(page.getByRole('alert')).not.toContainText('Error:');
  await expect(page.getByRole('button', { name: '解锁', exact: true })).toBeEnabled();
});

test('原生 Responses：异常 JSON 显示可读错误，重试可连接', async ({ page }, info) => {
  test.skip(info.project.name !== 'vite', '原生 Responses 解析回归。');
  await nativeSettings(page, false);
  await page.evaluate(() => { (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.response = 'malformed'; });
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('模型返回的数据格式异常');
  await expect(page.getByRole('alert')).not.toContainText(/JSON|SyntaxError|this-is-not-json/);
  await page.evaluate(() => { (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.response = 'valid'; });
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(page.getByText(/连接成功，模型已返回有效响应/)).toBeVisible();
});
