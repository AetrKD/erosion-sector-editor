import {uid,portError} from './core.mjs';
const MAX_FILE=24*1024*1024, MAX_EXPANDED=64*1024*1024;
export function parseNbt(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder();
  let offset=0,nodes=0;
  function ensure(length){if(length<0||offset+length>view.byteLength)throw new Error('NBT 파일이 잘렸거나 길이 정보가 잘못되었습니다.');}
  function number(method,size){ensure(size);const value=view[method](offset,false);offset+=size;return value;}
  function string(){const length=number('getUint16',2);ensure(length);const result=decoder.decode(bytes.subarray(offset,offset+length));offset+=length;return result;}
  function length(){const value=number('getInt32',4);if(value<0||value>4_000_000)throw new Error('NBT 배열이 허용 크기를 초과합니다.');return value;}
  function tag(type,depth=0){
    if(depth>64||++nodes>4_000_000)throw new Error('NBT 구조가 너무 복잡합니다.');
    switch(type){
      case 1:return number('getInt8',1);
      case 2:return number('getInt16',2);
      case 3:return number('getInt32',4);
      case 4:return number('getBigInt64',8).toString();
      case 5:return number('getFloat32',4);
      case 6:return number('getFloat64',8);
      case 7:{const n=length();ensure(n);const result=bytes.slice(offset,offset+n);offset+=n;return result;}
      case 8:return string();
      case 9:{const child=number('getUint8',1),n=length();if(child===0&&n!==0)throw new Error('잘못된 NBT 목록입니다.');return Array.from({length:n},()=>tag(child,depth+1));}
      case 10:{const result=Object.create(null);while(true){const child=number('getUint8',1);if(child===0)break;const name=string();result[name]=tag(child,depth+1);}return result;}
      case 11:{const n=length();ensure(n*4);return Array.from({length:n},()=>number('getInt32',4));}
      case 12:{const n=length();ensure(n*8);return Array.from({length:n},()=>number('getBigInt64',8).toString());}
      default:throw new Error('지원하지 않는 NBT 태그입니다: '+type);
    }
  }
  if(number('getUint8',1)!==10)throw new Error('Minecraft 구조물 NBT가 아닙니다.');
  string();return tag(10);
}
async function expand(bytes){
  if(bytes[0]!==0x1f||bytes[1]!==0x8b)return bytes;
  if(!globalThis.DecompressionStream)throw new Error('이 브라우저는 gzip 읽기를 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용하세요.');
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks=[];let total=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_EXPANDED){await reader.cancel();throw new Error('압축을 푼 설계도가 64MB를 초과합니다.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
}
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
function doorSettings(meta,security=null){
  const s=meta.door_settings||{},ticks=(n,f,max)=>Number.isInteger(n)?Math.max(1,Math.min(max,n)):f;
  return {type:security===null?(s.type==='SECURITY'?'SECURITY':'NORMAL'):security?'SECURITY':'NORMAL',access:['HOLD','ALARM','TERMINAL'].includes(s.access)?s.access:'HOLD',
    break_rule:['NEVER','ALWAYS','UNLOCKED'].includes(s.break_rule)?s.break_rule:'NEVER',noise_passes:!!s.noise_passes,light_passes:!!s.light_passes,
    hold_ticks:security===true?20:ticks(s.hold_ticks,60,1200),alarm_ticks:ticks(s.alarm_ticks,200,24000),terminal_command:typeof s.terminal_command==='string'?s.terminal_command.slice(0,64):'UNLOCK'};
}
export async function inspectStructure(input,name='tile.nbt'){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>MAX_FILE)throw new Error('설계도 파일은 24MB 이하로 가져오세요.');
  const expanded=await expand(bytes);
  if(expanded.length>MAX_EXPANDED)throw new Error('설계도 데이터가 너무 큽니다.');
  const root=parseNbt(expanded);
  const dimensions=root.size;
  if(!Array.isArray(dimensions)||dimensions.length!==3)throw new Error('Create/바닐라 구조물 NBT만 지원합니다. .schem은 먼저 구조물 .nbt로 변환하세요.');
  const [x,y,z]=dimensions;
  if(![x,y,z].every(Number.isInteger)||x<16||z<16||y<8||x%16||z%16||y%8)throw new Error(`크기 ${x}×${y}×${z}(X×Y×Z)는 규격에 맞지 않습니다. X/Z는 16, Y는 8의 배수여야 합니다.`);
  if([x,y,z].some(d=>d>256))throw new Error('첫 버전은 각 축 256블록 이하의 타일을 지원합니다.');
  const palette=root.palette||root.palettes?.[0];
  if(!Array.isArray(palette)||!Array.isArray(root.blocks))throw new Error('블록 목록 또는 팔레트가 없는 구조물입니다.');
  const tile={id:uid('tile'),name:name.replace(/\.nbt$/i,''),category:'가져온 타일',size:{x,y,z},ports:[],asset:null};
  let markerCount=0;const drives=new Map();
  for(const block of root.blocks){
    if(!Array.isArray(block.pos)||block.pos.length!==3||!Number.isInteger(block.state)||block.state<0||block.state>=palette.length)throw new Error('잘못된 블록 위치 또는 팔레트 참조가 있습니다.');
    const [bx,by,bz]=block.pos;
    if(![bx,by,bz].every(Number.isInteger)||bx<0||bx>=x||by<0||by>=y||bz<0||bz>=z)throw new Error('구조물 범위 밖의 블록이 있습니다.');
    const state=palette[block.state];
    if(['gtbo:door_drive','gtbo:security_door_drive'].includes(state.Name)){
      const facing=state.Properties?.facing||'north';if(!['north','south','east','west'].includes(facing))throw new Error('문 구동부 방향이 올바르지 않습니다.');
      const along=['north','south'].includes(facing)?bx:bz,plane=['north','south'].includes(facing)?bz:bx;
      const key=[state.Name,facing,by,plane].join(':');if(!drives.has(key))drives.set(key,[]);
      drives.get(key).push({bx,by,bz,along,facing,meta:block.nbt||{},security:state.Name==='gtbo:security_door_drive'});continue;
    }
    if(!['gtbo:door_marker','gtbo:door_connector'].includes(state.Name))continue;
    markerCount++;
    const meta=block.nbt||{},properties=state.Properties||{};
    const facing=properties.facing||meta.facing||'north';
    const modern=meta.MarkerVersion===1,width=Number(meta.Width??meta.width??properties.width??2),across=modern?(properties.reversed==='true'?1-width/2:width/2):0.5;
    const port={id:uid('port'),name:typeof meta.Name==='string'?meta.Name:`연결구 ${markerCount}`,facing,
      x:facing==='east'?bx+1:facing==='west'?bx:bx+across,
      z:facing==='south'?bz+1:facing==='north'?bz:bz+across,y:by,
      width,height:Number(meta.Height??meta.height??properties.height??3),required:!!meta.Required};
    if(modern){
      port.doorSettings=doorSettings(meta);
    }
    const error=portError(tile,port);if(error)throw new Error(`문 마커 ${markerCount}: ${error}`);
    tile.ports.push(port);
  }
  for(const row of drives.values()){
    row.sort((a,b)=>a.along-b.along);
    if(row.length%6)throw new Error('문 천장 구동부는 각 타일 외곽에 같은 종류·방향으로 6개 연속 설치해야 합니다.');
    for(let offset=0;offset<row.length;offset+=6){
      const group=row.slice(offset,offset+6),first=group[0],{bx,by,bz,facing,security}=first,settings=doorSettings(first.meta,security);
      if(group.some((d,i)=>d.along!==first.along+i||JSON.stringify(doorSettings(d.meta,security))!==JSON.stringify(settings)))throw new Error('문 구동부 6개의 간격 또는 설정이 서로 다릅니다.');
      const port={id:uid('port'),name:`${security?'보안 문':'일반 문'} ${++markerCount}`,facing,
        x:facing==='east'?bx+1:facing==='west'?bx:bx+3,z:facing==='south'?bz+1:facing==='north'?bz:bz+3,y:by-3,
        width:6,height:4,required:true,mount:'ceiling',frame:{sideThickness:.25,headerThickness:.375,bottom:false},doorSettings:settings};
      const error=portError(tile,port);if(error)throw new Error(`문 구동부: ${error}`);tile.ports.push(port);
    }
  }
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  tile.asset={name,bytes:base64(bytes),sha256:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join(''),
    blockCount:root.blocks.length,paletteCount:palette.length,entityCount:root.entities?.length||0,markerCount,
    namespaces:[...new Set(palette.map(state=>(state.Name||'').split(':')[0]))].filter(Boolean),dataVersion:root.DataVersion||null};
  return tile;
}
