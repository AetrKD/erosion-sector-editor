import {test,expect} from '@playwright/test';
import {scanFixture} from '../tools/scan-fixture.mjs';
import {packStage,unpackStage} from '../dist/stage-file.mjs';
import {readFile} from 'node:fs/promises';
const snapshot=page=>page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());
async function load(page,change=()=>{}){const {project}=await scanFixture();change(project);await page.goto('/');await page.locator('#projectInput').setInputFiles({name:'palette.esfile',mimeType:'application/zip',buffer:Buffer.from(packStage(project))});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function point(page,p){const local=await page.evaluate(p=>EROSIONSECTOR_EDITOR.projectPoint(p),p),box=await page.locator('#map').boundingBox();return {x:box.x+local.x,y:box.y+local.y};}
async function hold(page,source,target){await source.scrollIntoViewIfNeeded();const box=await source.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+14,box.y+box.height/2+5,{steps:4});await page.mouse.move(target.x,target.y,{steps:12});await page.mouse.move(target.x+1,target.y+1);}
async function drop(page,source,target){await hold(page,source,target);await page.mouse.up();}

test('native library tile drag creates one undoable instance and saves the same placement',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page);const before=await snapshot(page);await drop(page,page.locator('[data-library-tile=t0]'),await point(page,{x:0,z:16}));
  let after=await snapshot(page);expect(after.placements).toHaveLength(4);expect(after.placements.at(-1)).toMatchObject({tileId:'t0',x:0,y:0,z:1,rotation:0,roomId:'r0'});await expect(page.locator('#paletteDropStatus')).toBeHidden();
  await page.locator('[data-action=undo]').click();expect(await snapshot(page)).toEqual(before);await page.locator('[data-action=redo]').click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action=save]').click()]);expect(unpackStage(await readFile(await download.path())).placements).toEqual(after.placements);expect(errors).toEqual([]);
});

test('hover previews an invalid overlapping tile and releasing cannot insert it',async({page})=>{
  await load(page);const before=await snapshot(page);await hold(page,page.locator('[data-library-tile=t0]'),await point(page,{x:0,z:0}));await expect(page.locator('#map')).toHaveAttribute('data-drop-state','invalid');await expect(page.locator('#paletteDropStatus')).toContainText('겹');await page.screenshot({path:'artifacts/palette-invalid-drop.png'});await page.mouse.up();expect(await snapshot(page)).toEqual(before);await expect(page.locator('#paletteDropStatus')).toBeHidden();
});

test('library gimmick drag targets a rotated tile and rejects the space outside any tile',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page,p=>p.placements[1].rotation=90);await page.locator('[data-tab=gimmicks]').click();const before=await snapshot(page);
  await hold(page,page.locator('[data-gimmick-type=scan]'),await point(page,{x:9,z:1}));await expect(page.locator('#map')).toHaveAttribute('data-drop-state','valid');await page.screenshot({path:'artifacts/palette-gimmick-drop.png'});await page.mouse.up();
  const after=await snapshot(page);expect(after.gimmicks).toHaveLength(before.gimmicks.length+1);expect(after.gimmicks.at(-1)).toMatchObject({type:'scan',placementId:'p1',position:{x:1.5,y:1,z:6.5}});
  await hold(page,page.locator('[data-gimmick-type=keycard]'),await point(page,{x:0,z:16}));await expect(page.locator('#paletteDropStatus')).toContainText('타일 내부');await page.mouse.up();expect(await snapshot(page)).toEqual(after);expect(errors).toEqual([]);
});

test('canceling a library drag leaves no preview, instance or undo entry',async({page})=>{
  await load(page);const before=await snapshot(page);await hold(page,page.locator('[data-library-tile=t0]'),await point(page,{x:0,z:16}));await expect(page.locator('#map')).toHaveAttribute('data-drop-state','valid');await page.keyboard.press('Escape');await page.mouse.up();expect(await snapshot(page)).toEqual(before);await expect(page.locator('#paletteDropStatus')).toBeHidden();await expect(page.locator('[data-action=undo]')).toBeDisabled();
});

test('isometric library drops use the selected floor and preserve camera rotation',async({page})=>{
  await load(page);await page.locator('[data-view=iso]').click();const before=await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary());await drop(page,page.locator('[data-library-tile=t0]'),await point(page,{x:0,y:0,z:16}));
  expect((await snapshot(page)).placements.at(-1)).toMatchObject({tileId:'t0',x:0,y:0,z:1});const after=await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary());expect(after.view).toBe('iso');expect(after.camera.azimuth).toBe(before.camera.azimuth);
  await page.locator('[data-tab=gimmicks]').click();const count=(await snapshot(page)).gimmicks.length;await drop(page,page.locator('[data-gimmick-type=keycard]'),await point(page,{x:10,y:0,z:2}));expect((await snapshot(page)).gimmicks).toHaveLength(count+1);
});

test('dropping on the library cancels and existing click placement still works',async({page})=>{
  await load(page);const before=await snapshot(page);const library=await page.locator('#libraryPanel').boundingBox();await drop(page,page.locator('[data-library-tile=t0]'),{x:library.x+20,y:library.y+20});expect(await snapshot(page)).toEqual(before);await expect(page.locator('#paletteDropStatus')).toBeHidden();
  await page.locator('[data-library-tile=t0]').click();const target=await point(page,{x:0,z:16});await page.mouse.click(target.x,target.y);expect((await snapshot(page)).placements).toHaveLength(4);
});

test('upper-floor drag uses the active eight-block layer and never creates a duplicate on click release',async({page})=>{
  await load(page);await page.locator('[data-action=floor-up]').click();await drop(page,page.locator('[data-library-tile=t1]'),await point(page,{x:0,z:0}));expect((await snapshot(page)).placements).toHaveLength(4);expect((await snapshot(page)).placements.at(-1)).toMatchObject({tileId:'t1',x:0,y:1,z:0});
});

test('foreign text and file drag payloads cannot create palette instances',async({page})=>{
  await load(page);const before=await snapshot(page);await page.locator('#map').evaluate(canvas=>{const dataTransfer=new DataTransfer();dataTransfer.setData('application/x-erosion-palette',JSON.stringify({kind:'tile',id:'t0'}));canvas.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer,clientX:500,clientY:500}));});expect(await snapshot(page)).toEqual(before);
});

test('the first library tile can be dropped into an empty stage',async({page})=>{
  await load(page,p=>{p.placements=[];p.gimmicks=[];p.objectives=[];p.programs=[];});await drop(page,page.locator('[data-library-tile=t0]'),await point(page,{x:0,z:0}));expect((await snapshot(page)).placements).toHaveLength(1);expect((await snapshot(page)).placements[0]).toMatchObject({tileId:'t0',x:0,y:0,z:0});
});

test('a palette tile keeps the rotation chosen before dragging',async({page})=>{
  await load(page);await page.locator('[data-library-tile=t0]').click();await page.keyboard.press('r');await drop(page,page.locator('[data-library-tile=t0]'),await point(page,{x:0,z:16}));expect((await snapshot(page)).placements.at(-1)).toMatchObject({tileId:'t0',rotation:90});
});
