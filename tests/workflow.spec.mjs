import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {unpackStage} from '../dist/stage-file.mjs';
import {doorFixture} from './fixtures.mjs';
const snapshot=page=>page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());
const close=page=>page.locator('#dialog [data-action=close-dialog]').first().click();

test('new author connects a tile folder, places entry and exit, chooses extraction and saves a draft',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('[data-action=welcome-new]').click();
  const root=path.resolve('artifacts/friendly-workspace/assets/tile');await mkdir(path.join(root,'튜토리얼'),{recursive:true});await writeFile(path.join(root,'튜토리얼/복도.nbt'),doorFixture({compressed:true}));
  await page.locator('#fileMenu summary').click();const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('[data-file-command=tile-folder]').click()]);await chooser.setFiles(root);
  await expect(page.locator('[data-library-tile]')).toHaveCount(1);await expect(page.locator('#workflowCount')).toHaveText('1/5');await page.locator('[data-library-tile]').click();
  async function at(x,z){const local=await page.evaluate(p=>EROSIONSECTOR_EDITOR.projectPoint(p),{x,y:1,z});const box=await page.locator('#map').boundingBox();return {x:box.x+local.x,y:box.y+local.y};}
  let point=await at(.1,.1);await page.mouse.click(point.x,point.y);await expect(page.locator('#emptyMap')).toBeHidden();await page.locator('[data-tab=gimmicks]').click();
  await page.locator('[data-gimmick-type=spawn]').click();point=await at(4,4);await page.mouse.click(point.x,point.y);
  await page.locator('[data-gimmick-type=extraction]').click();point=await at(10,10);await page.mouse.click(point.x,point.y);expect((await snapshot(page)).gimmicks.map(g=>g.type)).toEqual(['spawn','extraction']);
  await page.locator('.workspace-nav [data-action=mission]').click();await page.getByLabel('임무 방식',{exact:true}).selectOption('extract');await page.locator('#dialog button[type=submit]').click();await expect(page.locator('#workflowCount')).toHaveText('4/5');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action=save]').click()]);const saved=unpackStage(await readFile(await download.path()));expect(saved.placements).toHaveLength(1);expect(saved.tiles[0].asset.reference).toBe('튜토리얼/복도.nbt');expect(saved.gimmicks).toHaveLength(2);expect(saved.missionMode).toBe('extract');expect(errors).toEqual([]);
  await page.screenshot({path:'artifacts/ui-friendly-first-stage.png'});
});

test('new project guidance opens the relevant task without editing the project',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('[data-action=welcome-new]').click();const before=await snapshot(page);
  await expect(page.locator('#emptyMap')).toBeVisible();await page.locator('[data-action=workflow]').click();await expect(page.locator('#dialog .workflow-step')).toHaveCount(5);
  await page.locator('#dialog [data-guide=gimmicks]').click();await expect(page.locator('[data-tab=gimmicks]')).toHaveAttribute('aria-selected','true');expect(await snapshot(page)).toEqual(before);
  await page.locator('[data-action=workflow]').click();await page.locator('#dialog [data-guide=mission]').click();await expect(page.locator('#dialog')).toContainText('임무');await close(page);expect(await snapshot(page)).toEqual(before);
  await page.locator('[data-action=workflow]').click();await page.locator('#dialog [data-guide=validation]').click();await expect(page.locator('#dialog')).toContainText('스테이지 검사');await close(page);expect(errors).toEqual([]);
});

test('persistent work tabs and placement hint survive preview, event editing and cancellation',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('[data-action=welcome-sample]').click();const before=await snapshot(page);
  await page.locator('[data-action=preview]').click();await expect(page.locator('[data-workspace-tab=preview]')).toHaveAttribute('aria-current','page');await expect(page.locator('#workspaceContext')).toContainText('개별 NBT');
  await page.locator('.workspace-nav [data-action=events]').click();await expect(page.locator('#logicPanel')).toBeVisible();await page.locator('.workspace-nav [data-workspace=map]').click();await expect(page.locator('#canvasWrap')).toBeVisible();
  await page.locator('[data-library-tile]').first().click();await expect(page.locator('#placementBanner')).toContainText('0°');await page.keyboard.press('r');await expect(page.locator('#placementBanner')).toContainText('90°');await page.locator('[data-action=cancel-placement]').click();await expect(page.locator('#placementBanner')).toBeHidden();expect(await snapshot(page)).toEqual(before);
  await page.screenshot({path:'artifacts/ui-friendly-map.png'});expect(errors).toEqual([]);
});

test('file menu saves the same esfile, closes on escape/outside click and is keyboard reachable',async({page})=>{
  await page.goto('/');await page.locator('[data-action=welcome-sample]').click();const before=await snapshot(page),menu=page.locator('#fileMenu');await menu.locator('summary').focus();await page.keyboard.press('Enter');await expect(menu).toHaveAttribute('open','');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-file-command=save]').click()]);expect(unpackStage(await readFile(await download.path()))).toMatchObject({name:before.name,placements:before.placements});await expect(menu).not.toHaveAttribute('open','');
  await menu.locator('summary').click();await page.keyboard.press('Escape');await expect(menu).not.toHaveAttribute('open','');await expect(menu.locator('summary')).toBeFocused();
  await menu.locator('summary').click();await page.locator('.workspace-nav [data-workspace=map]').click();await expect(menu).not.toHaveAttribute('open','');
  await page.locator('[data-tab=tiles]').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('[data-tab=gimmicks]')).toBeFocused();await expect(page.locator('[data-tab=gimmicks]')).toHaveAttribute('aria-selected','true');
});

test('narrow viewport keeps menu, work tabs, guidance and save reachable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('[data-action=welcome-new]').click();await page.locator('#fileMenu summary').click();await expect(page.locator('#fileMenu [data-action=open]')).toBeVisible();await page.screenshot({path:'artifacts/ui-friendly-mobile-menu.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.keyboard.press('Escape');await page.locator('[data-action=workflow]').click();await expect(page.locator('#dialog [data-guide=gimmicks]')).toBeVisible();await page.locator('#dialog [data-guide=gimmicks]').click();await expect(page.locator('#libraryPanel')).toBeVisible();await page.locator('[data-action=close-library]').click();
  await page.locator('[data-action=preview]').click();await expect(page.locator('#tilePreviewPanel')).toBeVisible();await page.locator('.workspace-nav [data-workspace=map]').click();await expect(page.locator('[data-action=save]')).toBeVisible();await page.screenshot({path:'artifacts/ui-friendly-mobile.png'});
});
