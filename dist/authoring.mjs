import {BLOCKS,walkBlocks,duplicateBlock} from './logic.mjs';
import {uid,tileOf,worldPoint,inversePoint,placementError} from './core.mjs';
import {nextAreaCode} from './hierarchy.mjs';
import {scanSteps,scanPosition} from './scan.mjs';
import {occupancy} from './occupancy.mjs';

export const scalarKind=kind=>['number','text','choice'].includes(kind);
export function referenceTarget(kind,id){
  if(scalarKind(kind)||!id||kind==='enemyGroup')return null;
  if(kind==='enemyTable')return {kind:'enemyTable',id};
  if(kind==='lightTarget')return id.startsWith('tile:')?{kind:'placement',id:id.slice(5)}:{kind:'room',id};
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
/** Snap in local tile coordinates so rotated cells and corners retain their chosen anchor. */
export function scanMove(project,g,index,world,scene=null){
  const old=scanSteps(g)[index];if(!old)throw new Error('스캔 단계가 없습니다.');
  const candidates=project.placements.flatMap(p=>{const t=scene?scene.tiles.get(p.tileId):tileOf(project,p);if(!t)return [];const local=inversePoint({x:world.x-p.x*16,y:world.y-p.y*8,z:world.z-p.z*16},t,p.rotation);return local.x>=0&&local.z>=0&&local.x<t.size.x&&local.z<t.size.z&&local.y>=0&&local.y<t.size.y?[{p,local,t}]:[];});
  const hit=candidates.find(c=>c.p.id===old.placementId)||candidates[0];if(!hit)throw new Error('스캔 중심은 배치된 타일 안에 있어야 합니다.');
  return {placementId:hit.p.id,position:{x:Math.min(hit.t.size.x-1,Math.round(hit.local.x)),y:Math.round(hit.local.y),z:Math.min(hit.t.size.z-1,Math.round(hit.local.z))}};
}
export function updateScanStep(g,index,patch){
  if(index===0){if(patch.position)g.position=patch.position;if(patch.placementId)g.placementId=patch.placementId;if(patch.radius!==undefined)g.settings.radius=patch.radius;}
  else {if(!g.settings.steps?.[index-1])throw new Error('스캔 단계가 없습니다.');Object.assign(g.settings.steps[index-1],patch);}
}
export function scanCenter(project,step,scene=null){const p=scene?scene.placements.get(step.placementId):project.placements.find(p=>p.id===step.placementId),t=p&&(scene?scene.tiles.get(p.tileId):tileOf(project,p));return t?worldPoint(scanPosition(step.position,t.size),t,p):null;}

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
  const cells=[],offset=0;
  for(let z=0;z<h;z++)for(let x=0;x<w;x++)if(reachable[x+w*z]){
    const cx=x+offset,cz=z+offset;
    let ok=cx-radius>=0&&cz-radius>=0&&cx+radius<=w&&cz+radius<=h;
    for(let row=Math.max(0,Math.floor(cz-radius));ok&&row<=Math.min(h-1,Math.floor(cz+radius));row++){
      const dz=Math.max(0,Math.abs(row+.5-cz)-.5),span=Math.sqrt(Math.max(0,radius*radius-dz*dz)),lo=Math.max(0,Math.floor(cx-span)),hi=Math.min(w-1,Math.floor(cx+span));
      if(prefix[row*(w+1)+hi+1]!==prefix[row*(w+1)+lo])ok=false;
    }
    if(ok){const axx=anchor.x+offset,azz=anchor.z+offset,steps=Math.ceil(Math.hypot(cx-axx,cz-azz)*2);for(let i=1;i<steps;i++)if(!walk[Math.floor(axx+(cx-axx)*i/steps)+w*Math.floor(azz+(cz-azz)*i/steps)]){ok=false;break;}}
    cells.push({x,z,valid:ok});
  }
  const result={known:true,cells};if(cache.size>=12)cache.clear();cache.set(key,result);return result;
}

/** Copies local wiring; external targets stay explicit references to their original objects. */
export function duplicatePlacement(project,id,position){
  const source=project.placements.find(p=>p.id===id);if(!source)throw new Error('복제할 타일이 없습니다.');
  const p={...structuredClone(source),...position,id:uid('placement'),areaCode:nextAreaCode(project,source.roomId)};
  const error=placementError(project,p);if(error)throw new Error(error);
  const owned=project.gimmicks.filter(g=>g.placementId===id),resources=(project.resourceRules||[]).filter(r=>r.scope==='tile'&&r.targetId===id),enemies=(project.enemyGroups||[]).filter(r=>r.scope==='tile'&&r.targetId===id),ids=new Map([[id,p.id],['tile:'+id,'tile:'+p.id]]);
  for(const r of [...resources,...enemies])ids.set(r.id,uid('copy'));for(const r of resources)if(r.objectKey)ids.set(r.objectKey,uid('object'));
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
  project.placements.push(p);project.resourceRules??=[];project.enemyGroups??=[];project.resourceRules.push(...resources.map(r=>({...structuredClone(r),id:remap(r.id),targetId:p.id,objectKey:remap(r.objectKey)})));project.enemyGroups.push(...enemies.map(r=>({...structuredClone(r),id:remap(r.id),targetId:p.id})));project.gimmicks.push(...gimmicks);project.objectives.push(...objectives.map(o=>({...o,id:remap(o.id),targetId:remap(o.targetId)})));project.programs.push(...programs);project.links.push(...links);
  return p;
}
