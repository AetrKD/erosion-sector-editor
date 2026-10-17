import {KINDS,dimensions,inversePoint,placementError,tileOf,worldPoint} from './core.mjs';
import {occupancy} from './occupancy.mjs';

export const PALETTE_MIME='application/x-erosion-palette';
/** A library drop is a new instance. Coordinates use the same grid as click placement. */
export function palettePlacement(project,brush,point,roomId){
  if(!brush||!point||!['x','y','z'].every(k=>Number.isFinite(point[k])))return {error:'배치할 위치를 확인하세요.'};
  const x=Math.floor(point.x*16)/16,z=Math.floor(point.z*16)/16,y=point.y;
  if(brush.kind==='tile'){
    const tile=project.tiles.find(t=>t.id===brush.id);
    if(!tile)return {error:'타일 원본을 찾을 수 없습니다.'};
    const placement={id:'palette-preview',tileId:tile.id,x,y,z,rotation:brush.rotation||0,roomId:roomId||project.rooms[0]?.id||'',name:''};
    return {brush,placement,tile,error:placementError(project,placement,null)};
  }
  if(brush.kind!=='gimmick'||!KINDS[brush.id]||brush.id==='terminal')return {error:'배치할 기믹을 확인하세요.'};
  const placement=[...project.placements].reverse().find(p=>{const t=tileOf(project,p);if(!t)return false;const d=dimensions(t,p.rotation);return y>=p.y&&y<p.y+d.y/8&&x>=p.x&&x<p.x+d.x/16&&z>=p.z&&z<p.z+d.z/16;});
  if(!placement)return {brush,error:'기믹은 배치된 타일 내부에 놓아주세요.'};
  const tile=tileOf(project,placement);
  // Choose a cell center before inverse rotation, so rotated boundary cells stay inside.
  const position=inversePoint({x:(x-placement.x)*16+.5,y:(y-placement.y)*8+1,z:(z-placement.z)*16+.5},tile,placement.rotation);
  const physical=['cargo','supply'].includes(brush.id);
  if(physical){
    const bits=occupancy(tile),xx=Math.floor(position.x),yy=Math.floor(position.y),zz=Math.floor(position.z),i=xx+tile.size.x*(zz+tile.size.z*yy);
    if(bits&&(bits[i>>3]&(1<<(i&7))))return {brush,placement,tile,position,error:'상자·컨테이너는 타일의 빈 블록에 놓아주세요.'};
    const at=worldPoint(position,tile,placement);
    for(const g of project.gimmicks.filter(g=>['cargo','supply'].includes(g.type))){const p=project.placements.find(p=>p.id===g.placementId),t=p&&tileOf(project,p);if(!t)continue;const old=worldPoint(g.position,t,p);if(['x','y','z'].every(k=>Math.floor(old[k])===Math.floor(at[k])))return {brush,placement,tile,position,error:'다른 상자·컨테이너가 이미 있는 블록입니다.'};}
  }
  return {brush,placement,tile,position,error:''};
}
