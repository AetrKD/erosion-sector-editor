import {test,expect} from '@playwright/test';
import {scanFixture} from '../tools/scan-fixture.mjs';
import {packStage,unpackStage} from '../dist/stage-file.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const snapshot=page=>page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());
async function at(page,point){const local=await page.evaluate(p=>EROSIONSECTOR_EDITOR.projectPoint(p),point),box=await page.locator('#map').boundingBox();return {x:box.x+local.x,y:box.y+local.y};}
async function drag(page,a,b){await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();}
async function load(page){const {project,sources}=await scanFixture();await page.goto('/');await page.locator('#projectInput').setInputFiles({name:'authoring.esfile',mimeType:'application/zip',buffer:Buffer.from(packStage(project))});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return {project,sources};}

test('directly drag a continuation scan, resize its handle, undo and round-trip the edited file',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page);await page.locator('[data-section=resources]').click();await page.locator('#managementPanel [data-select-id="security-scan"]').click();await page.locator('[data-scan-focus="1"]').click();
  await drag(page,await at(page,{x:11,z:3}),await at(page,{x:12,z:4}));
  let g=(await snapshot(page)).gimmicks.find(g=>g.id==='security-scan');expect(g.settings.steps[0].position).toEqual({x:4,y:1,z:4});expect(g.position).toEqual({x:3,y:1,z:3});
  const center=await at(page,{x:12,z:4}),edge=await at(page,{x:13.5,z:4}),handle=Math.max(20,edge.x-center.x);await drag(page,{x:center.x+handle,y:center.y},{x:center.x+handle+40,y:center.y});
  g=(await snapshot(page)).gimmicks.find(g=>g.id==='security-scan');expect(g.settings.steps[0].radius).toBeGreaterThan(1.5);expect(g.settings.radius).toBe(1);
  await page.locator('[data-action=undo]').click();expect((await snapshot(page)).gimmicks.find(g=>g.id==='security-scan').settings.steps[0].radius).toBe(1.5);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action=save]').click()]);const saved=unpackStage(await readFile(await download.path()));expect(saved.gimmicks.find(g=>g.id==='security-scan').settings.steps[0].position).toEqual({x:4,y:1,z:4});expect(errors).toEqual([]);await page.screenshot({path:'artifacts/authoring-scan-direct.png'});
});

test('random candidate floor preview appears after linking the real NBT folder',async({page})=>{
  const {sources}=await load(page),root=path.resolve('artifacts/authoring-tiles');for(const [ref,bytes] of sources){await mkdir(path.join(root,path.dirname(ref)),{recursive:true});await writeFile(path.join(root,ref),bytes);}
  await page.locator('#tileFolderInput').setInputFiles(root);await page.locator('[data-section=resources]').click();await page.locator('#managementPanel [data-select-id="security-scan"]').click();await page.locator('[data-scan-focus="1"]').click();await expect(page.locator('.scan-map-tools')).toContainText(/배치 후보 [1-9]/);await page.screenshot({path:'artifacts/authoring-random-floor.png'});
});

test('a door shows its exact event references and navigates back from a block target',async({page})=>{
  const {project}=await load(page);await page.mouse.click(...Object.values(await at(page,{x:8,z:4})));
  await expect(page.locator('#inspectorContent')).toContainText('DOOR');await expect(page.locator('[data-related-program]')).toHaveCount(2);await page.locator(`[data-related-program="${project.programs[1].id}"]`).click();await expect(page.locator('.reference-focus')).toHaveCount(1);
  await page.locator('[data-logic=locate][data-target-kind=door]').click();await expect(page.locator('#inspectorContent')).toContainText('DOOR');await page.locator('[data-action=return-event]').click();await expect(page.locator('#logicPanel')).toBeVisible();await expect(page.locator('[data-program-field=name]')).toHaveValue(project.programs[1].name);
  await page.screenshot({path:'artifacts/authoring-event-targets.png'});
});

test('simulate a scan objective, door unlock and extraction without changing the saved project',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page);const before=await snapshot(page);await page.locator('[data-action=simulate]').click();const dialog=page.locator('#dialog');await expect(dialog).toContainText('이벤트 모의 실행');
  const doors=dialog.locator('.sim-card').filter({has:page.getByRole('heading',{name:'문',exact:true})});await expect(doors).toContainText('이쪽 잠김');await page.getByLabel('모의 입력 대상').selectOption('security-scan');await page.getByLabel('모의 입력 상태').selectOption('complete');await page.locator('[data-sim=input]').click();await page.locator('[data-sim=advance][data-seconds="1"]').click();
  await expect(doors).not.toContainText('이쪽 잠김');const goals=dialog.locator('.sim-card').filter({has:page.getByRole('heading',{name:'임무 목표',exact:true})});await expect(goals).toContainText('완료');await expect(goals).not.toContainText('미완료');await page.screenshot({path:'artifacts/authoring-simulation.png'});
  await page.getByLabel('모의 입력 대상').selectOption('exit');await page.locator('[data-sim=input]').click();await expect(dialog.locator('.sim-toolbar')).toContainText('임무 성공');expect(await snapshot(page)).toEqual(before);
  await page.locator('[data-sim=reset]').click();await expect(doors).toContainText('이쪽 잠김');expect(errors).toEqual([]);
});

test('bundle duplication preserves local wiring and is one undoable change',async({page})=>{
  await load(page);await page.locator('[data-tab=rooms]').click();await page.locator('#areaTree [data-select-id=p0]').click();const before=await snapshot(page);await page.locator('[data-action=duplicate-bundle]').click();const pos=await at(page,{x:0,z:16});await page.mouse.click(pos.x+1,pos.y+1);const after=await snapshot(page);expect(after.placements).toHaveLength(before.placements.length+1);expect(after.gimmicks.length).toBeGreaterThan(before.gimmicks.length);expect(after.programs).toHaveLength(before.programs.length*2);const copy=after.placements.at(-1);expect(after.programs.at(-1).actions[0].args.doorId).toBe(copy.id+':east');await page.locator('[data-action=undo]').click();expect(await snapshot(page)).toEqual(before);
});

test('simulation controls remain within a narrow viewport and closed dialog does not block editing',async({page})=>{
  await load(page);await page.setViewportSize({width:540,height:844});await page.locator('[data-action=simulate]').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('[data-sim=input]')).toBeVisible();await page.screenshot({path:'artifacts/authoring-simulation-mobile.png'});await page.locator('#dialog [data-action=close-dialog]').first().click();await expect(page.locator('#dialog')).not.toBeVisible();
});
