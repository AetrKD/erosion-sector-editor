import {test,expect} from '@playwright/test';
const errors=new Map();
test.beforeEach(async({page})=>{errors.set(page,[]);page.on('pageerror',e=>errors.get(page).push(e.message));await page.goto('/');await page.waitForFunction(()=>!!globalThis.EROSIONSECTOR_EDITOR);await page.locator('[data-action=welcome-sample]').click();});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
test('navigation follows stage name and preview owns the right half only in tile placement',async({page})=>{
 const heading=await page.locator('.project-bar').boundingBox(),nav=await page.locator('.section-nav').boundingBox();expect(nav.y).toBeGreaterThanOrEqual(heading.y+heading.height-1);
 await expect(page.locator('.app-footer,[data-action=simulate],.shortcut-hint,.library-footer,.inspector-footer')).toHaveCount(0);
 await page.locator('[data-action=preview]').click();const map=await page.locator('#canvasWrap').boundingBox(),preview=await page.locator('#tilePreviewPanel').boundingBox();expect(preview.x).toBeGreaterThan(map.x);expect(Math.abs(preview.width-map.width)).toBeLessThan(3);
 for(const section of ['events','resources','variables','enemies','goals']){await page.locator('[data-section='+section+']').click();await expect(page.locator('#tilePreviewPanel')).toBeHidden();await expect(page.locator('.editor')).not.toHaveClass(/split-preview/);}
 await page.locator('[data-section=tiles]').click();await expect(page.locator('#tilePreviewPanel')).toBeVisible();await page.screenshot({path:'artifacts/usability-preview.png'});await page.locator('[data-action=preview]').click();await expect(page.locator('#tilePreviewPanel')).toBeHidden();
});
test('help supports click and keyboard, Escape dismissal and preserves editable data',async({page})=>{
 await page.locator('.section-nav [data-help=events]').click();await expect(page.locator('.help-dialog')).toContainText('키카드');await page.keyboard.press('Escape');await expect(page.locator('.help-dialog')).toBeHidden();
 await page.locator('[data-section=variables]').click();await page.locator('[data-manage=new]').click();await page.getByLabel('이름',{exact:true}).fill('구조물 전원');await page.getByLabel('초기값',{exact:true}).fill('3');await page.locator('#dialogActions [type=submit]').click();
 const before=await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());await page.locator('.section-nav [data-help=variables]').focus();await page.keyboard.press('Enter');await expect(page.locator('.help-dialog')).toBeVisible();await page.keyboard.press('Escape');await page.locator('[data-section=goals]').click();await page.getByRole('button',{name:'임무 방식 도움말',exact:true}).click();await expect(page.locator('.help-dialog')).toContainText('탈출');await page.keyboard.press('Escape');expect(await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).toEqual(before);
 await page.screenshot({path:'artifacts/usability-goals.png'});
});
test('coordinate numbers stay on edge rulers through pan and zoom',async({page})=>{
 await page.evaluate(()=>{const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){if(this.canvas.id==='map'&&this.fillStyle==='#9bb0bc'&&/^-?\d+$/.test(String(text))){globalThis.rulerLabels??=[];globalThis.rulerLabels.push({text,x,y,h:this.canvas.clientHeight});}return original.call(this,text,x,y,...args);};});
 const map=page.locator('#map'),rect=await map.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.keyboard.down('Space');await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+90,rect.y+rect.height/2+70,{steps:4});await page.mouse.up();await page.keyboard.up('Space');await page.locator('[data-action=zoom-in]').click();await page.waitForTimeout(100);
 const labels=await page.evaluate(()=>globalThis.rulerLabels);expect(labels.length).toBeGreaterThan(5);expect(labels.every(l=>l.x===5||Math.abs(l.y-(l.h-8))<2)).toBe(true);await page.screenshot({path:'artifacts/usability-rulers.png'});
});
