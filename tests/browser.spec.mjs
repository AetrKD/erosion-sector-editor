import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {doorFixture} from './fixtures.mjs';
function fixture(){return doorFixture({compressed:true});}

test.beforeEach(async({page})=>{await page.goto('/');await page.waitForFunction(()=>!!globalThis.EROSIONSECTOR_EDITOR);});

test('plan connection cache refreshes after edits and undo without recalculating during view-only redraws',async({page})=>{
  const result=await page.evaluate(async()=>{
    const {createMap}=await import('/map.mjs'),{demoProject}=await import('/core.mjs');
    const project=demoProject();project.tiles=[{id:'t',name:'t',size:{x:16,y:8,z:16},ports:[
      {id:'w',x:0,y:1,z:8,facing:'west',width:6,height:4},
      {id:'e',x:16,y:1,z:8,facing:'east',width:6,height:4}
    ]}];project.placements=[0,1].map(x=>({id:`p${x}`,tileId:'t',roomId:'r1',x,y:0,z:0,rotation:0}));project.gimmicks=[];
    const shifted=structuredClone(project);shifted.placements[1].x=3;
    let reads=0;const ports=project.tiles[0].ports;
    Object.defineProperty(project.tiles[0],'ports',{get(){reads++;return ports;}});
    const state={project,view:'plan',floor:0,mode:'select'};
    const canvas=document.createElement('canvas');canvas.style.cssText='width:600px;height:400px';document.body.append(canvas);
    const context=canvas.getContext('2d'),stroke=context.stroke;let connected=0;
    context.stroke=function(...args){if(this.strokeStyle==='#c0e6af')connected++;return stroke.apply(this,args);};
    const map=createMap(canvas,()=>state,{});
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const beforeReads=reads;connected=0;map.draw();const before=connected;map.draw();const afterReads=reads;
      state.project=shifted;connected=0;map.draw();const after=connected;
      state.project=project;connected=0;map.draw();
      return {before,after,restored:connected,beforeReads,afterReads};
    }finally{map.destroy();canvas.remove();}
  });
  expect(result.before).toBe(2);expect(result.after).toBe(0);expect(result.restored).toBe(2);
  expect(result.afterReads).toBe(result.beforeReads);
});

test('bursts of pointer movement draw once per animation frame',async({page})=>{
  const result=await page.evaluate(async()=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const canvas=document.querySelector('#map'),context=canvas.getContext('2d'),clear=context.clearRect;
    let draws=0;context.clearRect=function(...args){draws++;return clear.apply(this,args);};
    try{
      const r=canvas.getBoundingClientRect();
      for(let i=0;i<50;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+40+i,clientY:r.top+60}));
      const synchronous=draws;await new Promise(resolve=>requestAnimationFrame(resolve));
      return {synchronous,total:draws};
    }finally{context.clearRect=clear;}
  });
  expect(result).toEqual({synchronous:0,total:1});
});
test('desktop initial stage, layer slicing and isometric view render without browser errors',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.locator('#projectName')).toHaveText('A1 · 잠든 관측소');
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).placements).toBe(7);
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).issues.filter(i=>i.severity==='error')).toHaveLength(0);
  await page.screenshot({path:'artifacts/editor-desktop.png'});
  await page.getByRole('button',{name:'2층',exact:true}).click();
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).floor).toBe(1);
  await expect(page.locator('#viewLabel')).toContainText('높이 8~15');
  await page.screenshot({path:'artifacts/editor-upper-floor.png'});
  await page.locator('[data-view=iso]').click();
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).view).toBe('iso');
  await page.screenshot({path:'artifacts/editor-isometric.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('project settings can be edited, undone and redone',async({page})=>{
  await page.locator('#projectName').click();
  await page.getByLabel('스테이지 이름',{exact:true}).fill('A2 · 지하 수로');
  await page.locator('#dialog').getByRole('button',{name:'저장',exact:true}).click();
  await expect(page.locator('#projectName')).toHaveText('A2 · 지하 수로');
  await page.locator('[data-action=undo]').click();await expect(page.locator('#projectName')).toHaveText('A1 · 잠든 관측소');
  await page.locator('[data-action=redo]').click();await expect(page.locator('#projectName')).toHaveText('A2 · 지하 수로');
});
test('same XZ overlap is blocked inside a tall tile and allowed above its height',async({page})=>{
  await page.locator('[data-library-tile=start]').click();await page.getByRole('button',{name:'좌표로 배치',exact:true}).click();
  const dialog=page.locator('#dialog');await dialog.getByLabel('층 높이',{exact:true}).fill('1');
  await dialog.getByRole('button',{name:'배치',exact:true}).click();await expect(dialog).toBeVisible();
  await expect(page.locator('#toast')).toContainText('저장 범위와 겹칩니다');
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).placements).toBe(7);
  await dialog.getByLabel('층 높이',{exact:true}).fill('2');await dialog.getByRole('button',{name:'배치',exact:true}).click();
  await expect(dialog).not.toBeVisible();expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).placements).toBe(8);
  await page.locator('[data-action=undo]').click();expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).placements).toBe(7);
});
test('Create NBT import, project download and project restore preserve source bytes',async({page})=>{
  const bytes=fixture();await page.locator('#nbtInput').setInputFiles({name:'copycat_test.nbt',mimeType:'application/octet-stream',buffer:bytes});
  await expect(page.locator('#inspectorContent')).toContainText('copycat_test.nbt');
  await expect(page.locator('#inspectorContent')).toContainText('포함 네임스페이스: create');
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-action=save]').click();const download=await downloadPromise;
  const saved=await readFile(await download.path(),'utf8');const project=JSON.parse(saved);
  expect(download.suggestedFilename()).toMatch(/\.esproject$/);expect(project.format).toBe('erosionsector-project');
  expect(Buffer.from(project.tiles.at(-1).asset.bytes,'base64')).toEqual(bytes);
  await page.locator('#projectInput').setInputFiles({name:'backup.esproject',mimeType:'application/json',buffer:Buffer.from(saved)});
  await expect(page.locator('#toast')).toContainText('프로젝트를 불러왔습니다');
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).tiles.at(-1).asset.bytes).toBe(project.tiles.at(-1).asset.bytes);
  await expect(page.locator('#saveStatus')).toHaveText('자동 저장됨');await page.reload();await page.waitForFunction(()=>!!globalThis.EROSIONSECTOR_EDITOR);
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).tiles.at(-1).asset.bytes).toBe(project.tiles.at(-1).asset.bytes);
});
test('stage download uses the Erosion Sector file extension and schema',async({page})=>{
  const pending=page.waitForEvent('download');await page.locator('[data-action=export]').click();const download=await pending;
  expect(download.suggestedFilename()).toMatch(/\.esfile$/);
  const stage=JSON.parse(await readFile(await download.path(),'utf8'));expect(stage.format).toBe('erosionsector-stage');expect(stage.runtimeReady).toBe(false);
});

test('freeform design tiles use block dimensions and require an initial door',async({page})=>{
  await page.locator('[data-action=new-tile]').click();const dialog=page.locator('#dialog');
  await dialog.getByLabel('가로 X · 블록',{exact:true}).fill('17');
  await dialog.getByLabel('깊이 Z · 블록',{exact:true}).fill('19');
  await dialog.getByLabel('높이 Y · 블록',{exact:true}).fill('16');
  await dialog.getByRole('button',{name:'타일 만들기',exact:true}).click();
  await expect(dialog).not.toBeVisible();const tile=(await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).tiles.at(-1);
  expect(tile.size).toEqual({x:17,y:16,z:19});expect(tile.ports).toHaveLength(1);
  await page.locator('[data-edit-port]').click();await dialog.locator('[data-remove-port]').click();
  await expect(page.locator('#toast')).toContainText('최소 하나');
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).tiles.at(-1).ports).toHaveLength(1);
});

test('NBT occupancy permits overlapping air volumes, blocks a real collision, and saves directional conditions',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const bytes=doorFixture({size:[17,8,19],width:4,height:4,access:'ALARM',compressed:true});
  const dialog=page.locator('#dialog');
  async function importAndPlace(name,x){
    await page.locator('#nbtInput').setInputFiles({name,mimeType:'application/octet-stream',buffer:bytes});
    await expect(page.locator('#inspectorContent')).toContainText(name);
    await page.getByRole('button',{name:'좌표로 배치',exact:true}).click();
    await dialog.getByLabel('X',{exact:true}).fill(String(x));await dialog.getByLabel('Z',{exact:true}).fill('64');
    await dialog.getByRole('button',{name:'배치',exact:true}).click();
  }
  await importAndPlace('freeform_a.nbt',64);await expect(dialog).not.toBeVisible();
  await importAndPlace('freeform_b.nbt',66);await expect(dialog).not.toBeVisible();
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).placements.at(-1).x).toBe(66/16);
  await page.getByRole('button',{name:'타일 원본과 연결구 편집 →'}).click();
  await page.locator('[data-edit-port]').click();await dialog.getByLabel('이쪽에서 여는 조건',{exact:true}).selectOption('HOLD');
  await dialog.getByRole('button',{name:'저장',exact:true}).click();
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).tiles.at(-1).ports[0].doorSettings.access).toBe('HOLD');
  await page.getByRole('button',{name:'좌표로 배치',exact:true}).click();
  await dialog.getByLabel('X',{exact:true}).fill('64');await dialog.getByLabel('Z',{exact:true}).fill('64');
  await dialog.getByRole('button',{name:'배치',exact:true}).click();
  await expect(dialog).toBeVisible();await expect(page.locator('#toast')).toContainText('블록과 겹칩니다');
  await page.screenshot({path:'artifacts/freeform-block-collision.png'});
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).placements).toHaveLength(9);expect(errors).toEqual([]);
});
test('gimmicks can be placed and connected through an event',async({page})=>{
  await page.locator('[data-tab=gimmicks]').click();await page.locator('[data-gimmick-type=terminal]').click();
  const box=await page.locator('#map').boundingBox();
  const scale=Math.max(22,Math.min(90,(box.width-130)/8,(box.height-155)/3));
  const panX=box.width/2-1.5*scale,panY=box.height/2-1*scale-5;
  await page.locator('#map').click({position:{x:panX+.5*scale,y:panY+.5*scale}});
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).gimmicks).toBe(7);
  await page.getByLabel('표시 이름',{exact:true}).fill('상층 문 제어');await page.getByLabel('표시 이름',{exact:true}).press('Tab');
  await page.locator('[data-action=add-link]').click();await page.locator('#dialog').getByRole('button',{name:'저장',exact:true}).click();
  const p=await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());expect(p.links).toHaveLength(3);expect(p.gimmicks.at(-1).name).toBe('상층 문 제어');
});
test('narrow screens expose library and inspector without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('[data-action=toggle-library]').click();await expect(page.locator('#libraryPanel')).toBeVisible();
  await page.locator('[data-library-tile=start]').click();await expect(page.locator('#libraryPanel')).not.toBeVisible();
  await page.locator('[data-action=toggle-inspector]').click();await expect(page.locator('#inspectorPanel')).toBeVisible();
  await page.screenshot({path:'artifacts/editor-mobile.png'});
});

test('orbit controls, drag, pan and zoom change the view without editing tiles',async({page})=>{
  const original=await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());
  await expect(page.locator('#isoControls')).toBeHidden();
  await page.locator('[data-view=iso]').click();
  await expect(page.locator('#map')).toHaveAttribute('data-renderer','depth');
  await page.getByRole('button',{name:'시점 오른쪽 회전',exact:true}).click();
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).camera.azimuth).toBe(0);
  await page.getByRole('button',{name:'시점 왼쪽 회전',exact:true}).click();
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).camera.azimuth).toBe(45);
  const box=await page.locator('#map').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+110,y+50,{steps:8});await page.mouse.up();
  let camera=(await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).camera;
  expect(camera.azimuth).toBe(1);expect(camera.elevation).toBe(45);
  await page.keyboard.down('Space');await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y+35,{steps:4});await page.mouse.up();await page.keyboard.up('Space');
  camera=(await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).camera;
  expect(camera.offset).toEqual({x:70,y:35});
  const zoom=await page.locator('#zoomLabel').textContent();await page.getByRole('button',{name:'확대',exact:true}).click();
  expect(await page.locator('#zoomLabel').textContent()).not.toBe(zoom);
  await page.getByRole('button',{name:'시점 초기화',exact:true}).click();
  expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).camera).toEqual({azimuth:45,elevation:30,offset:{x:0,y:0}});
  expect(await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot())).toEqual(original);
  await page.screenshot({path:'artifacts/editor-orbit.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'시점 오른쪽 회전',exact:true})).toBeVisible();
  await page.locator('[data-view=plan]').click();await expect(page.locator('#isoControls')).toBeHidden();
});

test('depth buffer hides rear tiles regardless of submission order',async({page})=>{
  const result=await page.evaluate(async()=>{
    const {createCamera,createIsoRenderer,pickBox}=await import('/iso.mjs');
    const canvas=document.createElement('canvas');canvas.width=240;canvas.height=240;
    const ctx=canvas.getContext('2d'),renderer=createIsoRenderer();
    if(!renderer)return {supported:false};
    try{
      const camera=createCamera({width:240,height:240,scale:70,target:[1,1,1],azimuth:45,elevation:30});
      const rear={id:'rear',min:[0,0,0],max:[1,1,1],color:'#ff3030'},front={id:'front',min:[1.1,0,1.1],max:[2.1,1,2.1],color:'#30ff30'};
      let point;
      for(let y=50;y<190&&!point;y++)for(let x=50;x<190;x++)if(pickBox([rear],camera,x+.5,y+.5)&&pickBox([front],camera,x+.5,y+.5)){point={x,y};break;}
      if(!point)return {supported:true,overlap:false};
      const pixel=list=>{ctx.clearRect(0,0,240,240);renderer.draw(ctx,list,camera,1);return [...ctx.getImageData(point.x,point.y,1,1).data];};
      return {supported:true,overlap:true,front:pixel([front]),a:pixel([front,rear]),b:pixel([rear,front]),picked:pickBox([front,rear],camera,point.x+.5,point.y+.5).id};
    }finally{renderer.destroy();}
  });
  expect(result.supported).toBe(true);expect(result.overlap).toBe(true);expect(result.a).toEqual(result.front);expect(result.b).toEqual(result.front);expect(result.picked).toBe('front');
});

test('clicking stacked geometry selects the visible upper tile',async({page})=>{
  const project=await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());
  project.placements=[{id:'upper',tileId:'start',x:0,y:1,z:0,rotation:0,roomId:'r2',name:'위쪽 타일'},{id:'lower',tileId:'start',x:0,y:0,z:0,rotation:0,roomId:'r1',name:'아래쪽 타일'}];
  project.gimmicks=[];project.links=[];
  await page.locator('#projectInput').setInputFiles({name:'stacked.esproject',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await page.locator('[data-view=iso]').click();await page.getByRole('button',{name:'시점 초기화',exact:true}).click();
  const box=await page.locator('#map').boundingBox();
  await page.locator('#map').click({position:{x:box.width/2,y:box.height/2}});
  await expect(page.locator('#inspectorContent .inspect-title')).toHaveText('위쪽 타일');
  await expect(page.getByLabel('층 높이',{exact:true})).toHaveValue('1');
});

test('disabled WebGL shows an explicit fallback and keeps orbit controls usable',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};});
  await page.reload();await page.waitForFunction(()=>!!globalThis.EROSIONSECTOR_EDITOR);
  await page.locator('[data-view=iso]').click();
  await expect(page.locator('#map')).toHaveAttribute('data-renderer','fallback');await expect(page.locator('#cameraFallback')).toBeVisible();
  await page.getByRole('button',{name:'시점 오른쪽 회전',exact:true}).click();expect((await page.evaluate(()=>EROSIONSECTOR_EDITOR.summary())).camera.azimuth).toBe(0);
});
