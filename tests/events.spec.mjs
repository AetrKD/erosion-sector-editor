import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unpackStage} from '../dist/stage-file.mjs';
const snapshot=page=>page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());
async function dragBlock(page,source,target){
  await target.scrollIntoViewIfNeeded();await source.scrollIntoViewIfNeeded();const a=await source.boundingBox();
  await page.mouse.move(a.x+12,a.y+12);await page.mouse.down();await page.mouse.move(a.x+30,a.y+28,{steps:5});
  await target.scrollIntoViewIfNeeded();const b=await target.boundingBox();await page.mouse.move(b.x+30,b.y+15,{steps:10});await page.mouse.move(b.x+31,b.y+16);await page.mouse.up();
}
test.beforeEach(async({page})=>{await page.goto('/');await page.waitForFunction(()=>!!globalThis.EROSIONSECTOR_EDITOR);await page.locator('[data-action="welcome-sample"]').click();});

test('directory tree selects multi-floor instances and keeps sibling codes when regrouping, renaming and undoing',async({page})=>{
  await page.locator('[data-tab=rooms]').click();
  await expect(page.locator('#areaTree [data-tree-placement]')).toHaveCount(7);
  await page.locator('#areaTree [data-select-id=p2]').click();
  await page.getByLabel('소속 구역',{exact:true}).selectOption('r1');
  await expect(page.locator('[data-folder=r1] [data-tree-placement]')).toHaveCount(2);
  expect((await snapshot(page)).placements.find(p=>p.id==='p2').areaCode).toBe('b');
  await page.getByLabel('하위 구역 이름',{exact:true}).fill('corridor');await page.getByLabel('하위 구역 이름',{exact:true}).press('Tab');
  await expect(page.locator('[data-folder=r1] [data-tree-placement=p2]')).toContainText('corridor구역');
  await page.locator('[data-action=undo]').click();expect((await snapshot(page)).placements.find(p=>p.id==='p2').areaCode).toBe('b');
  await page.locator('[data-action=undo]').click();expect((await snapshot(page)).placements.find(p=>p.id==='p2').roomId).toBe('r2');
  await page.locator('#areaTree [data-select-id=p6]').click();expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).floor).toBe(1);
  await page.getByLabel('구역과 배치 타일 검색').fill('전력');await expect(page.locator('#areaTree .area-folder')).toHaveCount(1);
  await page.getByLabel('구역과 배치 타일 검색').fill('');
  await page.screenshot({path:'artifacts/editor-area-tree.png'});
});

test('Scratch-style blocks compose editable conditions and both branches, with reversible changes',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-tab=events]').click();await page.locator('#libraryContent [data-logic=example]').click();
  await expect(page.locator('#logicPanel')).toBeVisible();expect((await snapshot(page)).programs[0].actions).toHaveLength(3);
  await page.locator('[data-program-field=name]').fill('101구역 보안 제어');await page.locator('[data-program-field=name]').press('Tab');
  await page.locator('[data-logic=category][data-category=control]').click();await page.locator('[data-block-type="flow.if"]').click();
  let program=(await snapshot(page)).programs[0],branch=program.actions.at(-1);const node=()=>page.locator(`[data-node="${branch.id}"]`);
  await node().locator('.slot-heading[data-slot=conditions]').click();await page.locator('[data-block-type="check.variable"]').click();
  await node().getByLabel('변수 이름',{exact:true}).fill('보안전력');await node().getByLabel('변수 이름',{exact:true}).press('Tab');
  await node().locator('.slot-heading[data-slot=then]').click();await page.locator('[data-block-type="do.door"]').click();
  await node().locator('.slot-heading[data-slot=else]').click();await page.locator('[data-block-type="do.message"]').click();
  program=(await snapshot(page)).programs[0];branch=program.actions.at(-1);
  expect(branch.conditions[0].args.variable).toBe('보안전력');expect(branch.then[0].type).toBe('do.door');expect(branch.else[0].type).toBe('do.message');
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).issues.filter(i=>i.severity==='error')).toHaveLength(0);
  await node().locator('[data-logic=remove]').last().click();expect((await snapshot(page)).programs[0].actions.at(-1).else).toHaveLength(0);
  await page.locator('[data-action=undo]').click();expect((await snapshot(page)).programs[0].actions.at(-1).else).toHaveLength(1);
  await page.locator('[data-logic=preview]').click();await expect(page.locator('.logic-preview')).toContainText('아니면');await page.locator('#dialog [data-action=close-dialog]').first().click();
  await page.screenshot({path:'artifacts/editor-event-blocks.png'});expect(errors).toEqual([]);
});

test('dragging a tile to another directory changes its parent without moving world coordinates',async({page})=>{
  await page.locator('[data-tab=rooms]').click();const before=(await snapshot(page)).placements.find(p=>p.id==='p2');
  await dragBlock(page,page.locator('[data-tree-placement=p2]'),page.locator('[data-folder=r1]>summary'));
  const after=(await snapshot(page)).placements.find(p=>p.id==='p2');expect(after).toEqual({...before,roomId:'r1',areaCode:'b'});
  await expect(page.locator('[data-folder=r1] [data-tree-placement]')).toHaveCount(2);
});

test('composite event triggers are composed with the same blocks and retain all trigger arguments',async({page})=>{
  await page.locator('[data-tab=events]').click();await page.locator('#libraryContent [data-logic=new]').click();
  await page.locator('[data-logic=slot][data-slot=trigger]').click();await page.locator('[data-block-type="when.all"]').click();
  const root=(await snapshot(page)).programs[0].trigger;
  await page.locator(`[data-node="${root.id}"] .slot-heading[data-slot=items]`).click();
  await page.locator('[data-block-type="when.area"]').click();await page.locator('[data-block-type="when.signal"]').click();
  await page.locator('#logicPanel').getByLabel('신호 이름',{exact:true}).fill('시설_전력복구');await page.locator('#logicPanel').getByLabel('신호 이름',{exact:true}).press('Tab');
  await page.locator('.slot-heading[data-slot=actions]').click();await page.locator('[data-block-type="do.areaLights"]').click();
  const program=(await snapshot(page)).programs[0];expect(program.trigger.type).toBe('when.all');expect(program.trigger.items).toHaveLength(2);expect(program.trigger.items[1].args.signal).toBe('시설_전력복구');
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).issues.filter(i=>i.severity==='error')).toHaveLength(0);
});

test('actual drag and drop moves an existing block inside a repeat and rejects a condition in an action slot',async({page})=>{
  await page.locator('[data-tab=events]').click();await page.locator('#libraryContent [data-logic=example]').click();
  await page.locator('[data-logic=category][data-category=control]').click();await page.locator('[data-block-type="flow.repeat"]').click();
  let program=(await snapshot(page)).programs[0];const wait=program.actions[1],repeat=program.actions.at(-1);
  const body=()=>page.locator(`[data-node="${repeat.id}"] .block-drop[data-slot-name=body]`);
  await dragBlock(page,page.locator(`[data-drag-node="${wait.id}"]`),body());
  program=(await snapshot(page)).programs[0];expect(program.actions).toHaveLength(3);expect(program.actions.at(-1).body[0].id).toBe(wait.id);
  await page.locator('[data-logic=category][data-category=condition]').click();await dragBlock(page,page.locator('[data-block-type="check.players"]'),body());
  await expect(page.locator('#toast')).toContainText('블록을 연결할 수 없습니다');expect((await snapshot(page)).programs[0].actions.at(-1).body).toHaveLength(1);
});

test('a single stage download restores block programs and named tile areas in the browser',async({page})=>{
  await page.locator('[data-tab=events]').click();await page.locator('#libraryContent [data-logic=example]').click();const before=await snapshot(page);
  const ready=page.waitForEvent('download');await page.locator('[data-action=save]').click();const download=await ready;
  expect(download.suggestedFilename()).toMatch(/\.esfile$/);const bytes=await readFile(await download.path()),file=unpackStage(bytes);expect(file.programs).toEqual(before.programs);
  await page.locator('#projectInput').setInputFiles({name:'events.esfile',mimeType:'application/zip',buffer:bytes});
  await expect(page.locator('#toast')).toContainText('스테이지를 불러왔습니다');
  const after=await snapshot(page);expect(after.programs).toEqual(before.programs);expect(after.placements).toEqual(before.placements);
  await page.locator('[data-tab=events]').click();await expect(page.locator('[data-program-field=name]')).toHaveValue('구역 진입 · 소등과 경보');
});

test('mobile event composition remains accessible without drag and drop or page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'라이브러리 열기',exact:true}).click();
  await page.locator('[data-tab=events]').click();await page.locator('#libraryContent [data-logic=example]').click();
  await expect(page.locator('#libraryPanel')).not.toBeVisible();await expect(page.locator('#logicPanel')).toBeVisible();
  await page.locator('[data-block-type="do.message"]').click();expect((await snapshot(page)).programs[0].actions.at(-1).type).toBe('do.message');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/editor-events-mobile.png'});
});
