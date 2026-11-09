import {test,expect}from'@playwright/test';
import {createServer}from'node:http';
import {readRecord} from './fixtures/dataset';
import {generateChart} from '@ziwei/domain/ziwei/algorithm';
import {DATASET_TOPICS,datasetBirth,type DatasetRecord} from '@ziwei/domain/ziwei/dataset';
import {LEARNING_CASES} from '@ziwei/domain/ziwei/learning-cases';


test('命盘学习：Web 上游上下文、追问、换盘取消和重试', async ({ page, request }, info) => {
 test.skip(info.project.name !== 'web', '原生适配器另有学习请求用例。');
 const captured: { messages: { role: string; content: string }[] }[] = [];
 let holdNext = false;
 let failNext = false;
 let release: (() => void) | undefined;
 const server = createServer(async (req, res) => {req.setEncoding('utf8');
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); captured.push(body);
  if (failNext) { failNext = false; res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"fixture unavailable"}'); return; }
  const context = JSON.parse(body.messages[1].content.split('\n').slice(1).join('\n'));
  const reference = context.references.entries[0];
  const answer = `学习回归测试回答：${context.learning.title}。[${reference.bookTitle}·${reference.chapterTitle}](${reference.path})`;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders();
  const done = () => res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\ndata: [DONE]\n\n`);
  if (holdNext) { holdNext = false; release = done; } else done();
 });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const port = (server.address() as { port: number }).port;
 const latest = () => JSON.parse(captured.at(-1)!.messages[1].content.split('\n').slice(1).join('\n'));
 try {
  expect((await request.put('/api/settings/model', { data: {
   baseURL: `http://127.0.0.1:${port}/v1`, model: 'fixture', mode: 'chat', apiKey: 'fixture-only-key',
  } })).ok()).toBe(true);
  await page.goto('/learn');
  const panel = page.getByLabel('命盘学习问答', { exact: true });
  const input = page.getByRole('textbox', { name: '关于这张盘，你想了解什么？' });
  const send = async (question: string) => { await input.fill(question); await panel.getByRole('button', { name: '发送问题' }).click(); };
  await expect(input).toBeEnabled();
  expect(captured).toHaveLength(0);
  await send('请解释紫府同宫，并给出依据');
  await expect(panel.getByText('学习回归测试回答：紫府同宫。', { exact: false })).toBeVisible();
  expect(captured).toHaveLength(1);
  expect(latest().learning.caseId).toBe('zifu');
  expect(latest().birth).toMatchObject({ year: 1983, month: 1, day: 6 });
  expect(latest().palaces).toHaveLength(12);
  expect(latest().daXians.length).toBeGreaterThan(0);
  expect(latest().patterns.length).toBeGreaterThan(0);
  expect(latest().references.entries.length).toBeGreaterThan(0);
  expect(latest().dataset[0]).toMatchObject({key:'1983-01-06-4-male',status:'完整档案已加载'});
  expect(latest().dataset[0].topics).toHaveLength(13);
  const source=(await readRecord('1983-01-06-4-male'))!;
  for(const topic of DATASET_TOPICS)expect(latest().dataset[0].topics.find((t:{topic:string})=>t.topic===topic).text).toBe(source.c[topic]);
  await expect(panel.getByLabel('本次档案资料')).toContainText('已加载 13/13 个专题');
  await expect(panel.locator('a[href^="/library/"]').first()).toBeVisible();
  const year = latest().analysis.selectedYear.year;
  await page.getByRole('button', { name: '下一年', exact: true }).click();
  await page.locator('.palace-cell').first().press('Enter');
  await send('这一年所选宫位有什么变化？');
  await expect(input).toBeEnabled();
  expect(captured).toHaveLength(2);
  expect(latest().analysis.selection).toMatchObject({ view: 'liunian', liunianYear: year + 1, palaceBranch: 5 });
  expect(captured[1].messages.some(m => m.content.includes('提问时的视图：本命'))).toBe(true);
  expect(captured[1].messages.at(-1)!.content).toContain(`${year + 1} 年流年`);
  holdNext = true;
  await send('这是旧盘的未完成问题');
  await expect.poll(() => captured.length).toBe(3);
  await page.getByRole('group', { name: '十组模拟生辰' }).getByRole('button', { name: /空宫借星/ }).click();
  release?.();
  await expect(input).toBeEnabled();
  await expect(panel.getByRole('log')).toHaveCount(0);
  await expect(page.getByLabel('学习提问范围')).toHaveText('空宫借星 · 本命');
  await send('空宫应当怎样借星？');
  await expect(input).toBeEnabled();
  expect(captured).toHaveLength(4);
  expect(latest().learning.caseId).toBe('empty');
  expect(latest().birth).toMatchObject({ year: 1986, month: 1, day: 6 });
  expect(captured[3].messages).toHaveLength(3);
  await expect(panel.getByRole('log')).not.toContainText('学习回归测试回答：紫府同宫');
  holdNext = true;
  await send('这次问题会主动停止');
  await expect.poll(() => captured.length).toBe(5);
  await panel.getByRole('button', { name: '停止生成' }).click();
  release?.();
  await expect(input).toBeEnabled();
  await expect(panel.getByRole('log')).toContainText('已停止生成');
  failNext = true;
  await send('请再次解释借星');
  await expect(panel.getByRole('alert')).toBeVisible();
  await panel.getByRole('button', { name: '重试本题' }).click();
  await expect(panel.getByRole('alert')).not.toBeVisible();
  await expect(input).toBeEnabled();
  expect(captured).toHaveLength(7);
  expect(captured[6].messages.slice(2).map(m => m.content).join('\n')).not.toContain('这次问题会主动停止');
 } finally {
  release?.(); await request.delete('/api/settings/model'); server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
 }
});

test('AI 上下文：选择不自动提问，手动请求携带完整会话、资料及选择', async ({ page, request }, info) => {
 test.skip(info.project.name !== 'web', '原生请求由 Responses 用例覆盖。');
 const captured: { messages: { role: string; content: string }[] }[] = [];
 let holdNext = false;
 let release: (() => void) | undefined;
 const server = createServer(async (req, res) => {req.setEncoding('utf8');
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); captured.push(body);
  const context = JSON.parse(body.messages[1].content.split('\n').slice(1).join('\n'));
  const reference = context.references.entries[0];
  const answer = `上下文已验证。[${reference.bookTitle}·${reference.chapterTitle}](${reference.path})`;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const done = () => res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\ndata: [DONE]\n\n`);
  if (holdNext) { holdNext = false; release = done; } else done();
 });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const port = (server.address() as { port: number }).port;
 const latest = () => JSON.parse(captured.at(-1)!.messages[1].content.split('\n').slice(1).join('\n'));
 const expectNoNewRequests = async (count: number) => {
  // 留出 React effect 和网络调度时间，捕获延迟触发的自动提问。
  await page.waitForTimeout(300);
  expect(captured).toHaveLength(count);
 };
 try {
  expect((await request.put('/api/settings/model', { data: {
   baseURL: `http://127.0.0.1:${port}/v1`, model: 'fixture', mode: 'chat', apiKey: 'fixture-only-key',
  } })).ok()).toBe(true);
  await page.goto('/chart?y=1990&m=5&d=10&h=8&mi=0&g=m&n=上下文测试');
  const panel = page.locator('.insight-panel');
  const input = page.getByRole('textbox', { name: '命盘解读提问' });
  const send = panel.getByRole('button', { name: '提问', exact: true });
  await expect(input).toBeEnabled();
  await expect(send).toBeDisabled();
  await expect(panel).toContainText('输入问题后，点击「提问」开始解读');
  await expectNoNewRequests(0);
  await input.fill('   ');
  await input.press('Enter');
  await expect(send).toBeDisabled();
  const firstQuestion = '结合这些选择，我应该注意哪些方面？';
  await input.fill(firstQuestion);
  for (const topic of ['命格', '感情', '事业', '财运', '健康', '性格']) {
   await panel.getByRole('button', { name: topic, exact: true }).click();
  }
  for (const suggestion of await panel.locator('.insight-prompts button').all()) await suggestion.click();
  await panel.getByRole('button', { name: '财运', exact: true }).click();
  await expect(panel.getByRole('button', { name: '财运', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const palace = page.locator('.palace-cell').first();
  await palace.press('Enter');
  await page.getByRole('button', { name: '流年', exact: true }).click();
  await page.getByRole('button', { name: '本命', exact: true }).click();
  await page.getByRole('button', { name: /^大限(?: \d+–\d+)?$/ }).click();
  await expect(input).toHaveValue(firstQuestion);
  await expectNoNewRequests(0);
  await panel.screenshot({ path: '.runtime/manual-question/web-before-submit.png' });
  await send.click();
  await expect.poll(() => captured.length).toBe(1);
  await expect(input).toBeEnabled();
  expect(latest().analysis.selection).toMatchObject({ view: 'daxian', topic: 'wealth', palaceBranch: 5 });
  expect(latest().birth).toMatchObject({ year: 1990, month: 5, day: 10, gender: 'male', originalClock: { hour: 8, minute: 0 } });
  expect(latest().palaces).toHaveLength(12);
  expect(latest().daXians.length).toBeGreaterThan(0);
  expect(latest().lunarInfo.fourPillars).toHaveLength(4);
  expect(latest().patterns.some((p: { conditions: unknown }) => p.conditions)).toBe(true);
  expect(latest().references.entries.length).toBeGreaterThan(0);
  expect(captured[0].messages[1].content).not.toContain('上下文测试');
  expect(captured[0].messages).toHaveLength(3);
  expect(captured[0].messages.at(-1)!.content).toContain(firstQuestion);
  const year = latest().analysis.selectedYear.year;
  for (let offset = 1; offset <= 2; offset++) {
   await page.getByRole('button', { name: '下一年', exact: true }).click();
   await expect(page.getByLabel('当前解读范围')).toContainText(`${year + offset} 年流年`);
   await expectNoNewRequests(offset);
   await input.fill('这一年的事业如何？');
   await send.click();
   await expect.poll(() => captured.length).toBe(offset + 1);
   await expect(input).toBeEnabled();
   expect(latest().analysis.selection).toMatchObject({ view: 'liunian', liunianYear: year + offset, topic: 'wealth' });
   expect(latest().analysis.selectedYear.palaces).toHaveLength(12);
   expect(latest().analysis.selectedYear.siHuaOverlay.stars).toHaveLength(4);
  }
  expect(captured[2].messages.some(m => m.role === 'user' && m.content.includes(`提问时的视图：${year + 1} 年流年`))).toBe(true);
  const transformation = page.getByRole('button', { name: /^流年.+化[禄权科忌]$/ }).first();
  const transformationLabel = (await transformation.getAttribute('aria-label'))!.slice(2);
  await transformation.press('Enter');
  await expect(page.getByLabel('当前解读范围')).toContainText(transformationLabel);
  await input.fill('所选的四化有哪些影响？');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 });
  await input.press('Shift+Enter');
  await expectNoNewRequests(3);
  // 连续回车只发一次；回答期间的修改留给下一次手动提问。
  holdNext = true;
  await input.press('Enter');
  await input.press('Enter');
  await expect.poll(() => captured.length).toBe(4);
  await expect(input).toBeDisabled();
  expect(latest().analysis.selection.siHua.view).toBe('liunian');
  expect(captured[3].messages.at(-1)!.content).toContain(transformationLabel);
  const nextPalace = page.locator('.palace-cell').nth(1);
  await nextPalace.press('Enter');
  await page.getByRole('button', { name: '上一年', exact: true }).click();
  await panel.getByRole('button', { name: '健康', exact: true }).click();
  await expectNoNewRequests(4);
  release!();
  await expect(input).toBeEnabled();
  await expectNoNewRequests(4);
  await input.fill('请结合刚刚修改的选择补充建议');
  await send.click();
  await expect.poll(() => captured.length).toBe(5);
  await expect(input).toBeEnabled();
  expect(latest().analysis.selection).toMatchObject({ palaceBranch: 6, liunianYear: year + 1, topic: 'health' });
  expect(latest().analysis.selection.siHua).toBeUndefined();
  expect(captured[4].messages[2]).toEqual(captured[0].messages[2]);
  expect(captured[4].messages[8]).toEqual(captured[3].messages.at(-1));
  await nextPalace.press('Enter');
  await expect(page.getByLabel('当前解读范围')).toHaveText(`当前选择：${year + 1} 年流年 · 主题：健康`);
  await expectNoNewRequests(5);
  for (let round = 6; round <= 12; round++) {
   await input.fill(`请继续说明，第 ${round} 次提问`);
   await send.click();
   await expect.poll(() => captured.length).toBe(round);
   await expect(input).toBeEnabled();
  }
  expect(captured[11].messages).toHaveLength(25);
  expect(captured[11].messages[2]).toEqual(captured[0].messages[2]);
  expect(captured[11].messages.filter(m => m.role === 'assistant')).toHaveLength(11);
  expect(latest().analysis.selection.palaceBranch).toBeUndefined();
  await panel.screenshot({ path: '.runtime/manual-question/web-conversation.png' });
  const link = panel.locator('a[href^="/library/"]').last();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(url => url.pathname + url.hash === href);
  await expect(page.locator(href!.slice(href!.indexOf('#')))).toBeVisible();
 } finally {
  release?.();
  await request.delete('/api/settings/model');
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
 }
});

test('Web API: H2 原始时间、密钥遮罩/保留/清除、双协议实际流',async({request},info)=>{
 test.skip(info.project.name!=='web','原生服务由 Rust 集成测试验证。');
 const server=createServer(async(req,res)=>{req.setEncoding('utf8');let text='';for await(const chunk of req)text+=chunk;const data=JSON.parse(text);expect(req.headers.authorization).toBe('Bearer fixture-only-key');res.writeHead(200,{'Content-Type':'text/event-stream'});if(req.url?.endsWith('/responses')){expect(data.store).toBe(false);res.write('data: {"type":"response.output_text.delta","delta":"紫微"}\n\n');setTimeout(()=>res.end('data: {"type":"response.output_text.delta","delta":"斗数"}\n\ndata: {"type":"response.completed"}\n\n'),80);}else{res.write('data: {"choices":[{"delta":{"content":"紫微"}}]}\n\n');setTimeout(()=>res.end('data: {"choices":[{"delta":{"content":"斗数"}}]}\n\ndata: [DONE]\n\n'),80);}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address()as{port:number}).port;
 try{
  const form={name:'API 测试',year:'2000',month:'1',day:'31',clockHour:'23',clockMinute:'30',unknownTime:false,province:'',city:'',longitude:120,gender:'female'};
  const saved=await(await request.post('/api/profiles',{data:form})).json();expect(saved.profile.form.day).toBe('31');const loaded=await(await request.get(`/api/profiles/${saved.profile.id}`)).json();expect(loaded.profile.form.clockHour).toBe('23');expect((await request.delete(`/api/profiles/${saved.profile.id}`)).ok()).toBe(true);
  for(const mode of ['chat','responses']){
   const draft={baseURL:`http://127.0.0.1:${port}/v1`,model:'fixture',mode,apiKey:'fixture-only-key'};
   const result=await request.put('/api/settings/model',{data:draft});expect(result.ok()).toBe(true);const publicConfig=await(await request.get('/api/settings/model')).json();expect(publicConfig.settings.apiKey).toBe('');expect(publicConfig.settings.hasApiKey).toBe(true);
   const preserved=await request.put('/api/settings/model',{data:{...draft,apiKey:''}});expect(preserved.ok()).toBe(true);
   const tested=await request.post('/api/settings/model/test',{data:{...draft,apiKey:''}});expect(tested.ok()).toBe(true);
  }
  expect((await request.delete('/api/settings/model',{headers:{Origin:'https://external.example'}})).status()).toBe(403);
  expect((await request.delete('/api/settings/model')).ok()).toBe(true);const cleared=await(await request.get('/api/settings/model')).json();expect(cleared.settings.hasApiKey).toBe(false);expect(cleared.settings.configured).toBe(false);expect(cleared.settings.apiKey).toBe('');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('完整档案：Web 双协议原样传输单盘、学习、合盘和长历史',async({request},info)=>{
 test.skip(info.project.name!=='web','原生由 IPC 与 Rust 请求测试覆盖。');
 const records=await Promise.all(['1990-02-06-11-male','1983-01-06-4-male'].map(key=>readRecord(key))) as DatasetRecord[];
 const chart=generateChart(datasetBirth(records[0].k)),learningChart=generateChart({...LEARNING_CASES[0].birth});
 type Payload={messages?:{role:string;content:string}[];input?:{role:string;content:string}[];max_tokens?:number;max_completion_tokens?:number;max_output_tokens?:number};
 const captured:Payload[]=[];
 const sizes:number[]=[];
 const server=createServer(async(req,res)=>{req.setEncoding('utf8');
  let raw='';for await(const chunk of req)raw+=chunk;sizes.push(Buffer.byteLength(raw));captured.push(JSON.parse(raw));
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end(req.url?.endsWith('/responses')?'data: {"type":"response.output_text.delta","delta":"完整测试"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n':'data: {"choices":[{"delta":{"content":"完整测试"}}]}\n\ndata: [DONE]\n\n');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const baseURL=`http://127.0.0.1:${(server.address()as{port:number}).port}/v1`;
 const history=[{role:'user',content:'最早的问题与条件。'},{role:'assistant',content:'完整历史条件与例外。'.repeat(12000)}];
 try{
  for(const mode of ['chat','responses'] as const){
   for(const kind of ['interpret','learning','heming'] as const){
    const quota=kind==='interpret'?undefined:32768;
    expect((await request.put('/api/settings/model',{data:{baseURL,model:'fixture',mode,apiKey:'fixture-only-key',maxOutputTokens:quota,requestTimeoutSeconds:900}})).ok()).toBe(true);
    const question='请保留全部条件与例外。'.repeat(500);
    const body=kind==='heming'?{chartA:chart,chartB:learningChart,question,messages:history}:{chart:kind==='learning'?learningChart:chart,...(kind==='learning'?{learningCaseId:LEARNING_CASES[0].id}:{}),messages:[...history,{role:'user',content:question}]};
    const response=await request.post(`/api/${kind==='heming'?'heming':'interpret'}`,{data:body});
    expect(response.ok()).toBe(true);const streamed=await response.text();expect(streamed).toContain('[DONE]');expect(streamed).toContain('"type":"dataset"');
    const sent=captured.at(-1)!;const messages=mode==='chat'?sent.messages!:sent.input!;
    const context=JSON.parse(messages[mode==='chat'?1:0].content.split('\n').slice(1).join('\n'));
    const expected=kind==='heming'?records:kind==='learning'?[records[1]]:[records[0]];
    expect(context.dataset).toHaveLength(expected.length);
    expected.forEach((record,index)=>{
     const actual=context.dataset[index];expect(actual.key).toBe(record.k);expect(actual.topics).toHaveLength(13);
     expect(actual.integrity.complete).toBe(true);expect(actual.integrity.injectedCharacters).toBe(actual.integrity.sourceCharacters);
     expect(actual.topics.map((t:{topic:string})=>t.topic)).toEqual(DATASET_TOPICS);
     for(const topic of DATASET_TOPICS)expect(actual.topics.find((t:{topic:string})=>t.topic===topic).text).toBe(record.c[topic]);
    });
    if(kind==='heming')expect(context.dataset.map((r:{person:string})=>r.person)).toEqual(['甲方','乙方']);
    expect(messages.slice(mode==='chat'?2:1)).toEqual([...history,{role:'user',content:question}]);
    expect(sizes.at(-1)).toBeGreaterThan(262144);
    expect(sent[mode==='chat'?'max_completion_tokens':'max_output_tokens']).toBe(quota);expect(sent.max_tokens).toBeUndefined();
    expect(sent[mode==='chat'?'max_output_tokens':'max_completion_tokens']).toBeUndefined();
   }
  }
 }finally{await request.delete('/api/settings/model');server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('完整档案：Web 区分资源容量、模型窗口、输出设置及超时，不裁剪重试',async({request},info)=>{
 test.skip(info.project.name!=='web','原生传输错误另由 Rust 覆盖。');
 let calls=0;let failure='context';
 const timers:ReturnType<typeof setTimeout>[]=[];
 const server=createServer(async(req,res)=>{req.setEncoding('utf8');
  for await(const _ of req){/* drain the complete request */}calls++;
  if(failure==='timeout'){timers.push(setTimeout(()=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: [DONE]\n\n');},1500));return;}
  res.writeHead(failure==='size'?413:400,{'Content-Type':'application/json'});
  res.end(JSON.stringify({error:{code:failure==='context'?'context_length_exceeded':'unsupported_parameter',param:failure==='output'?'max_output_tokens':undefined,message:'fixture-private-text'}}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const draft={baseURL:`http://127.0.0.1:${(server.address()as{port:number}).port}/v1`,model:'fixture',mode:'chat',apiKey:'fixture-only-key'};
 const body={chart:generateChart(datasetBirth('1990-02-06-11-male')),messages:[{role:'user',content:'完整原文请求'}]};
 try{
  const finalLimit=Buffer.byteLength(JSON.stringify(body))+1024;
  await request.put('/api/settings/model',{data:{...draft,maxRequestBytes:finalLimit}});
  const oversized=await request.post('/api/interpret',{data:body});expect(oversized.status()).toBe(413);
  const detail=await oversized.json();expect(detail.error).toContain('完整资料未裁剪');expect(detail.dataset[0].integrity.complete).toBe(true);expect(calls).toBe(0);
  await request.put('/api/settings/model',{data:{...draft,maxRequestBytes:1024}});
  expect((await request.post('/api/interpret',{data:body})).status()).toBe(413);expect(calls).toBe(0);
  for(const [kind,message] of [['context','上下文容量不足'],['output','输出 token 配置不兼容'],['size','请求体大小'],['timeout','超时']] as const){
   failure=kind;
   await request.put('/api/settings/model',{data:{...draft,...(kind==='timeout'?{requestTimeoutSeconds:1}:{})}});
   const result=await request.post('/api/interpret',{data:body});expect(result.status()).toBe(kind==='timeout'?504:502);
   const data=await result.json();expect(data.error).toContain(message);expect(data.error).not.toContain('fixture-private-text');expect(data.dataset[0].integrity.complete).toBe(true);
  }
  expect(calls,'capacity failures never send shortened retry requests').toBe(4);
 }finally{timers.forEach(clearTimeout);await request.delete('/api/settings/model');server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('完整档案：Web 保留长问题并标记输出中断，模型额度可保存和清空',async({page,request},info)=>{
 test.skip(info.project.name!=='web','原生配置与状态由隔离 IPC 用例覆盖。');
 let outcome='context';
 const payloads:{messages:{role:string;content:string}[]}[]=[];
 const server=createServer(async(req,res)=>{req.setEncoding('utf8');
  let raw='';for await(const chunk of req)raw+=chunk;payloads.push(JSON.parse(raw));
  if(outcome==='context'){res.writeHead(400,{'Content-Type':'application/json'});res.end('{"error":{"code":"context_length_exceeded"}}');return;}
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end(outcome==='partial'?'data: {"choices":[{"delta":{"content":"仍未完成的部分回答"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n':'data: {"choices":[{"delta":{"content":"完成回答"}}]}\n\ndata: [DONE]\n\n');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await request.put('/api/settings/model',{data:{baseURL:`http://127.0.0.1:${(server.address()as{port:number}).port}/v1`,model:'fixture',mode:'chat',apiKey:'fixture-only-key'}});
  await page.goto('/chart?y=1990&m=2&d=6&h=22&mi=0&g=m');
  const panel=page.locator('.insight-panel'),input=page.getByRole('textbox',{name:'命盘解读提问'});
  const question='条件、例外和历史说明都需要保留。'.repeat(1000);
  await input.fill(question);await panel.getByRole('button',{name:'提问',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('上下文容量不足');await expect(input).toHaveValue(question);
  await expect(panel.getByLabel('本次档案资料')).toContainText('已加载 13/13 个专题');
  outcome='partial';await panel.getByRole('button',{name:'提问',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('输出额度');await expect(panel).toContainText('回答未完成');await expect(input).toHaveValue(question);
  outcome='complete';await panel.getByRole('button',{name:'提问',exact:true}).click();await expect(input).toBeEnabled();
  expect(payloads.at(-1)!.messages.filter(m=>m.role==='assistant'),'incomplete answers must not become model history').toHaveLength(0);
  await page.goto('/settings/model');
  await page.getByLabel('输出 token 额度',{exact:true}).fill('32768');await page.getByLabel('解读超时（秒）',{exact:true}).fill('900');await page.getByLabel('请求容量（MiB）',{exact:true}).fill('32');
  await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.getByText('配置已保存，新的 AI 解读与合盘分析将立即使用此配置。',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByLabel('输出 token 额度',{exact:true})).toHaveValue('32768');await expect(page.getByLabel('解读超时（秒）',{exact:true})).toHaveValue('900');await expect(page.getByLabel('请求容量（MiB）',{exact:true})).toHaveValue('32');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.runtime/full-context/web-model-settings-mobile.png',fullPage:true});
  for(const name of ['输出 token 额度','解读超时（秒）','请求容量（MiB）'])await page.getByLabel(name,{exact:true}).fill('');
  await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.getByText('配置已保存，新的 AI 解读与合盘分析将立即使用此配置。',{exact:true})).toBeVisible();
  const settings=(await(await request.get('/api/settings/model')).json()).settings;
  expect(settings.maxOutputTokens).toBeUndefined();expect(settings.requestTimeoutSeconds).toBeUndefined();expect(settings.maxRequestBytes).toBeUndefined();
 }finally{await request.delete('/api/settings/model');server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
