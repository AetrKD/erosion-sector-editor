import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8,strFromU8} from '../dist/vendor/fflate.mjs';
import {demoProject,readProject,tileReference} from '../dist/core.mjs';
import {packStage,unpackStage} from '../dist/stage-file.mjs';
import {inspectStructure,restoreProject,loadTileFolder} from '../dist/nbt.mjs';
import {doorFixture} from './fixtures.mjs';

const file=(path,bytes)=>({name:path.split('/').at(-1),webkitRelativePath:'tile/'+path,size:bytes.length,arrayBuffer:async()=>bytes});

test('one ZIP stage is both editable project and stage, and contains only configuration JSON',async()=>{
  const p=demoProject(),tile=await inspectStructure(doorFixture({half:true}),'복도.nbt');tile.asset.reference='연구소/복도.nbt';p.tiles.push(tile);
  p.author='제작 팀';p.difficulty='매우 어려움';p.chapter={id:'chapter-b',name:'침식 연구소',description:'격리 구역 탐사'};p.missionCode='B3';
  p.placements[0].x=-17/16;p.placements[0].z=19/16;
  tile.ports[0].doorSettings.access='ALARM';
  const bytes=packStage(p),files=unzipSync(bytes);
  assert.deepEqual([...bytes.subarray(0,4)],[80,75,3,4]);
  assert.deepEqual(Object.keys(files).sort(),['layout.json','logic.json','manifest.json','stage.json','tiles.json']);
  const metadata=JSON.parse(strFromU8(files['stage.json']));assert.equal(metadata.author,'제작 팀');assert.equal(metadata.difficulty,'매우 어려움');
  const savedTiles=JSON.parse(strFromU8(files['tiles.json']));assert.equal(savedTiles.at(-1).asset.reference,'연구소/복도.nbt');
  assert.ok(!Object.hasOwn(savedTiles.at(-1).asset,'bytes'));assert.ok(!Object.hasOwn(savedTiles.at(-1).asset,'occupancy'));
  assert.ok(!Object.values(files).some(b=>strFromU8(b).includes(tile.asset.bytes)));
  const restored=await restoreProject(unpackStage(bytes));
  for(const key of ['author','difficulty','chapter','missionCode','name','description','placements','rooms','zones','gimmicks','links'])assert.deepEqual(restored[key],p[key]);
  assert.deepEqual(restored.tiles.at(-1).ports,tile.ports);assert.equal(restored.tiles.at(-1).asset.bytes,undefined);
  assert.equal(unpackStage(packStage(restored)).tiles.at(-1).asset.reference,'연구소/복도.nbt');
});

test('legacy stages default missing metadata while malformed author or difficulty is rejected',()=>{
  const files=unzipSync(packStage(demoProject())),stage=JSON.parse(strFromU8(files['stage.json']));
  delete stage.author;delete stage.difficulty;files['stage.json']=strToU8(JSON.stringify(stage));
  const restored=unpackStage(zipSync(files));assert.equal(restored.author,'');assert.equal(restored.difficulty,'');
  assert.equal(unpackStage(packStage(restored)).author,'');
  for(const [key,value] of [['author',42],['author','x'.repeat(161)],['difficulty',null],['difficulty','x'.repeat(81)]]){
    const invalid=demoProject();invalid[key]=value;assert.throws(()=>readProject(invalid),/작성자 또는 스테이지 난이도/);
  }
});

test('relative paths require a tile set, reject traversal and distinguish identical basenames',()=>{
  for(const path of ['복도.nbt','../복도.nbt','연구소/../복도.nbt','/연구소/복도.nbt','C:/tile/복도.nbt','연구소\\복도.nbt','연구소//복도.nbt','연구소/복도.json'])assert.equal(tileReference(path),false,path);
  for(const path of ['연구소/복도.nbt','공장/복도.nbt','공장/하층/복도.nbt'])assert.equal(tileReference(path),true,path);
});

test('a folder reattaches exact set/path names and retains per-side door conditions',async()=>{
  const a=doorFixture({half:true}),b=doorFixture({half:true,width:6});
  let p=demoProject();const tile=await inspectStructure(a,'복도.nbt');tile.asset.reference='연구소/복도.nbt';tile.ports[0].doorSettings.access='ALARM';p.tiles.push(tile);
  p=unpackStage(packStage(p));
  const result=await loadTileFolder(p,[file('공장/복도.nbt',b),file('연구소/복도.nbt',a)]);
  const attached=result.project.tiles.find(t=>t.id===tile.id);
  assert.equal(result.linked,1);assert.equal(result.added,1);assert.equal(attached.asset.bytes,tile.asset.bytes);assert.ok(attached.asset.occupancy.count>0);
  assert.equal(attached.ports[0].doorSettings.access,'ALARM');assert.equal(result.project.tiles.at(-1).asset.reference,'공장/복도.nbt');
  const wrong=await loadTileFolder(p,[file('공장/복도.nbt',a)]);
  assert.equal(wrong.linked,0);assert.equal(wrong.project.tiles.find(t=>t.id===tile.id).asset.bytes,undefined);
  const changedRoot=await loadTileFolder(result.project,[file('공장/복도.nbt',a)]);
  assert.equal(changedRoot.project.tiles.find(t=>t.id===tile.id).asset.bytes,undefined);
  await assert.rejects(loadTileFolder(p,[file('연구소/복도.nbt',doorFixture({half:true,security:false}))]),/저장 당시 원본과 다릅니다/);
});

test('a set named tile is preserved while an optional workspace root is stripped',async()=>{
  const bytes=doorFixture(),p=demoProject();
  const direct=await loadTileFolder(p,[file('tile/복도.nbt',bytes)]);assert.equal(direct.project.tiles.at(-1).asset.reference,'tile/복도.nbt');
  const wrapped=file('연구소/복도.nbt',bytes);wrapped.webkitRelativePath='ErosionSector/tile/연구소/복도.nbt';
  const workspace=await loadTileFolder(p,[wrapped]);assert.equal(workspace.project.tiles.at(-1).asset.reference,'연구소/복도.nbt');
});

test('missing source remains editable and drops untrusted collision masks until reconnection',async()=>{
  const p=demoProject(),tile=await inspectStructure(doorFixture(),'복도.nbt');tile.asset.reference='연구소/복도.nbt';p.tiles.push(tile);
  delete tile.asset.bytes;
  const restored=await restoreProject(p);assert.equal(restored.tiles.at(-1).asset.occupancy,undefined);assert.deepEqual(restored.gimmicks,p.gimmicks);
  delete tile.asset.reference;assert.throws(()=>packStage(p),/tile 폴더 기준 경로/);
});

test('archives reject embedded NBT, unsafe entries, missing sections, invalid manifests and invalid coordinates',()=>{
  const original=unzipSync(packStage(demoProject()));
  const corrupt=mutate=>{const files=structuredClone(original);mutate(files);return zipSync(files);};
  assert.throws(()=>unpackStage(corrupt(f=>f['tiles/복도.nbt']=new Uint8Array([1,2]))),/JSON 설정만/);
  assert.throws(()=>unpackStage(corrupt(f=>f['../outside.json']=strToU8('{}'))),/JSON 설정만/);
  assert.throws(()=>unpackStage(corrupt(f=>delete f['logic.json'])),/누락/);
  assert.throws(()=>unpackStage(corrupt(f=>f['logic.json']=strToU8('invalid'))),/JSON 설정/);
  assert.throws(()=>unpackStage(corrupt(f=>{const m=JSON.parse(strFromU8(f['manifest.json']));m.version=1;f['manifest.json']=strToU8(JSON.stringify(m));})),/지원하는/);
  assert.throws(()=>unpackStage(corrupt(f=>{const l=JSON.parse(strFromU8(f['layout.json']));l.placements[0].blockPosition.y=1;f['layout.json']=strToU8(JSON.stringify(l));})),/배치 좌표/);
  assert.throws(()=>unpackStage(strToU8(JSON.stringify(demoProject()))));
  const p=demoProject();p.chapter.name=42;assert.throws(()=>readProject(p),/챕터/);
});

test('oversized expanded ZIP entries are rejected before allocating decompressed output',()=>{
  const bytes=packStage(demoProject()).slice(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let found=false;for(let i=0;i<bytes.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,65*1024*1024,true);found=true;break;}
  assert.ok(found);assert.throws(()=>unpackStage(bytes),/64MB/);
});
