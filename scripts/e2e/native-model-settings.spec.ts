import { test, expect, type Page } from '@playwright/test';

type NativeFixture = {
  completeUnlock(): void;
  completeStream(): void;
  response: 'valid' | 'malformed' | 'delayed-completion' | 'incomplete' | 'channel-error';
  requests: number;
  payloads: { input: { role: string; content: string }[] }[];
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
      completeUnlock: () => {}, completeStream: () => {}, response: 'valid', requests: 0,
      payloads: [] as { input: { role: string; content: string }[] }[],
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
          fixture.payloads.push(args.body as { input: { role: string; content: string }[] });
          const channel = args.channel as { onmessage(event: { type: string; bytes?: number[]; error?: string | null }): void };
          if (fixture.response === 'delayed-completion') {
            const answer = '模型已返回完整解读。请结合命盘与实际情况作判断。';
            const delta = `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: answer })}\n\n`;
            // Responses completion repeats output and can span multiple native
            // IPC chunks. The invocation may resolve before large chunks arrive.
            const completion = `data: ${JSON.stringify({ type: 'response.completed', response: {
              status: 'completed', instructions: '隔离回归测试说明。'.repeat(2000),
              output: [{ content: [{ type: 'output_text', text: answer }] }],
            } })}\n\n`;
            const bytes = new TextEncoder().encode(delta + completion);
            channel.onmessage({ type: 'chunk', bytes: Array.from(bytes.slice(0, 16_384)) });
            fixture.completeStream = () => {
              for (let start = 16_384; start < bytes.length; start += 16_384) {
                channel.onmessage({ type: 'chunk', bytes: Array.from(bytes.slice(start, start + 16_384)) });
              }
              channel.onmessage({ type: 'end', error: null });
            };
            return null;
          }
          if (fixture.response === 'incomplete' || fixture.response === 'channel-error') {
            channel.onmessage({ type: 'chunk', bytes: Array.from(new TextEncoder().encode(
              'data: {"type":"response.output_text.delta","delta":"只返回了一部分"}\n\n',
            )) });
            channel.onmessage({ type: 'end', error: fixture.response === 'channel-error' ? '模型连接中断。' : null });
            return null;
          }
          const data = fixture.response === 'malformed'
            ? 'data: this-is-not-json\n\n'
            : 'event: response.output_text.delta\rdata: {"type":"response.output_text.delta","delta":"OK"}\r\revent: response.completed\rdata: {"type":"response.completed","response":{"status":"completed"}}\r\r';
          channel.onmessage({ type: 'chunk', bytes: Array.from(new TextEncoder().encode(data)) });
          channel.onmessage({ type: 'end', error: null });
        }
        return null;
      },
    } });
  }, locked);
  await page.goto('/#/settings/model');
  await expect(page.getByRole('heading', { name: '服务连接', exact: true })).toBeVisible();
}

test('命盘学习：原生 Responses 上下文与换盘隔离', async ({ page }, info) => {
  test.skip(info.project.name !== 'vite', '使用真实原生适配器，IPC 网络由夹具替代。');
  await nativeSettings(page, false);
  await page.goto('/#/learn');
  const input = page.getByRole('textbox', { name: '关于这张盘，你想了解什么？' });
  const fixture = () => page.evaluate(() => {
    const data = (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture;
    return { requests: data.requests, payloads: data.payloads };
  });
  await expect(input).toBeEnabled();
  expect((await fixture()).requests).toBe(0);
  await page.getByRole('group', { name: '十组模拟生辰' }).getByRole('button', { name: /天同化忌/ }).click();
  await page.getByRole('button', { name: '下一年', exact: true }).click();
  await input.fill('请解释这一年的四化，区分天同的生年化忌');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(page.getByRole('log')).toContainText('OK');
  const first = (await fixture()).payloads[0];
  const context = JSON.parse(first.input[0].content.split('\n').slice(1).join('\n'));
  expect(context.learning.caseId).toBe('huaji');
  expect(context.analysis.selection.view).toBe('liunian');
  expect(context.palaces).toHaveLength(12);
  expect(context.references.entries.length).toBeGreaterThan(0);
  await page.evaluate(() => { (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.response = 'delayed-completion'; });
  await input.fill('这是原生旧盘的问题');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(page.getByRole('log')).toContainText('模型已返回完整解读');
  await page.getByRole('group', { name: '十组模拟生辰' }).getByRole('button', { name: /日月同宫/ }).click();
  await page.evaluate(() => {
    const data = (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture;
    data.completeStream(); data.response = 'valid';
  });
  await expect(input).toHaveValue('');
  await expect(page.getByRole('log')).toHaveCount(0);
  await input.fill('请教我看日月同宫');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(input).toBeEnabled();
  const last = (await fixture()).payloads.at(-1)!;
  expect(last.input).toHaveLength(2);
  expect(JSON.parse(last.input[0].content.split('\n').slice(1).join('\n')).learning.caseId).toBe('riyue');
  await expect(page.getByRole('log')).not.toContainText('模型已返回完整解读');
});

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

test('AI 上下文：原生 Responses 手动提交完整上下文，选择期间不发送', async ({ page }, info) => {
  test.skip(info.project.name !== 'vite', '通过真实原生适配器检查发往 IPC 的最终请求。');
  await nativeSettings(page, false);
  await page.goto('/#/chart?y=1990&m=5&d=10&h=8&mi=0&g=m&n=原生上下文');
  const panel = page.locator('.insight-panel');
  const input = page.getByRole('textbox', { name: '命盘解读提问' });
  const send = panel.getByRole('button', { name: '提问', exact: true });
  const payload = () => page.evaluate(() => (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.payloads.at(-1)!);
  const count = () => page.evaluate(() => (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.requests);
  await expect(input).toBeEnabled();
  await page.waitForTimeout(300);
  expect(await count()).toBe(0);
  await input.fill('我应该注意哪些方面？');
  await page.getByRole('button', { name: /^大限(?: \d+–\d+)?$/ }).click();
  await page.locator('.palace-cell').first().press('Enter');
  await panel.getByRole('button', { name: '财运', exact: true }).click();
  await page.waitForTimeout(300);
  expect(await count()).toBe(0);
  await expect(input).toHaveValue('我应该注意哪些方面？');
  await panel.screenshot({ path: '.runtime/manual-question/native-before-submit.png' });
  await send.click();
  await expect.poll(count).toBe(1);
  await expect(input).toBeEnabled();
  const initialPayload = await payload();
  const initial = JSON.parse(initialPayload.input[0].content.split('\n').slice(1).join('\n'));
  expect(initial.analysis.selection).toMatchObject({ view: 'daxian', topic: 'wealth', palaceBranch: 5 });
  expect(initialPayload.input.at(-1)?.content).toContain('我应该注意哪些方面？');
  await page.getByRole('button', { name: '下一年', exact: true }).click();
  await page.getByRole('button', { name: /^流年.+化[禄权科忌]$/ }).first().press('Enter');
  await input.fill('这一年财运如何？');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await page.waitForTimeout(300);
  expect(await count()).toBe(1);
  await send.click();
  await expect.poll(count).toBe(2);
  await expect(input).toBeEnabled();
  const currentPayload = await payload();
  const current = JSON.parse(currentPayload.input[0].content.split('\n').slice(1).join('\n'));
  expect(current.analysis.selection).toMatchObject({ view: 'liunian', liunianYear: initial.analysis.selectedYear.year + 1, topic: 'wealth', palaceBranch: 5 });
  expect(current.analysis.selection.siHua.view).toBe('liunian');
  expect(current.analysis.selectedYear.palaces).toHaveLength(12);
  expect(current.analysis.currentDaXian).not.toBeNull();
  expect(current.birth).toMatchObject({ year: 1990, month: 5, day: 10, gender: 'male' });
  expect(current.references.entries.length).toBeGreaterThan(0);
  expect(JSON.stringify(current)).not.toContain('原生上下文');
  expect(currentPayload.input[1]).toEqual(initialPayload.input[1]);
  expect(currentPayload.input[2]).toEqual({ role: 'assistant', content: 'OK' });
  await page.getByRole('button', { name: '重新起盘' }).click();
  await page.goto('/#/chart?y=2000&m=1&d=31&h=23&mi=30&g=f&n=新会话');
  await expect(input).toBeEnabled();
  await expect(panel).toContainText('输入问题后，点击「提问」开始解读');
  await page.waitForTimeout(300);
  expect(await count()).toBe(2);
  await input.fill('请分析新命盘');
  await send.click();
  await expect.poll(count).toBe(3);
  await expect(input).toBeEnabled();
  const nextSession = await payload();
  expect(nextSession.input).toHaveLength(2);
  expect(nextSession.input[1].content).not.toContain('我应该注意哪些方面');
  expect(JSON.parse(nextSession.input[0].content.split('\n').slice(1).join('\n')).birth.year).toBe(2000);
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

test('原生 Responses：正文返回后等待迟到的完成分片，连续追问不追加格式错误', async ({ page }, info) => {
  test.skip(info.project.name !== 'vite', '真实原生适配器配合可控 IPC 到达顺序。');
  await nativeSettings(page, false);
  await page.evaluate(() => { (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.response = 'delayed-completion'; });
  await page.goto('/#/chart?y=2000&m=1&d=31&h=23&mi=30&g=f&n=流式回归');
  const panel = page.locator('.insight-panel');
  const followup = page.getByRole('textbox', { name: '命盘解读提问' });
  await followup.fill('请分析我的命盘');
  await panel.getByRole('button', { name: '提问', exact: true }).click();
  for (let round = 1; round <= 2; round++) {
    await expect(panel.getByText('模型已返回完整解读。请结合命盘与实际情况作判断。', { exact: true })).toHaveCount(round);
    await expect(followup).toBeDisabled();
    await page.evaluate(() => (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.completeStream());
    await expect(followup).toBeEnabled();
    await expect(panel).not.toContainText('数据格式异常');
    await expect(panel.getByText('命理解读')).toHaveCount(round);
    if (round === 1) {
      await followup.fill('请补充事业方面的建议');
      await panel.getByRole('button', { name: '提问', exact: true }).click();
    }
  }
  expect(await page.evaluate(() => (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.requests)).toBe(2);
  await panel.screenshot({ path: '.runtime/android-ai-fix/responses-completion-after.png' });
});

test('原生 Responses：通道结束后仍报告不完整回复和真实网络错误', async ({ page }, info) => {
  test.skip(info.project.name !== 'vite', '验证新增通道结束消息的成功与失败处理。');
  await nativeSettings(page, false);
  for (const [response, message] of [['incomplete', '模型响应不完整'], ['channel-error', '模型连接中断']] as const) {
    await page.evaluate(value => { (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture.response = value; }, response);
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByText(/连接成功，模型已返回有效响应/)).not.toBeVisible();
  }
});
