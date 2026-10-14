import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {parseNbt,inspectStructure} from '../dist/nbt.mjs';
function fixture(size=[16,8,16],marker=false,options={}){
  const parts=[];const byte=n=>parts.push(Buffer.from([n]));
  const int=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);parts.push(b);};
  const str=s=>{const b=Buffer.from(s),len=Buffer.alloc(2);len.writeUInt16BE(b.length);parts.push(len,b);};
  byte(10);str('');byte(9);str('size');byte(3);int(3);size.forEach(int);
  byte(9);str('palette');byte(10);int(1);byte(8);str('Name');str(marker?'gtbo:door_marker':'create:copycat_panel');
  if(marker){byte(10);str('Properties');byte(8);str('facing');str(options.facing||'west');if(options.reversed){byte(8);str('reversed');str('true');}byte(0);}byte(0);
  byte(9);str('blocks');byte(10);int(1);byte(9);str('pos');byte(3);int(3);(options.pos||[0,1,8]).forEach(int);byte(3);str('state');int(0);
  byte(10);str('nbt');byte(8);str('Material');str('minecraft:iron_block');
  if(options.modern){
    for(const [key,value] of [['MarkerVersion',1],['Width',6],['Height',4]]){byte(3);str(key);int(value);}
    byte(1);str('Required');byte(1);byte(10);str('door_settings');
    for(const [key,value] of [['type','SECURITY'],['access','TERMINAL'],['break_rule','UNLOCKED'],['terminal_command','UNLOCK LAB']]){byte(8);str(key);str(value);}
    byte(1);str('noise_passes');byte(1);byte(1);str('light_passes');byte(0);byte(0);
  }
  byte(0);byte(0);byte(0);
  return Buffer.concat(parts);
}
test('gzip Create structure preserves original bytes and identifies mod namespace',async()=>{
  const original=gzipSync(fixture());const tile=await inspectStructure(original,'copycat.nbt');
  assert.deepEqual(tile.size,{x:16,y:8,z:16});assert.ok(tile.asset.namespaces.includes('create'));
  assert.equal(Buffer.from(tile.asset.bytes,'base64').compare(original),0);assert.equal(tile.asset.sha256.length,64);
});
test('door marker is interpreted as a horizontal boundary connector',async()=>{
  const tile=await inspectStructure(fixture([16,8,16],true));
  assert.equal(tile.asset.markerCount,1);assert.equal(tile.ports[0].facing,'west');assert.equal(tile.ports[0].x,0);
});
test('non-grid dimensions and malformed NBT are rejected',async()=>{
  await assert.rejects(inspectStructure(fixture([15,8,16])),/규격/);
  assert.throws(()=>parseNbt(new Uint8Array([10,0,0,9])),/잘렸/);
  await assert.rejects(inspectStructure(new Uint8Array([0,0,0])),/NBT/);
});

test('6x4 corner markers import their center, floor and independent door traits in every direction',async()=>{
  for(const [facing,pos,expected] of [['west',[0,9,5],{x:0,y:9,z:8}],['east',[15,1,5],{x:16,y:1,z:8}],['north',[5,1,0],{x:8,y:1,z:0}],['south',[5,9,15],{x:8,y:9,z:16}]]){
    const tile=await inspectStructure(fixture([16,16,16],true,{modern:true,facing,pos}));const p=tile.ports[0];
    assert.deepEqual({x:p.x,y:p.y,z:p.z},expected);assert.equal(p.width,6);assert.equal(p.height,4);assert.equal(p.required,true);
    assert.deepEqual(p.doorSettings,{type:'SECURITY',access:'TERMINAL',break_rule:'UNLOCKED',noise_passes:true,light_passes:false,hold_ticks:60,alarm_ticks:200,terminal_command:'UNLOCK LAB'});
  }
  await assert.rejects(inspectStructure(fixture([16,8,16],true,{modern:true,facing:'west',pos:[0,1,14]})),/범위|외곽/);
  const mirrored=await inspectStructure(fixture([16,8,16],true,{modern:true,facing:'west',pos:[0,1,10],reversed:true}));
  assert.equal(mirrored.ports[0].z,8);
});
