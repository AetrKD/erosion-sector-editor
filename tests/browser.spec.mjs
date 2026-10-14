import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
function fixture(){
  const parts=[];const byte=n=>parts.push(Buffer.from([n]));const int=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);parts.push(b);};
  const str=s=>{const b=Buffer.from(s),len=Buffer.alloc(2);len.writeUInt16BE(b.length);parts.push(len,b);};
  byte(10);str('');byte(9);str('size');byte(3);int(3);[16,8,16].forEach(int);
  byte(9);str('palette');byte(10);int(1);byte(8);str('Name');str('create:copycat_panel');byte(0);
  byte(9);str('blocks');byte(10);int(1);byte(9);str('pos');byte(3);int(3);[0,1,8].forEach(int);byte(3);str('state');int(0);byte(0);byte(0);
  return gzipSync(Buffer.concat(parts));
}
test.beforeEach(async({page})=>{await page.goto('/');await page.waitForFunction(()=>!!globalThis.GTBO_EDITOR);});
test('desktop initial stage, layer slicing and isometric view render without browser errors',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.locator('#projectName')).toHaveText('A1 · 잠든 관측소');
  expect((await page.evaluate(()=>GTBO_EDITOR.summary())).placements).toBe(7);
  expect((await page.evaluate(()=>GTBO_EDITOR.summary())).issues.filter(i=>i.severity==='error')).toHaveLength(0);
  await page.screenshot({path:'artifacts/editor-desktop.png'});
  await page.getByRole('button',{name:'2층',exact:true}).click();
  expect((await page.evaluate(()=>GTBO_EDITOR.summary())).floor).toBe(1);
  await expect(page.locator('#viewLabel')).toContainText('높이 8~15');
  await page.screenshot({path:'artifacts/editor-upper-floor.png'});
  await page.locator('[data-view=iso]').click();
  expect((await page.evaluate(()=>GTBO_EDITOR.summary())).view).toBe('iso');
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
  expect((await page.evaluate(()=>GTBO_EDITOR.summary())).placements).toBe(7);
  await dialog.getByLabel('층 높이',{exact:true}).fill('2');await dialog.getByRole('button',{name:'배치',exact:true}).click();
  await expect(dialog).not.toBeVisible();expect((await page.evaluate(()=>GTBO_EDITOR.summary())).placements).toBe(8);
  await page.locator('[data-action=undo]').click();expect((await page.evaluate(()=>GTBO_EDITOR.summary())).placements).toBe(7);
});
test('Create NBT import, project download and project restore preserve source bytes',async({page})=>{
  const bytes=fixture();await page.locator('#nbtInput').setInputFiles({name:'copycat_test.nbt',mimeType:'application/octet-stream',buffer:bytes});
  await expect(page.locator('#inspectorContent')).toContainText('copycat_test.nbt');
  await expect(page.locator('#inspectorContent')).toContainText('포함 네임스페이스: create');
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-action=save]').click();const download=await downloadPromise;
  const saved=await readFile(await download.path(),'utf8');const project=JSON.parse(saved);
  expect(Buffer.from(project.tiles.at(-1).asset.bytes,'base64')).toEqual(bytes);
  await page.locator('#projectInput').setInputFiles({name:'backup.gtboproject.json',mimeType:'application/json',buffer:Buffer.from(saved)});
  await expect(page.locator('#toast')).toContainText('프로젝트를 불러왔습니다');
  expect((await page.evaluate(()=>GTBO_EDITOR.snapshot())).tiles.at(-1).asset.bytes).toBe(project.tiles.at(-1).asset.bytes);
  await expect(page.locator('#saveStatus')).toHaveText('자동 저장됨');await page.reload();await page.waitForFunction(()=>!!globalThis.GTBO_EDITOR);
  expect((await page.evaluate(()=>GTBO_EDITOR.snapshot())).tiles.at(-1).asset.bytes).toBe(project.tiles.at(-1).asset.bytes);
});
test('gimmicks can be placed and connected through an event',async({page})=>{
  await page.locator('[data-tab=gimmicks]').click();await page.locator('[data-gimmick-type=terminal]').click();
  const box=await page.locator('#map').boundingBox();
  const scale=Math.max(22,Math.min(90,(box.width-130)/8,(box.height-155)/3));
  const panX=box.width/2-1.5*scale,panY=box.height/2-1*scale-5;
  await page.locator('#map').click({position:{x:panX+.5*scale,y:panY+.5*scale}});
  expect((await page.evaluate(()=>GTBO_EDITOR.summary())).gimmicks).toBe(7);
  await page.getByLabel('표시 이름',{exact:true}).fill('상층 문 제어');await page.getByLabel('표시 이름',{exact:true}).press('Tab');
  await page.locator('[data-action=add-link]').click();await page.locator('#dialog').getByRole('button',{name:'저장',exact:true}).click();
  const p=await page.evaluate(()=>GTBO_EDITOR.snapshot());expect(p.links).toHaveLength(3);expect(p.gimmicks.at(-1).name).toBe('상층 문 제어');
});
test('narrow screens expose library and inspector without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('[data-action=toggle-library]').click();await expect(page.locator('#libraryPanel')).toBeVisible();
  await page.locator('[data-library-tile=start]').click();await expect(page.locator('#libraryPanel')).not.toBeVisible();
  await page.locator('[data-action=toggle-inspector]').click();await expect(page.locator('#inspectorPanel')).toBeVisible();
  await page.screenshot({path:'artifacts/editor-mobile.png'});
});
