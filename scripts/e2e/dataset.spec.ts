import {test,expect} from '@playwright/test';
test.beforeEach(({},info)=>test.skip(info.project.name!=='web','原生读取由 Rust 实际压缩文件测试覆盖。'));
test('压缩资料读取和生辰校验',async({request})=>{
 const result=await request.get('/api/dataset?key=1990-02-06-11-male');expect(result.ok()).toBeTruthy();const record=(await result.json()).record;expect(record.ms).toBe('天同');expect(Object.keys(record.c)).toHaveLength(13);
 expect((await request.get('/api/dataset?key=1990-02-30-0-male')).status()).toBe(400);
});
test('知识专题入口包含基础星义、真实案例和古籍',async({page})=>{
 await page.goto('/knowledge/tiantong/career');await expect(page.getByRole('heading',{name:'天同 · 事业职业'})).toBeVisible();await expect(page.getByText('可核验的古籍条目')).toBeVisible();await expect(page.locator('.knowledge-detail details').first()).toBeVisible();
});
