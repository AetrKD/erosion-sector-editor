import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unpackStage} from '../dist/stage-file.mjs';
test.beforeEach(async({page})=>{await page.goto('/');await page.locator('[data-action=welcome-sample]').click();});
const section=(p,s)=>p.locator('button[data-section='+s+']').click();
test('goals filter targets and fields, preserve edits and download the mission',async({page})=>{
 await section(page,'goals');await page.locator('[data-manage=new]').click();
 const labels=await page.locator('[name=targetId] option').allTextContents();expect(new Set(labels).size).toBe(labels.length);expect(labels[0]).toContain('101');expect(labels[0]).toContain('1층');
 await expect(page.locator('[name=type] option[value=command]')).toHaveCount(0);await expect(page.locator('[name=command]')).toHaveCount(0);
 await page.locator('[name=type]').selectOption('scan');await expect(page.locator('[name=targetId] option')).toHaveText(['전력 복구 스캔']);
 await page.locator('[name=type]').selectOption('survive');await expect(page.locator('[name=targetId]')).toHaveCount(0);await page.getByLabel('생존 시간 · 초').fill('18');
 await page.locator('[name=type]').selectOption('visit');await page.locator('[name=type]').selectOption('survive');await expect(page.getByLabel('생존 시간 · 초')).toHaveValue('18');
 await page.locator('[name=name]').fill('방어');await page.locator('#dialogActions [type=submit]').click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action=save]').click()]);const saved=unpackStage(await readFile(await download.path()));expect(saved.objectives.at(-1).amount).toBe(18);expect(saved.objectives.at(-1).type).toBe('survive');
 await expect(page.locator('#saveStatus')).toHaveText('브라우저에 임시 저장됨');await page.locator('[data-action=undo]').click();expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).objectives.some(o=>o.name==='방어')).toBe(false);
});
test('extraction mode hides irrelevant completion setting and locates extraction',async({page})=>{
 await section(page,'goals');await page.locator('[data-mission-mode]').selectOption('extract');await expect(page.locator('[data-success-mode]')).toBeHidden();await expect(page.locator('#libraryPanel')).toBeHidden();
 await page.locator('.extraction-locations button').click();await expect(page.locator('#inspectorContent')).toContainText('복귀 집결 지점');
 await section(page,'goals');await page.locator('[data-mission-mode]').selectOption('objectives');await expect(page.locator('[data-success-mode]')).toBeVisible();expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).objectives[0].targetId).toBe('g5');
});
test('preview gets usable width, adjustable split and never leaks to management',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1280,height:720});await page.locator('[data-action=preview]').click();await expect(page.locator('#inspectorPanel')).toBeHidden();
 expect((await page.locator('#canvasWrap').boundingBox()).width).toBeGreaterThan(500);await page.locator('#previewWidth').fill('35');expect((await page.locator('#canvasWrap').boundingBox()).width).toBeGreaterThan(650);
 await page.screenshot({path:'artifacts/ux-review-preview.png'});await section(page,'resources');await expect(page.locator('#tilePreviewPanel')).toBeHidden();await expect(page.locator('#libraryPanel')).toBeHidden();expect(errors).toEqual([]);
});
test('one event creation entry and stage ID moved into settings',async({page})=>{
 await expect(page.locator('#chapterCaption')).not.toContainText('stage_');await page.locator('[data-action=project]').first().click();await expect(page.locator('.stage-identifier')).toContainText('stage_');await page.keyboard.press('Escape');
 await section(page,'events');await expect(page.locator('[data-logic=new]:visible')).toHaveCount(1);await page.locator('[data-logic=new]').click();await expect(page.locator('[data-program-field=name]')).toBeVisible();
});
