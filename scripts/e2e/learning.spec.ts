import { test, expect } from '@playwright/test';
import { LEARNING_CASES } from '@ziwei/domain/ziwei/learning-cases';
import { SHICHEN } from '@ziwei/domain/ziwei/constants';

test('命盘学习：十组生辰切换、入口和桌面手机布局', async ({ page }, info) => {
  const native = info.project.name === 'vite';
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.clock.setFixedTime(new Date('2032-06-01T04:00:00Z'));
  let aiRequests = 0;
  page.on('request', request => { if (request.url().includes('/api/interpret')) aiRequests++; });
  await page.goto(native ? '/#/' : '/');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '命盘学习', exact: true }).click();
  await expect(page.getByRole('heading', { name: '命盘学习', exact: true })).toBeVisible();
  const cases = page.getByRole('group', { name: '十组模拟生辰' });
  await expect(cases.getByRole('button')).toHaveCount(10);
  for (const lesson of LEARNING_CASES) {
    await cases.getByRole('button', { name: new RegExp(lesson.title) }).click();
    await expect(cases.getByRole('button', { pressed: true })).toContainText(lesson.title);
    await expect(page.getByLabel('模拟生辰', { exact: true })).toContainText(`公历 ${lesson.birth.year} 年 ${lesson.birth.month} 月 ${lesson.birth.day} 日 · ${SHICHEN[lesson.birth.hour].name}`);
    await expect(page.locator('.palace-cell')).toHaveCount(12);
    await expect(page.getByLabel('学习提问范围')).toHaveText(`${lesson.title} · 本命`);
    await expect(page.locator('.learn-recommendations')).not.toHaveAttribute('open');
    await expect(page.getByLabel('推荐学习问题').getByRole('button').first()).not.toBeVisible();
  }
  await cases.getByRole('button', { name: /紫府同宫/ }).click();
  await expect(page.locator('.chart-time-nav')).toContainText('2032');
  expect(pageErrors).toEqual([]);
  await page.clock.setFixedTime(new Date());
  await page.reload();
  await expect(cases.getByRole('button', { pressed: true })).toContainText('紫府同宫');
  const chart = await page.getByLabel('模拟命盘', { exact: true }).boundingBox();
  const chat = await page.getByLabel('命盘学习问答', { exact: true }).boundingBox();
  expect(chart!.x + chart!.width).toBeLessThan(chat!.x);
  await expect(page.getByRole('button', { name: '发送问题' })).toBeInViewport();
  await page.screenshot({ path: `.runtime/learning/${info.project.name}-desktop.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /切换.*色主题/ }).click();
  await page.screenshot({ path: `.runtime/learning/${info.project.name}-desktop-alternate.png`, fullPage: true, animations: 'disabled' });
  await page.locator('.learn-recommendations > summary').click();
  await expect(page.getByLabel('推荐学习问题').getByRole('button')).toHaveCount(3);
  expect(await page.locator('.learn-recommendations').evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  expect(await page.locator('.learn-chat').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.getByLabel('推荐学习问题').getByRole('button').first().click();
  await expect(page.getByRole('textbox', { name: '关于这张盘，你想了解什么？' })).toHaveValue(LEARNING_CASES[0].questions[0]);
  expect(aiRequests).toBe(0);
  await cases.getByRole('button', { name: /空宫借星/ }).click();
  await expect(page.getByRole('textbox', { name: '关于这张盘，你想了解什么？' })).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  // Read both regions in one frame: the chart height transitions during a viewport resize.
  await expect.poll(() => page.locator('.learn-layout').evaluate(layout => {
    const chart = layout.querySelector('[aria-label="模拟命盘"]')!.getBoundingClientRect();
    const chat = layout.querySelector('[aria-label="命盘学习问答"]')!.getBoundingClientRect();
    return chat.top - chart.bottom;
  })).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.learn-recommendations')).not.toHaveAttribute('open');
  await page.screenshot({ path: `.runtime/learning/${info.project.name}-mobile.png`, fullPage: true, animations: 'disabled' });
  await page.locator('.learn-recommendations > summary').click();
  expect(await page.locator('.learn-recommendations').evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  expect(await page.locator('.learn-chat').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.locator('.learn-recommendations > summary').click();
  await expect(page.getByLabel('推荐学习问题').getByRole('button').first()).not.toBeVisible();
  await page.getByRole('textbox', { name: '关于这张盘，你想了解什么？' }).fill('空宫应该怎样借星？');
  await expect(page.getByRole('button', { name: '发送问题' })).toBeEnabled();
  expect(aiRequests).toBe(0);
});

test('命盘学习：长回答自适应、展开阅读与草稿保留', async ({ page }, info) => {
  test.skip(info.project.name !== 'web', '通过 Web 请求夹具验证共享问答组件。');
  let requests = 0;
  const answer = Array.from({ length: 20 }, (_, index) =>
    `**【第 ${index + 1} 步：观察宫位与星曜】**\n先确认命宫实坐的主星，再观察三方四正。结合当前所选宫位，区分盘面事实与传统解读。\n`
  ).join('\n');
  await page.route('**/api/interpret', route => {
    requests++;
    return route.fulfill({ contentType: 'text/event-stream', body:
      `data: ${JSON.stringify({ delta: { text: answer } })}\n\ndata: [DONE]\n\n`,
    });
  });
  await page.setViewportSize({ width: 1512, height: 784 });
  await page.goto('/learn');
  const input = page.getByRole('textbox', { name: '关于这张盘，你想了解什么？' });
  await input.fill('请逐步讲解这张盘。');
  await page.getByRole('button', { name: '发送问题' }).click();
  const log = page.getByRole('log', { name: '学习对话' });
  await expect(log).toContainText('第 20 步');
  await expect(input).toBeEnabled();
  await input.fill('保留这段尚未发送的追问');
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
  await expect.poll(() => log.evaluate(element => element.clientHeight)).toBeGreaterThan(280);
  const sidebar = await page.getByLabel('命盘学习问答', { exact: true }).boundingBox();
  expect(sidebar!.width).toBeGreaterThan(480);
  await expect(page.getByRole('button', { name: '发送问题' })).toBeInViewport();

  const expand = page.getByRole('button', { name: '展开阅读', exact: true });
  await log.evaluate(element => { element.scrollTop = (element.scrollHeight - element.clientHeight) * .4; });
  await expand.click();
  const reader = page.getByRole('dialog', { name: '展开阅读命盘问答' });
  await expect(reader).toBeVisible();
  expect((await reader.boundingBox())!.width).toBeGreaterThan(sidebar!.width * 1.5);
  expect(await log.evaluate(element => element.scrollTop / (element.scrollHeight - element.clientHeight))).toBeCloseTo(.4, 2);
  await expect(input).toHaveValue('保留这段尚未发送的追问');
  await expect(page.getByRole('button', { name: '收起阅读' })).toBeFocused();
  await log.getByRole('heading', { name: '第 1 步：观察宫位与星曜', exact: true }).scrollIntoViewIfNeeded();
  await expect(log.getByRole('heading', { name: '第 1 步：观察宫位与星曜', exact: true })).toBeInViewport();
  await log.getByRole('heading', { name: '第 20 步：观察宫位与星曜', exact: true }).scrollIntoViewIfNeeded();
  await expect(log.getByRole('heading', { name: '第 20 步：观察宫位与星曜', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(expand).toBeFocused();
  await expect(input).toHaveValue('保留这段尚未发送的追问');
  expect(requests).toBe(1);

  await page.setViewportSize({ width: 390, height: 844 });
  // On a phone the conversation grows with the page, so a long answer has no nested viewport.
  expect(await log.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expand.click();
  await expect(reader).toBeVisible();
  expect((await reader.boundingBox())!.width).toBe(390);
  await expect(page.getByRole('button', { name: '发送问题' })).toBeInViewport();
  await page.getByRole('button', { name: '收起阅读' }).click();
  await expect(reader).toHaveCount(0);
  await expect(input).toHaveValue('保留这段尚未发送的追问');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect(requests).toBe(1);
});
