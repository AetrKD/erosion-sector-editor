import {bounds,dimensions,worldPoint} from './core.mjs';

/** Read-only lookup data for one immutable editor revision; never saved to .esfile. */
export function createSceneIndex(project){
  const tiles=new Map(project.tiles.map(t=>[t.id,t])),rooms=new Map(project.rooms.map(r=>[r.id,r]));
  const placements=new Map(project.placements.map(p=>[p.id,p]));
  const entries=project.placements.flatMap(p=>{const tile=tiles.get(p.tileId);return tile?[{placement:p,tile,box:bounds(tile,p),size:dimensions(tile,p.rotation)}]:[];});
  const geometry=entries.map(({placement:p,size})=>({id:p.id,p,min:[p.x,p.y,p.z],max:[p.x+size.x/16,p.y+size.y/8,p.z+size.z/16],color:rooms.get(p.roomId)?.color||'#8296a4',label:rooms.get(p.roomId)?.code||tiles.get(p.tileId).name}));
  const target=[0,1,2].map(i=>geometry.length?(Math.min(...geometry.map(b=>b.min[i]))+Math.max(...geometry.map(b=>b.max[i])))/2:0);
  // Physical container cells are tested often while dragging; build their lookup once.
  const containers=new Set();
  for(const g of project.gimmicks){if(!['cargo','supply'].includes(g.type))continue;const p=placements.get(g.placementId),t=p&&tiles.get(p.tileId);if(!t)continue;const at=worldPoint(g.position,t,p);containers.add([Math.floor(at.x),Math.floor(at.y),Math.floor(at.z)].join(':'));}
  return {tiles,rooms,placements,entries,geometry,target,containers};
}
