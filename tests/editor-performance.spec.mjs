import {test,expect} from '@playwright/test';
import {scanFixture} from '../tools/scan-fixture.mjs';
import {packStage} from '../dist/stage-file.mjs';
const snapshot=page=>page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());
async function load(page){const {project}=await scanFixture();await page.goto('/');await page.locator('#projectInput').setInputFiles({name:'performance.esfile',mimeType:'application/zip',buffer:Buffer.from(packStage(project))});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('large scene redraws reuse tile lookups and report unchanged HUD values once',async({page})=>{
  await load(page);const result=await page.evaluate(async()=>{
    const {createMap}=await import('/map.mjs'),{demoProject}=await import('/core.mjs');let idReads=0,zoom=0,cursor=0;
    const project=demoProject();project.tiles=Array.from({length:200},(_,i)=>({get id(){idReads++;return 't'+i;},name:'T',size:{x:16,y:8,z:16},ports:[],asset:null}));project.placements=Array.from({length:1000},(_,i)=>({id:'p'+i,tileId:'t'+i%200,roomId:'r1',x:i%32,y:0,z:Math.floor(i/32),rotation:0}));project.gimmicks=[];const state={project,view:'plan',floor:0,mode:'select'};
    const canvas=document.createElement('canvas');canvas.style.cssText='width:600px;height:400px';document.body.append(canvas);const map=createMap(canvas,()=>state,{zoom:()=>zoom++,cursor:()=>cursor++});
    try{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));idReads=0;const beforeZoom=zoom;for(let i=0;i<6;i++)map.draw();const redrawReads=idReads,zoomNotifications=zoom-beforeZoom;
      const r=canvas.getBoundingClientRect(),p=map.projectPoint({x:3,z:3});for(let i=0;i<20;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+p.x+i*.001,clientY:r.top+p.y}));await new Promise(resolve=>requestAnimationFrame(resolve));return {redrawReads,zoomNotifications,cursor};
    }finally{map.destroy();canvas.remove();}
  });expect(result).toEqual({redrawReads:0,zoomNotifications:0,cursor:1});
});

test('palette hover suppresses repeated status updates and a successful drop rebuilds the UI once',async({page})=>{
  await load(page);const local=await page.evaluate(()=>EROSIONSECTOR_EDITOR.projectPoint({x:0,z:16})),mapBox=await page.locator('#map').boundingBox();await page.evaluate(()=>{globalThis.renderMutations=0;new MutationObserver(m=>globalThis.renderMutations+=m.length).observe(document.querySelector('#projectName'),{childList:true,characterData:true,subtree:true});});
  await page.locator('[data-library-tile=t0]').dragTo(page.locator('#map'),{targetPosition:{x:local.x+1,y:local.y+1}});await expect.poll(async()=>(await snapshot(page)).placements.length).toBe(4);expect(await page.evaluate(()=>globalThis.renderMutations)).toBe(1);await expect(page.locator('#paletteDropStatus')).toBeHidden();
});

test('undo and redo keep exact revisions and automatic recovery saves the final revision',async({page})=>{
  await load(page);const before=await snapshot(page);
  for(const name of ['편집 1','편집 2']){await page.locator('#projectName').click();await page.getByLabel('스테이지 이름',{exact:true}).fill(name);await page.locator('#dialog').getByRole('button',{name:'저장',exact:true}).click();}
  const after=await snapshot(page);await page.locator('[data-action=undo]').click();expect((await snapshot(page)).name).toBe('편집 1');await page.locator('[data-action=undo]').click();expect(await snapshot(page)).toEqual(before);await page.locator('[data-action=redo]').click();await page.locator('[data-action=redo]').click();expect(await snapshot(page)).toEqual(after);
  await expect(page.locator('#saveStatus')).toHaveText('브라우저에 임시 저장됨');await page.reload();await page.locator('[data-action=welcome-resume]').click();expect(await snapshot(page)).toEqual(after);
});
