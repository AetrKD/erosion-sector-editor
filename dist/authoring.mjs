import {BLOCKS,walkBlocks,duplicateBlock} from './logic.mjs';
import {uid,tileOf,worldPoint,inversePoint,placementError} from './core.mjs';
import {nextAreaCode} from './hierarchy.mjs';
import {scanSteps} from './scan.mjs';
import {occupancy} from './occupancy.mjs';

export const scalarKind=kind=>['number','text','choice'].includes(kind);
export function referenceTarget(kind,id){
  if(scalarKind(kind)||!id)return null;
  return {kind:['room','placement','door','objective'].includes(kind)?kind:'gimmick',id};
}
export function programReferences(program){
  const refs=[];walkBlocks(program,b=>{for(const [key,f] of Object.entries(BLOCKS[b.type].fields)){
    const target=referenceTarget(f.kind,b.args[key]);if(target)refs.push({...target,blockId:b.id,role:BLOCKS[b.type].category});
  }});return refs;
}
export function relatedPrograms(project,selection){
  return project.programs.flatMap(p=>{const refs=programReferences(p).filter(r=>r.kind===selection.kind&&r.id===selection.id||selection.kind==='placement'&&(r.kind==='door'&&r.id.startsWith(selection.id+':')||r.kind==='gimmick'&&project.gimmicks.some(g=>g.id===r.id&&g.placementId===selection.id)));return refs.length?[{program:p,refs}]:[];});
}
/** Dragging stores cell origins, not centers, including rotated schematics. */
export function scanMove(project,g,index,world){
  const old=scanSteps(g)[index];if(!old)throw new Error('스캔 단계가 없습니다.');
  const candidates=project.placements.flatMap(p=>{const t=tileOf(project,p);if(!t)return [];const local=inversePoint({x:world.x-p.x*16,y:world.y-p.y*8,z:world.z-p.z*16},t,p.rotation);return local.x>=0&&local.z>=0&&local.x<t.size.x&&local.z<t.size.z&&local.y>=0&&local.y<t.size.y?[{p,local}]:[];});
  const hit=candidates.find(c=>c.p.id===old.placementId)||candidates[0];if(!hit)throw new Error('스캔 중심은 배치된 타일 안에 있어야 합니다.');
  return {placementId:hit.p.id,position:{x:Math.floor(hit.local.x),y:hit.local.y,z:Math.floor(hit.local.z)}};
}
export function updateScanStep(g,index,patch){
  if(index===0){if(patch.position)g.position=patch.position;if(patch.placementId)g.placementId=patch.placementId;if(patch.radius!==undefined)g.settings.radius=patch.radius;}
  else {if(!g.settings.steps?.[index-1])throw new Error('스캔 단계가 없습니다.');Object.assign(g.settings.steps[index-1],patch);}
}
export function scanCenter(project,step){const p=project.placements.find(p=>p.id===step.placementId),t=p&&tileOf(project,p);return t?worldPoint({...step.position,x:step.position.x+.5,z:step.position.z+.5},t,p):null;}

const candidateCache=new WeakMap();
/** Conservative non-air preview only. Native collision/support shapes remain authoritative. */
export function scanCandidates(tile,y,radius,anchor){
  const bits=occupancy(tile);if(!bits)return {known:false,cells:[]};
  if(!Number.isInteger(y)||y<1||y+1>=tile.size.y)return {known:true,cells:[]};
  let cache=candidateCache.get(tile);if(!cache){cache=new Map();candidateCache.set(tile,cache);}
  const key=[y,radius,Math.floor(anchor.x),Math.floor(anchor.z)].join(':');if(cache.has(key))return cache.get(key);
  const w=tile.size.x,h=tile.size.z,solid=(x,yy,z)=>{const i=x+w*(z+h*yy);return !!(bits[i>>3]&(1<<(i&7)));};
  const walk=new Uint8Array(w*h),reachable=new Uint8Array(w*h),prefix=new Int32Array((w+1)*h),queue=[];
  for(let z=0;z<h;z++)for(let x=0;x<w;x++){const i=x+w*z;walk[i]=solid(x,y-1,z)&&!solid(x,y,z)&&!solid(x,y+1,z)?1:0;prefix[z*(w+1)+x+1]=prefix[z*(w+1)+x]+(walk[i]?0:1);}
  const ax=Math.floor(anchor.x),az=Math.floor(anchor.z),start=ax+w*az;
  if(ax>=0&&ax<w&&az>=0&&az<h&&walk[start]){queue.push(start);reachable[start]=1;}
  for(let n=0;n<queue.length;n++){const i=queue[n],x=i%w,z=Math.floor(i/w);for(const [xx,zz] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]){const j=xx+w*zz;if(xx>=0&&xx<w&&zz>=0&&zz<h&&walk[j]&&!reachable[j]){reachable[j]=1;queue.push(j);}}}
  const slices=[];for(let dz=-Math.ceil(radius);dz<=Math.ceil(radius);dz++){const distance=Math.max(0,Math.abs(dz)-.5);if(distance>=radius)continue;const span=Math.ceil(Math.sqrt(radius*radius-distance*distance)+.5)-1;slices.push([dz,span]);}
  const cells=[];
  for(let z=0;z<h;z++)for(let x=0;x<w;x++)if(reachable[x+w*z]){
    let ok=x+.5-radius>=0&&z+.5-radius>=0&&x+.5+radius<=w&&z+.5+radius<=h;
    for(const [dz,span] of slices){const zz=z+dz,l=x-span,r=x+span;if(!ok||zz<0||zz>=h||l<0||r>=w||prefix[zz*(w+1)+r+1]!==prefix[zz*(w+1)+l]){ok=false;break;}}
    // Same-room component plus direct line: no random relocation around a wall.
    if(ok){const steps=Math.ceil(Math.hypot(x-ax,z-az)*2);for(let i=1;i<steps;i++)if(!walk[Math.floor(ax+.5+(x-ax)*i/steps)+w*Math.floor(az+.5+(z-az)*i/steps)]){ok=false;break;}}
    cells.push({x,z,valid:ok});
  }
  const result={known:true,cells};if(cache.size>=12)cache.clear();cache.set(key,result);return result;
}

/** Copies local wiring; external targets stay explicit references to their original objects. */
export function duplicatePlacement(project,id,position){
  const source=project.placements.find(p=>p.id===id);if(!source)throw new Error('복제할 타일이 없습니다.');
  const p={...structuredClone(source),...position,id:uid('placement'),areaCode:nextAreaCode(project,source.roomId)};
  const error=placementError(project,p);if(error)throw new Error(error);
  const owned=project.gimmicks.filter(g=>g.placementId===id),ids=new Map([[id,p.id]]);
  for(const g of owned)ids.set(g.id,uid('gimmick'));
  for(const port of tileOf(project,source).ports)ids.set(id+':'+port.id,p.id+':'+port.id);
  const objectives=project.objectives.filter(o=>ids.has(o.targetId));for(const o of objectives)ids.set(o.id,uid('objective'));
  const remap=value=>ids.get(value)||value;
  const gimmicks=owned.map(g=>{const copy=structuredClone(g);copy.id=remap(g.id);copy.placementId=p.id;
    for(const key of ['containerId','wakeRoomId'])if(copy.settings[key])copy.settings[key]=remap(copy.settings[key]);
    if(copy.settings.spawnTiles)copy.settings.spawnTiles=copy.settings.spawnTiles.map(remap);
    for(const step of copy.settings.steps||[])if(step.placementId)step.placementId=remap(step.placementId);
    return copy;
  });
  const programs=project.programs.filter(rule=>programReferences(rule).some(r=>ids.has(r.id))).map(rule=>{
    const copy={...structuredClone(rule),id:uid('event'),name:(rule.name+' · 복제').slice(0,160),trigger:duplicateBlock(rule.trigger),actions:rule.actions.map(duplicateBlock)};
    walkBlocks(copy,b=>{for(const [key,f] of Object.entries(BLOCKS[b.type].fields))if(!scalarKind(f.kind))b.args[key]=remap(b.args[key]);});return copy;
  });
  const links=project.links.filter(l=>ids.has(l.from)||ids.has(l.to)).map(l=>({...l,id:uid('link'),from:remap(l.from),to:remap(l.to)}));
  project.placements.push(p);project.gimmicks.push(...gimmicks);project.objectives.push(...objectives.map(o=>({...o,id:remap(o.id),targetId:remap(o.targetId)})));project.programs.push(...programs);project.links.push(...links);
  return p;
}
