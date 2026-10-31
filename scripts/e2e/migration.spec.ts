import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {ALL_BOOKS} from '@ziwei/content/classics';
const routes=['/','/qipan','/chart','/heming','/profiles','/settings/model','/knowledge','/library','/library/search?q=紫微','/privacy','/terms','/preview'];
const chart='/chart?y=2000&m=1&d=31&h=23&mi=30&g=f&n=迁移测试';
function url(route:string,native:boolean){return native?`/#${route}`:route;}
for(const theme of ['dark','light'])test(`${theme}: 完整路由、两种尺寸与截图`,async({page},info)=>{
 const native=info.project.name==='vite';test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(value=>localStorage.setItem('ziwei-theme',value),theme);
 const dir=path.resolve('.runtime/tauri-review/after');await mkdir(dir,{recursive:true});
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  for(const route of routes){
   await page.goto(url(route,native));await expect(page.locator('h1').first()).toBeVisible();
   await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
   await page.waitForTimeout(1100);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),`${route} width=${width}`).toBe(true);
   if(['/','/chart','/profiles','/settings/model','/library'].includes(route))await page.screenshot({path:path.join(dir,`${info.project.name}-${theme}-${width}-${route.replaceAll('/','_')||'home'}.png`),fullPage:true});
  }
  await page.goto(url(chart,native));await expect(page.getByRole('button',{name:'分享命盘',exact:true})).toBeVisible();
  await page.waitForTimeout(1400);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`命盘 ${width}`).toBe(true);
  await page.screenshot({path:path.join(dir,`${info.project.name}-${theme}-${width}-chart-generated.png`),fullPage:true});
 }
 expect(errors).toEqual([]);
});
test('全部古籍章节、检索、主题切换、分享与返回',async({page},info)=>{
 const native=info.project.name==='vite';test.setTimeout(180000);
 for(const book of ALL_BOOKS){for(let index=0;index<book.chapters.length;index++){
  await page.goto(url(`/library/${book.slug}/${index}`,native));await expect(page.locator('h1')).toBeVisible();await expect(page.getByText(book.chapters[index].title,{exact:true}).last()).toBeVisible();
 }}
 await page.goto(url('/library/search?q=紫微',native));await expect(page.locator('h1')).toContainText('紫微');
 await page.goto(url(chart,native));await page.getByRole('button',{name:'分享命盘',exact:true}).click();await expect(page.getByRole('dialog',{name:'分享命盘'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'分享命盘'})).not.toBeVisible();
 const current=await page.locator('html').getAttribute('data-theme');await page.getByRole('button',{name:current==='dark'?'切换亮色主题':'切换暗色主题'}).click();await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',current==='dark'?'light':'dark');
 await page.goto(url('/chart',native));await page.getByText('从分享链接起盘',{exact:true}).click();await page.getByLabel('粘贴命盘分享链接').fill(`https://ziwei.example${chart}`);await page.getByRole('button',{name:'导入起盘',exact:true}).click();await expect(page.getByRole('heading',{name:'迁移测试的紫微命盘'})).toBeVisible();
});
test('五种视口命盘没有页面横向溢出',async({page},info)=>{
 for(const width of [360,390,768,1024,1440]){await page.setViewportSize({width,height:960});await page.goto(url(chart,info.project.name==='vite'));await expect(page.getByRole('button',{name:'分享命盘',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),String(width)).toBe(true);}
});
