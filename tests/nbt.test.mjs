import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {doorFixture} from './fixtures.mjs';
import {parseNbt,inspectStructure} from '../dist/nbt.mjs';
function fixture(size=[16,8,16],marker=true,options={}){return doorFixture({size,marker,...options});}

test('gzip Create structure preserves original bytes and identifies mod namespace',async()=>{
  const original=gzipSync(fixture());const tile=await inspectStructure(original,'copycat.nbt');
  assert.deepEqual(tile.size,{x:16,y:8,z:16});assert.ok(tile.asset.namespaces.includes('create'));
  assert.equal(Buffer.from(tile.asset.bytes,'base64').compare(original),0);assert.equal(tile.asset.sha256.length,64);
});

test('six ceiling drives become one outer 6x4 framed connector with one-second security interaction',async()=>{
  for(const [facing,pos] of [['west',[0,4,5]],['east',[15,4,5]],['north',[5,4,0]],['south',[5,4,15]]]){
    const tile=await inspectStructure(fixture([16,8,16],true,{modern:true,drive:true,facing,pos}));
    assert.equal(tile.ports.length,1);assert.equal(tile.asset.markerCount,1);const port=tile.ports[0];
    assert.equal(port.mount,'ceiling');assert.equal(port.y,1);assert.equal(port.width,6);assert.equal(port.height,4);
    assert.deepEqual(port.frame,{sideThickness:.25,headerThickness:.375,bottom:false});assert.equal(port.doorSettings.hold_ticks,20);assert.equal(port.doorSettings.type,'SECURITY');
    assert.equal(['east','west'].includes(facing)?port.z:port.x,8);
  }
  await assert.rejects(inspectStructure(fixture([16,8,16],true,{modern:true,drive:true,facing:'south',pos:[5,4,15],count:5})),/6개/);
  await assert.rejects(inspectStructure(fixture([16,8,16],true,{modern:true,drive:true,facing:'south',pos:[5,2,15]})),/높이|범위/);
});
test('horizontal sizes are free while non-eight-multiple heights and malformed NBT are rejected',async()=>{
  assert.deepEqual((await inspectStructure(fixture([15,8,16]))).size,{x:15,y:8,z:16});
  await assert.rejects(inspectStructure(fixture([15,9,16])),/규격/);
  assert.throws(()=>parseNbt(new Uint8Array([10,0,0,9])),/잘렸/);
  await assert.rejects(inspectStructure(new Uint8Array([0,0,0])),/NBT/);
});


test('security connectors default to interaction only and preserve explicitly configured conditions',async()=>{
  for(const access of [undefined,'HOLD','ALARM','TERMINAL']){
    const tile=await inspectStructure(fixture([16,8,16],true,{modern:access!==undefined,drive:true,facing:'south',pos:[5,4,15],access}));
    assert.equal(tile.ports[0].doorSettings.access,access??'HOLD');
    assert.equal(tile.ports[0].doorSettings.hold_ticks,20);
  }
});
