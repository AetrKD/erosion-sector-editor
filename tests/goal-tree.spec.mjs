import {test,expect} from '@playwright/test';
test('goals belong to collapsible groups and adding inside a group selects it',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('[data-action=welcome-sample]').click();await page.locator('button[data-section=goals]').click();
 const main=page.locator('[data-goal-group=main]');await expect(main.locator('.goal-leaf')).toHaveCount(1);await expect(main).toContainText('전력 복구 스캔 완료');
 await page.locator('[data-manage=group]').click();await page.getByLabel('이름',{exact:true}).fill('추가 탐사');await page.locator('#dialogActions [type=submit]').click();
 const sub=page.locator('.goal-group').filter({has:page.locator('summary strong',{hasText:'추가 탐사'})});const id=await sub.getAttribute('data-goal-group');
 await sub.locator('[data-manage=new]').click();await expect(page.locator('[name=groupId]')).toHaveValue(id);await page.getByLabel('이름',{exact:true}).fill('관측실 방문');await page.locator('#dialogActions [type=submit]').click();
 await expect(sub.locator('.goal-leaf')).toHaveCount(1);await expect(main.locator('.goal-leaf')).toHaveCount(1);
 await sub.locator('summary strong').click();await expect(sub).not.toHaveAttribute('open','');await page.locator('button[data-section=variables]').click();await page.locator('button[data-section=goals]').click();await expect(sub).not.toHaveAttribute('open','');await sub.locator('summary strong').click();
 await sub.locator('[data-manage=edit]').click();await page.locator('[name=groupId]').selectOption('main');await page.locator('#dialogActions [type=submit]').click();await expect(sub.locator('.goal-leaf')).toHaveCount(0);await expect(main.locator('.goal-leaf')).toHaveCount(2);
 await page.locator('[data-action=undo]').click();await expect(sub.locator('.goal-leaf')).toHaveCount(1);await expect(main.locator('.goal-leaf')).toHaveCount(1);await page.screenshot({path:'artifacts/goal-group-tree.png'});expect(errors).toEqual([]);
});
test('extract mode retains the main tree with an unused badge and stored goals',async({page})=>{
 await page.goto('/');await page.locator('[data-action=welcome-sample]').click();await page.locator('button[data-section=goals]').click();await expect(page.locator('[data-mission-mode] option[value=extract]')).toHaveText('길 정리 · 탈출 자체가 목표');await page.locator('[data-mission-mode]').selectOption('extract');const main=page.locator('[data-goal-group=main]');await expect(main).toBeVisible();await expect(main).toContainText('미사용');await expect(main.locator('.goal-leaf')).toHaveCount(1);await expect(page.locator('[data-success-mode]')).toBeHidden();await main.locator('[data-manage=new]').click();expect(await page.locator('#dialogBody [name=type] option').evaluateAll(options=>options.map(o=>o.value))).not.toContain('clear');
});
