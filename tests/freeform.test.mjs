import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject,readProject,placementError,validate,connections,exportStage,bounds,worldPorts} from '../dist/core.mjs';
import {encodeOccupancy,conflictingBlock} from '../dist/occupancy.mjs';
import {inspectStructure} from '../dist/nbt.mjs';
import {doorFixture,structureBytes} from './fixtures.mjs';

test('NBT accepts free horizontal dimensions, all door sizes and a one-block-deep tile',async()=>{
  for(const [width,height] of [[4,4],[6,4],[10,6]]){
    const tile=await inspectStructure(doorFixture({size:[width+3,16,7],width,height,pos:[1,height,0],facing:'north'}));
    assert.deepEqual(tile.size,{x:width+3,y:16,z:7});assert.equal(tile.ports[0].width,width);assert.equal(tile.ports[0].height,height);
    assert.equal(tile.ports[0].y,1);assert.equal(tile.asset.occupancy.count,width+1);
  }
  const thin=await inspectStructure(doorFixture({size:[4,8,1],width:4,pos:[0,4,0],facing:'north'}));
  assert.deepEqual(thin.size,{x:4,y:8,z:1});
  await assert.rejects(inspectStructure(doorFixture({size:[17,12,19]})),/8의 배수/);
  await assert.rejects(inspectStructure(doorFixture({marker:false})),/문이 최소 하나/);
  await assert.rejects(inspectStructure(doorFixture({width:10,height:4})),/규격/);
});

test('air and structure void are skipped while fluids and mod blocks occupy their cell',async()=>{
  const bytes=doorFixture(),base=await import('../dist/nbt.mjs').then(m=>m.parseNbt(bytes));
  base.palette.push(...['minecraft:air','minecraft:cave_air','minecraft:void_air','minecraft:structure_void','minecraft:water'].map(Name=>({Name})));
  for(let i=0;i<5;i++)base.blocks.push({pos:[2+i,2,2],state:2+i});
  const tile=await inspectStructure(structureBytes(base.size,base.palette,base.blocks));
  assert.equal(tile.asset.occupancy.count,8); // six drives, copycat and water
  base.blocks.push({...base.blocks[0]});
  await assert.rejects(inspectStructure(structureBytes(base.size,base.palette,base.blocks)),/중복/);
});

test('overlapping saved volumes are allowed when no actual block overlaps, including explicit air',()=>{
  const p=demoProject();const a=structuredClone(p.tiles[0]),b=structuredClone(a);a.id='a';b.id='b';
  a.asset={occupancy:encodeOccupancy(a.size,[[0,0,0],[1,0,0]])};b.asset={occupancy:encodeOccupancy(b.size,[[2,0,0]])};
  p.tiles=[a,b];p.placements=[{id:'a',tileId:'a',x:0,y:0,z:0,rotation:0,roomId:'r1',name:''}];
  const candidate={...p.placements[0],id:'b',tileId:'b'};assert.equal(placementError(p,candidate),'');
  b.asset={occupancy:encodeOccupancy(b.size,[[1,0,0]])};assert.match(placementError(p,candidate),/블록과 겹칩니다.*X 1, Y 0, Z 0/);
  candidate.y=1;assert.equal(placementError(p,candidate),'');
});

test('voxel collision matches explicit world coordinates through all rotations, translations and negative positions',()=>{
  const size={x:7,y:8,z:5},points=[[0,0,0],[6,7,4],[2,3,1],[3,4,2]],tile={size,asset:{occupancy:encodeOccupancy(size,points)}};
  function world(p){return new Set(points.map(([x,y,z])=>{
    let rx=x,rz=z;if(p.rotation===90){rx=size.z-1-z;rz=x;}else if(p.rotation===180){rx=size.x-1-x;rz=size.z-1-z;}else if(p.rotation===270){rx=z;rz=size.x-1-x;}
    return [rx+p.x*16,y+p.y*8,rz+p.z*16].join(',');
  }));}
  for(const r of [0,90,180,270])for(const s of [0,90,180,270])for(let dx=-7;dx<=7;dx++)for(let dz=-5;dz<=5;dz++){
    const a={x:-3/16,y:0,z:-4/16,rotation:r},b={x:(dx-3)/16,y:0,z:(dz-4)/16,rotation:s},aa=world(a),bb=world(b);
    const expected=[...aa].some(p=>bb.has(p)),hit=conflictingBlock(tile,a,bounds(tile,a),tile,b,bounds(tile,b));
    assert.equal(!!hit,expected);if(hit)assert.ok(aa.has([hit.x,hit.y,hit.z].join(','))&&bb.has([hit.x,hit.y,hit.z].join(',')));
  }
});

test('block alignment is preserved in project restore and stage export, with a minimum door',()=>{
  const p=demoProject();p.placements[0].x=-17/16;p.placements[0].z=19/16;
  assert.deepEqual(readProject(p).placements[0],p.placements[0]);
  const stage=exportStage(p);assert.deepEqual(stage.placements[0].blockPosition,{x:-17,y:0,z:19});assert.equal(stage.tileRules.placementPolicy,'non-air-only');
  const invalid=structuredClone(p);invalid.placements[0].x=.01;assert.throws(()=>readProject(invalid));
  invalid.placements[0].x=0;invalid.tiles[0].ports=[];assert.throws(()=>readProject(invalid),/최소 하나/);
});

test('opposite sides retain independent access conditions while mechanical type must match',()=>{
  const p=demoProject();p.tiles=p.tiles.slice(0,1);const a=p.tiles[0];a.ports=[{id:'e',name:'입구',x:16,y:1,z:8,facing:'east',width:6,height:4,doorSettings:{type:'SECURITY',access:'ALARM'}}];
  const b=structuredClone(a);b.id='other';b.ports=[{...a.ports[0],id:'w',x:0,facing:'west',doorSettings:{type:'SECURITY',access:'HOLD'}}];p.tiles.push(b);
  p.placements=[{id:'a',tileId:a.id,x:0,y:0,z:0,rotation:0},{id:'b',tileId:b.id,x:1,y:0,z:0,rotation:0}];
  assert.equal(connections(p).pairs.length,1);assert.equal(connections(p).pairs[0].a.doorSettings.access,'ALARM');assert.equal(connections(p).pairs[0].b.doorSettings.access,'HOLD');
  b.ports[0].doorSettings.type='NORMAL';assert.equal(connections(p).pairs.length,0);
});

test('new half-door schematics preserve frames and motion and reject missing own-side parts',async()=>{
  const {parseNbt}=await import('../dist/nbt.mjs');
  for(const width of [4,6,10])for(const security of [false,true]){
    const height=width===10?6:4,bytes=doorFixture({size:[17,8,19],pos:[0,height,5],width,height,security,half:true});
    const tile=await inspectStructure(bytes),port=tile.ports[0];
    assert.equal(port.mount,'tile-half');assert.equal(port.frame.bottom,true);assert.equal(port.frame.bottomThickness,width===10?.25:.125);
    assert.equal(port.motion,security?(width===10?'RADIAL_THREE':'HORIZONTAL_SPLIT'):(width===10?'VERTICAL_SPLIT':'LIFT'));
    assert.equal(tile.asset.occupancy.count,width*height+1);
    const nbt=parseNbt(bytes);nbt.blocks=nbt.blocks.filter(b=>!(b.state===2&&b.nbt.LocalRow===1));
    await assert.rejects(inspectStructure(structureBytes(nbt.size,nbt.palette,nbt.blocks)),/빠짐없이/);
  }
});

test('project restore reconstructs collision data and checks physical doors against the preserved NBT',async()=>{
  const {restoreProject}=await import('../dist/nbt.mjs');const p=demoProject(),tile=await inspectStructure(doorFixture({half:true}));
  p.tiles.push(tile);tile.asset.occupancy=encodeOccupancy(tile.size,[]);tile.ports[0].doorSettings.access='HOLD';
  const restored=await restoreProject(p);assert.equal(restored.tiles.at(-1).asset.occupancy.count,25);assert.equal(restored.tiles.at(-1).ports[0].doorSettings.access,'HOLD');
  tile.ports[0].y=2;await assert.rejects(restoreProject(p),/문 위치/);
});
