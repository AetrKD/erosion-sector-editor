import {zipSync,unzipSync} from './vendor/fflate.mjs';
import {readProject,exportStage,tileReference,CELL,TILE_RULES} from './core.mjs';

const MAX_BYTES=64*1024*1024;
const NAMES=['manifest.json','stage.json','tiles.json','layout.json','logic.json'];
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});

/** Only JSON configuration is archived. No NBT, base64 source or occupancy mask. */
export function packStage(input){
  const project=readProject(input),stage=exportStage(project);
  for(const tile of stage.tiles)if(tile.asset&&!tileReference(tile.asset.reference))
    throw new Error(`${tile.name}: tile 폴더 기준 경로를 지정하세요. 예: 연구소/복도.nbt`);
  const manifest={format:stage.format,version:2,status:stage.status,runtimeReady:stage.runtimeReady,tileRoot:'tile',cellSize:CELL,tileRules:TILE_RULES};
  const layout={placements:stage.placements.map(({x,y,z,...p})=>p),rooms:stage.rooms,zones:stage.zones,connections:stage.connections};
  const values=[manifest,stage.stage,stage.tiles,layout,{gimmicks:stage.gimmicks,links:stage.links,blockFormat:1,programs:stage.programs}];
  const files=Object.fromEntries(NAMES.map((name,i)=>[name,encoder.encode(JSON.stringify(values[i],null,2))]));
  if(Object.values(files).reduce((sum,b)=>sum+b.length,0)>MAX_BYTES)throw new Error('스테이지 설정은 압축 해제 기준 64MB 이하여야 합니다.');
  return zipSync(files,{level:6});
}

export function unpackStage(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>MAX_BYTES||bytes.length<22)throw new Error('올바른 .esfile 파일을 선택하세요. 최대 64MB입니다.');
  const seen=new Set();let expanded=0,files;
  try{
    files=unzipSync(bytes,{filter(entry){
      if(!NAMES.includes(entry.name)||seen.has(entry.name))throw new Error('스테이지 묶음에는 중복 없이 지정된 JSON 설정만 들어갈 수 있습니다. 타일 NBT는 외부에서 참조합니다.');
      seen.add(entry.name);expanded+=entry.originalSize;
      if(!Number.isSafeInteger(expanded)||expanded>MAX_BYTES)throw new Error('압축을 푼 스테이지 설정이 64MB를 초과합니다.');
      return true;
    }});
  }catch(error){throw new Error('스테이지 압축 묶음을 읽을 수 없습니다: '+error.message);}
  if(NAMES.some(name=>!Object.hasOwn(files,name)))throw new Error('스테이지 설정 파일이 누락되었습니다.');
  const [manifest,stage,tiles,layout,logic]=NAMES.map(name=>{
    try{return JSON.parse(decoder.decode(files[name]));}catch{throw new Error(name+': JSON 설정이 올바르지 않습니다.');}
  });
  if(manifest?.format!=='erosionsector-stage'||manifest.version!==2||manifest.tileRoot!=='tile'||
    !Object.keys(CELL).every(k=>manifest.cellSize?.[k]===CELL[k])||!Object.keys(TILE_RULES).every(k=>manifest.tileRules?.[k]===TILE_RULES[k]))
    throw new Error('지원하는 Erosion Sector 스테이지 형식이 아닙니다.');
  if(!stage||!Array.isArray(tiles)||!Array.isArray(layout?.placements)||!logic)throw new Error('스테이지 설정이 올바르지 않습니다.');
  for(const tile of tiles)if(tile?.asset&&(!tileReference(tile.asset.reference)||Object.hasOwn(tile.asset,'bytes')||Object.hasOwn(tile.asset,'occupancy')))
    throw new Error('타일 원본은 묶음에 넣지 않고 타일셋/타일이름.nbt 경로로만 참조해야 합니다.');
  const placements=layout.placements.map(p=>{
    const at=p?.blockPosition;if(!at||!['x','y','z'].every(k=>Number.isInteger(at[k]))||at.y%8)throw new Error('스테이지 배치 좌표가 올바르지 않습니다.');
    const {blockPosition,...rest}=p;return {...rest,x:at.x/16,y:at.y/8,z:at.z/16};
  });
  if(logic.programs!==undefined&&logic.blockFormat!==1)throw new Error('지원하지 않는 이벤트 블록 형식입니다.');
  return readProject({format:'erosionsector-project',version:1,...stage,tiles,placements,rooms:layout.rooms,zones:layout.zones,gimmicks:logic.gimmicks,links:logic.links,programs:logic.programs===undefined?[]:logic.programs});
}
