import {magnetic} from './features.mjs';
import {KINDS,dimensions,inversePoint,placementError,tileOf,worldPoint} from './core.mjs';
import {isScan,scanPosition} from './scan.mjs';
import {occupancy} from './occupancy.mjs';
import {createSceneIndex} from './scene-index.mjs';

export const PALETTE_MIME='application/x-erosion-palette';
/** A library drop is a new instance. Coordinates use the same grid as click placement. */
export function palettePlacement(project,brush,point,roomId,index=null){
  if(!brush||!point||!['x','y','z'].every(k=>Number.isFinite(point[k])))return {error:'배치할 위치를 확인하세요.'};
  const x=Math.floor(point.x*16)/16,z=Math.floor(point.z*16)/16,y=point.y;
  if(brush.kind==='tile'){
    const tile=index?index.tiles.get(brush.id):project.tiles.find(t=>t.id===brush.id);
    if(!tile)return {error:'타일 원본을 찾을 수 없습니다.'};
    let placement={id:'palette-preview',tileId:tile.id,x,y,z,rotation:brush.rotation||0,roomId:roomId||project.rooms[0]?.id||'',name:''};
    placement=magnetic(project,placement);return {brush,placement,tile,snapped:placement.x!==x||placement.z!==z,error:placementError(project,placement,null,index)};
  }
  if(brush.kind!=='gimmick'||!KINDS[brush.id]||brush.id==='terminal')return {error:'배치할 기믹을 확인하세요.'};
  let placement;
  for(let i=project.placements.length-1;i>=0;i--){const p=project.placements[i],t=index?index.tiles.get(p.tileId):tileOf(project,p);if(!t)continue;const d=dimensions(t,p.rotation);if(y>=p.y&&y<p.y+d.y/8&&x>=p.x&&x<p.x+d.x/16&&z>=p.z&&z<p.z+d.z/16){placement=p;break;}}
  if(!placement)return {brush,error:'기믹은 배치된 타일 내부에 놓아주세요.'};
  const tile=index?index.tiles.get(placement.tileId):tileOf(project,placement);
  // Choose a cell center before inverse rotation, so rotated boundary cells stay inside.
  let position=inversePoint({x:(x-placement.x)*16+.5,y:(y-placement.y)*8+1,z:(z-placement.z)*16+.5},tile,placement.rotation);
  if(isScan(brush.id))position=scanPosition(inversePoint({x:(point.x-placement.x)*16,y:(point.y-placement.y)*8+1,z:(point.z-placement.z)*16},tile,placement.rotation),tile.size);
  const physical=['cargo','supply'].includes(brush.id);
  if(physical){
    const bits=occupancy(tile),xx=Math.floor(position.x),yy=Math.floor(position.y),zz=Math.floor(position.z),i=xx+tile.size.x*(zz+tile.size.z*yy);
    if(bits&&(bits[i>>3]&(1<<(i&7))))return {brush,placement,tile,position,error:'상자·컨테이너는 타일의 빈 블록에 놓아주세요.'};
    const at=worldPoint(position,tile,placement);
    let occupied=index?.containers.has([Math.floor(at.x),Math.floor(at.y),Math.floor(at.z)].join(':'));
    if(!index)for(const g of project.gimmicks){if(!['cargo','supply'].includes(g.type))continue;const p=project.placements.find(p=>p.id===g.placementId),t=p&&tileOf(project,p);if(!t)continue;const old=worldPoint(g.position,t,p);if(['x','y','z'].every(k=>Math.floor(old[k])===Math.floor(at[k]))){occupied=true;break;}}
    if(occupied)return {brush,placement,tile,position,error:'다른 상자·컨테이너가 이미 있는 블록입니다.'};
  }
  return {brush,placement,tile,position,error:''};
}

/** Editor revisions are immutable: edits, imports and undo all change the project identity. */
export function createPaletteEvaluator(getIndex=createSceneIndex){
  let revision,index,lastKey,lastResult;
  return (project,brush,point,roomId,{fresh=false}={})=>{
    if(revision!==project){revision=project;index=getIndex(project);lastKey=null;lastResult=null;}
    const validPoint=point&&['x','y','z'].every(k=>Number.isFinite(point[k]));
    const key=validPoint&&brush?JSON.stringify([brush.kind,brush.id,brush.rotation||0,Math.floor(point.x*16),point.y,Math.floor(point.z*16),brush.kind==='gimmick'&&isScan(brush.id)?[Math.round(point.x*16),Math.round(point.z*16)]:null,roomId]):null;
    if(!fresh&&key!==null&&key===lastKey)return lastResult;
    lastResult=palettePlacement(project,brush,point,roomId,index);lastKey=key;return lastResult;
  };
}
