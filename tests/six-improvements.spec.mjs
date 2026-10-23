import {test,expect} from '@playwright/test';
test('alarm map selection, scan coordinate bounds and safe replacement deletion',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('[data-action=welcome-sample]').click();
 await page.locator('button[data-section=alarms]').click();await page.locator('[data-alarm-scan=new]').click();
 const picker=page.locator('[data-tile-picker=spawnTiles]');const rect=picker.locator('[data-map-tile]').first();await rect.focus();await rect.press('Space');await expect(picker.locator('input[type=checkbox]').first()).toBeChecked();await expect(picker.locator('output')).toHaveText('1');
 await picker.locator('[data-tile-search]').fill('존재하지않음');await expect(picker.locator('[data-tile-row]').first()).toBeHidden();await expect(picker.locator('output')).toHaveText('1');await picker.locator('[data-tile-search]').fill('');
 await page.screenshot({path:'artifacts/six-alarm-picker.png'});await page.locator('#dialogActions [data-action=close-dialog]').click();
 await page.locator('button[data-section=scans]').click();await page.locator('[data-alarm-scan=new]').click();await page.getByLabel('이름',{exact:true}).fill('교체 스캔');
 const snapshot=await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());const q=snapshot.placements[0],t=snapshot.tiles.find(t=>t.id===q.tileId);await expect(page.locator('[name="position.x"]')).toHaveAttribute('max',String(t.size.x-1));await page.locator('[data-scan-plan]').click({position:{x:100,y:80}});expect(Number(await page.locator('[name="position.x"]').inputValue())).toBeLessThan(t.size.x);
 await page.screenshot({path:'artifacts/six-scan-position.png'});await page.locator('#dialogActions [type=submit]').click();
 const next=await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());const replacement=next.gimmicks.find(g=>g.name==='교체 스캔');const original=next.gimmicks.find(g=>g.id==='g5');
 await page.locator(`[data-alarm-scan=delete][data-id="${original.id}"]`).click();await expect(page.locator('#dialogBody')).toContainText('목표');await page.getByLabel('대체 대상',{exact:true}).selectOption(replacement.id);await page.locator('#dialogActions [type=submit]').click();
 const after=await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());expect(after.gimmicks.some(g=>g.id===original.id)).toBe(false);expect(after.objectives.find(o=>o.id==='restore-power').targetId).toBe(replacement.id);
 await page.locator('[data-action=undo]').click();expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).gimmicks.some(g=>g.id===original.id)).toBe(true);expect(errors).toEqual([]);
});
