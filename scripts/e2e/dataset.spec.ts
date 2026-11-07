import {test,expect} from '@playwright/test';
test.beforeEach(({},info)=>test.skip(info.project.name!=='web','原生读取由 Rust 实际压缩文件测试覆盖。'));
test('压缩资料读取、笔记、练习、检索和移动布局',async({page,request})=>{
 const result=await request.get('/api/dataset?key=1990-02-06-11-male');expect(result.ok()).toBeTruthy();const record=(await result.json()).record;expect(record.ms).toBe('天同');expect(Object.keys(record.c)).toHaveLength(13);
 expect((await request.get('/api/dataset?key=1990-02-30-0-male')).status()).toBe(400);
 let modelCalls=0;page.on('request',r=>{if(r.url().includes('/api/interpret'))modelCalls++;});
 await page.goto('/dataset?key=1990-02-06-11-male&topic=career');
 await expect(page.getByText('当前显示', {exact:false})).toBeVisible();
 await page.getByLabel('我的学习笔记').fill('先核对四化来源与当前亮度');await page.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(page.getByText('笔记已保存在本机。')).toBeVisible();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'导出阅读笔记',exact:true}).click();expect((await downloaded).suggestedFilename()).toContain('1990-02-06');
  await page.getByRole('button',{name:'练习与课程',exact:true}).click();await page.getByRole('button',{name:'核对答案',exact:true}).first().click();await expect(page.locator('.dataset-exercise').first().getByText('天同',{exact:true})).toBeVisible();await page.getByRole('button',{name:'已掌握',exact:true}).click();
 await page.getByRole('button',{name:'资料检查',exact:true}).click();await expect(page.getByText('当前亮度：天同（平）')).toBeVisible();await expect(page.getByText('77 年 / 674,976 条', {exact:false})).toBeVisible();
 await page.getByRole('button',{name:'找盘与检索',exact:true}).click();await page.getByRole('button',{name:'检索资料',exact:true}).click();await expect(page.getByText('本批扫描',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'对照学习',exact:true}).click();await page.getByRole('button',{name:'同生辰切换性别',exact:true}).click();await expect(page.getByText('甲方：1990-02-06-11-male；乙方：1990-02-06-11-female')).toBeVisible();
 expect(modelCalls).toBe(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('知识专题入口包含基础星义、真实案例和古籍',async({page})=>{
 await page.goto('/knowledge/tiantong/career');await expect(page.getByRole('heading',{name:'天同 · 事业职业'})).toBeVisible();await expect(page.getByText('可核验的古籍条目')).toBeVisible();await expect(page.locator('.dataset-page details').first()).toBeVisible();
});
