import {uid,portError,readProject,tileReference} from './core.mjs';
import {AIR,encodeOccupancy} from './occupancy.mjs';
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
    hold_ticks:security===true?20:ticks(s.hold_ticks,60,1200),alarm_ticks:ticks(s.alarm_ticks,200,24000),key_id:typeof s.key_id==='string'?s.key_id.slice(0,96):'',terminal_command:typeof s.terminal_command==='string'?s.terminal_command.slice(0,64):'UNLOCK'};
}
export async function readStructure(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>MAX_FILE)throw new Error('설계도 파일은 24MB 이하로 가져오세요.');
  const expanded=await expand(bytes);
  if(expanded.length>MAX_EXPANDED)throw new Error('설계도 데이터가 너무 큽니다.');
  const root=parseNbt(expanded);
  const size=root.size,palette=root.palette||root.palettes?.[0];
  if(!Array.isArray(size)||size.length!==3||!size.every(n=>Number.isInteger(n)&&n>0&&n<=256)||!Array.isArray(palette)||!Array.isArray(root.blocks)||root.blocks.length>250000)throw new Error('미리보기는 각 축 256블록, 저장 블록 25만 개 이하인 구조물 NBT를 지원합니다.');
  const seen=new Set();for(const b of root.blocks){if(!Array.isArray(b.pos)||b.pos.length!==3||b.pos.some((n,i)=>!Number.isInteger(n)||n<0||n>=size[i])||!Number.isInteger(b.state)||!palette[b.state]||typeof palette[b.state].Name!=='string')throw new Error('설계도 블록 정보가 올바르지 않습니다.');const key=b.pos.join(',');if(seen.has(key))throw new Error('중복된 블록 좌표입니다.');seen.add(key);}
  return root;
}
export async function inspectStructure(input,name='tile.nbt'){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),root=await readStructure(bytes);
  const dimensions=root.size;
  if(!Array.isArray(dimensions)||dimensions.length!==3)throw new Error('Create/바닐라 구조물 NBT만 지원합니다. .schem은 먼저 구조물 .nbt로 변환하세요.');
  const [x,y,z]=dimensions;
  if(![x,y,z].every(Number.isInteger)||x<1||z<1||y<8||y%8)throw new Error(`크기 ${x}×${y}×${z}(X×Y×Z)는 규격에 맞지 않습니다. 가로·깊이는 양의 정수, 높이는 8의 배수여야 합니다.`);
  if([x,y,z].some(d=>d>256))throw new Error('첫 버전은 각 축 256블록 이하의 타일을 지원합니다.');
  const palette=root.palette||root.palettes?.[0];
  if(!Array.isArray(palette)||!Array.isArray(root.blocks))throw new Error('블록 목록 또는 팔레트가 없는 구조물입니다.');
  const tile={id:uid('tile'),name:name.replace(/\.nbt$/i,''),category:'가져온 타일',size:{x,y,z},ports:[],asset:null};
  let markerCount=0;const drives=new Map(),seen=new Map();
  for(const block of root.blocks){
    if(!Array.isArray(block.pos)||block.pos.length!==3||!Number.isInteger(block.state)||block.state<0||block.state>=palette.length)throw new Error('잘못된 블록 위치 또는 팔레트 참조가 있습니다.');
    const [bx,by,bz]=block.pos;
    if(![bx,by,bz].every(Number.isInteger)||bx<0||bx>=x||by<0||by>=y||bz<0||bz>=z)throw new Error('구조물 범위 밖의 블록이 있습니다.');
    const state=palette[block.state];
    if(!state||typeof state.Name!=='string')throw new Error('블록 팔레트 이름이 올바르지 않습니다.');
    const index=bx+x*(bz+z*by);if(seen.has(index))throw new Error('설계도에 중복된 블록 좌표가 있습니다.');seen.set(index,block);
    if(['erosionsector:door_drive','erosionsector:security_door_drive','erosionsector:tile_door_drive','erosionsector:tile_security_door_drive'].includes(state.Name)){
      const facing=state.Properties?.facing||'north';if(!['north','south','east','west'].includes(facing))throw new Error('문 구동부 방향이 올바르지 않습니다.');
      const along=['north','south'].includes(facing)?bx:bz,plane=['north','south'].includes(facing)?bz:bx;
      const key=[state.Name,facing,by,plane].join(':');if(!drives.has(key))drives.set(key,[]);
      const meta=block.nbt||{},width=meta.Width??6,height=meta.Height??4;
      if(![[4,4],[6,4],[10,6]].some(([w,h])=>width===w&&height===h))throw new Error('지원하는 문 규격은 4×4, 6×4, 10×6입니다.');
      drives.get(key).push({bx,by,bz,along,facing,meta,width,height,half:state.Name.includes(':tile_'),security:state.Name.endsWith('security_door_drive')});continue;
    }

  }
  for(const row of drives.values()){
    row.sort((a,b)=>a.along-b.along);
    for(let offset=0;offset<row.length;){
      const first=row[offset],{bx,by,bz,facing,security,width,height,half}=first,group=row.slice(offset,offset+width),settings=doorSettings(first.meta,security);
      if(group.length!==width||group.some((d,i)=>d.along!==first.along+i||d.width!==width||d.height!==height||JSON.stringify(doorSettings(d.meta,security))!==JSON.stringify(settings)))throw new Error(`문 구동부 ${width}개의 간격·규격 또는 같은 쪽 설정이 서로 다릅니다.`);
      if(half){
        if(group.some(d=>!d.meta.HalfReady||d.meta.LocalRow!==height-1))throw new Error('반쪽 문의 구동부 정보가 올바르지 않습니다.');
        for(let y0=0;y0<height-1;y0++)for(let col=0;col<width;col++){
          const px=bx+(['north','south'].includes(facing)?col:0),py=by-height+1+y0,pz=bz+(['east','west'].includes(facing)?col:0);
          const block=seen.get(px+x*(pz+z*py)),state=block&&palette[block.state];
          if(!block||state.Name!=='erosionsector:tile_door_part'||state.Properties?.facing!==facing||(state.Properties?.sliding==='true')!==security||!block.nbt?.HalfReady||block.nbt.Width!==width||block.nbt.Height!==height||block.nbt.LocalRow!==y0)throw new Error('타일 안에 반쪽 문의 본체와 프레임을 빠짐없이 포함해 저장하세요.');
        }
      }
      const port={id:uid('port'),name:`${security?'보안 문':'일반 문'} ${++markerCount}`,facing,
        x:facing==='east'?bx+1:facing==='west'?bx:bx+width/2,z:facing==='south'?bz+1:facing==='north'?bz:bz+width/2,y:by-(height-1),
        width,height,required:true,mount:half?'tile-half':'ceiling',frame:half?{sideThickness:.25,headerThickness:width===10?.25:security?.125:.375,bottom:true,bottomThickness:width===10?.25:.125}:{sideThickness:.25,headerThickness:.375,bottom:false},doorSettings:settings,
        motion:half?(security?(width===10?'RADIAL_THREE':'HORIZONTAL_SPLIT'):(width===10?'VERTICAL_SPLIT':'LIFT')):security?'HORIZONTAL_SPLIT':'LIFT'};
      const error=portError(tile,port);if(error)throw new Error(`문 구동부: ${error}`);tile.ports.push(port);
      offset+=width;
    }
  }
  if(!tile.ports.length)throw new Error('타일 설계도에는 외곽의 Erosion Sector 문이 최소 하나 필요합니다.');
  const slots=[];
  for(const b of root.blocks){const state=palette[b.state],id=state.Name,props=state.Properties||{};const container=/chest|barrel|shulker_box|hopper|dispenser|dropper|furnace|brewing_stand|toolbox|supply_container|supply_small|supply_medium|supply_large/.test(id)||Array.isArray(b.nbt?.Items);if(!container)continue;if(id.includes('supply_')&&(Number(props.column||0)!==0||Number(props.layer||0)!==0))continue;slots.push({id:b.pos.join(','),kind:'container',position:{x:b.pos[0],y:b.pos[1],z:b.pos[2]},capacity:id.endsWith('supply_small')?1:id.endsWith('supply_medium')?3:id.endsWith('supply_large')?5:id.endsWith('supply_container')?9:id.includes('hopper')?5:/furnace|brewing_stand/.test(id)?3:/dispenser|dropper/.test(id)?9:id.includes('toolbox')?8:27,block:id});}
  for(const e of root.entities||[]){const n=e.nbt||{};if(!['minecraft:item_frame','minecraft:glow_item_frame'].includes(n.id))continue;const pos=e.blockPos||e.pos||[0,0,0];slots.push({id:'frame:'+slots.length,kind:'object',position:{x:pos[0],y:pos[1],z:pos[2]},facing:n.Facing??2});}
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  tile.asset={name,bytes:base64(bytes),sha256:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join(''),
    slots,blockCount:root.blocks.length,paletteCount:palette.length,entityCount:root.entities?.length||0,markerCount,
    namespaces:[...new Set(palette.map(state=>(state.Name||'').split(':')[0]))].filter(Boolean),dataVersion:root.DataVersion||null,
    occupancy:encodeOccupancy(tile.size,(function*(){for(const block of root.blocks)if(!AIR.has(palette[block.state].Name))yield block.pos;})())};
  return tile;
}
/** Rebuild derived collision data from the preserved source instead of trusting a saved mask. */
export async function restoreProject(input){
  const project=readProject(input);
  for(const tile of project.tiles){
    if(!tile.asset)continue;
    if(!tile.asset.bytes){delete tile.asset.occupancy;continue;}
    const bytes=Uint8Array.from(atob(tile.asset.bytes),c=>c.charCodeAt(0)),source=await inspectStructure(bytes,tile.asset.name);
    mergeTileSource(tile,source);
  }
  return project;
}
function mergeTileSource(tile,source){
    tile.asset.slots=source.asset.slots;
    if(source.asset.sha256!==tile.asset.sha256||['x','y','z'].some(k=>source.size[k]!==tile.size[k]))throw new Error(`${tile.name}: 참조 경로의 NBT가 저장 당시 원본과 다릅니다. 설계도 교체로 명시적으로 갱신하세요.`);
    const remaining=[...source.ports];
    for(const port of tile.ports){
      const index=remaining.findIndex(q=>['facing','x','y','z','width','height'].every(k=>q[k]===port[k])&&q.doorSettings.type===(port.doorSettings?.type||'NORMAL'));
      if(index<0)throw new Error(`${tile.name}: 문 위치·크기·종류가 원본 설계도와 다릅니다. 설계도를 다시 연결하세요.`);
      const [actual]=remaining.splice(index,1);port.frame=actual.frame;port.mount=actual.mount;port.motion=actual.motion;
    }
    if(remaining.length)throw new Error(`${tile.name}: 원본 설계도의 문을 모두 포함해야 합니다.`);
    tile.asset={...source.asset,...(tile.asset.reference?{reference:tile.asset.reference}:{})};
}

/** webkitRelativePath is supplied by directory inputs in Chrome, Edge and Firefox. */
export async function loadTileFolder(input,fileList){
  const project=readProject(input),files=new Map();let total=0;
  // A new folder selection replaces the source root; never retain another root's bytes.
  for(const tile of project.tiles)if(tile.asset){delete tile.asset.bytes;delete tile.asset.occupancy;}
  for(const file of fileList){
    if(!/\.nbt$/i.test(file.name))continue;
    const parts=(file.webkitRelativePath||'').split('/'),root=parts.shift();let path=parts.join('/');
    if(root!=='tile'&&path.startsWith('assets/tile/'))path=path.slice(12);
    else if(root==='es')continue;
    else if(root==='assets'){if(!path.startsWith('tile/'))continue;path=path.slice(5);}
    else if(root!=='tile'&&path.startsWith('tile/'))path=path.slice(5);
    if(!tileReference(path))throw new Error('타일셋 폴더들을 포함하는 assets/tile 폴더를 선택하세요. 타일 경로는 타일셋/타일이름.nbt 형태여야 합니다.');
    if(files.has(path))throw new Error('중복된 타일 경로입니다: '+path);
    total+=file.size;if(file.size>MAX_FILE||total>MAX_EXPANDED||files.size>=200)throw new Error('타일 폴더는 NBT 파일당 24MB, 합계 64MB, 200개 이하로 연결하세요.');
    files.set(path,file);
  }
  if(!files.size)throw new Error('선택한 폴더에 타일 NBT가 없습니다.');
  let linked=0,added=0;
  for(const [path,file] of files){
    const source=await inspectStructure(await file.arrayBuffer(),file.name);source.asset.reference=path;
    const targets=project.tiles.filter(t=>t.asset?.reference===path);
    if(targets.length){for(const tile of targets){mergeTileSource(tile,source);linked++;}}
    else{project.tiles.push(source);added++;}
  }
  return {project:readProject(project),linked,added};
}
