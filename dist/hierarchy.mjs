// Display codes are local to a numbered area. Stable placement IDs remain the event references.
export function alphabetCode(index){
  let result='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(97+(n-1)%26)+result;
  return result;
}
export function nextAreaCode(project,roomId,ignoreId){
  const used=new Set(project.placements.filter(p=>p.roomId===roomId&&p.id!==ignoreId).map(p=>p.areaCode));
  for(let i=0;i<=project.placements.length;i++){const code=alphabetCode(i);if(!used.has(code))return code;}
}
export function normalizeAreaCodes(project){
  const used=new Map();
  // Reserve explicit codes before assigning missing ones, so loading cannot rename existing areas.
  for(const p of project.placements){if(!used.has(p.roomId))used.set(p.roomId,new Set());if(p.areaCode!==undefined)used.get(p.roomId).add(p.areaCode);}
  for(const p of project.placements)if(p.areaCode===undefined){const codes=used.get(p.roomId);let i=0;while(codes.has(alphabetCode(i)))i++;p.areaCode=alphabetCode(i);codes.add(p.areaCode);}
  return project;
}
export function areaLabel(room){return `${room?.code||'미지정'}구역`;}
export function placementLabel(project,p){
  const tile=project.tiles.find(t=>t.id===p.tileId),room=project.rooms.find(r=>r.id===p.roomId);
  return `${areaLabel(room)} / ${p.areaCode||'?'}구역 (${tile?.name||'없는 타일'})${p.name?' · '+p.name:''}`;
}
export function areaTree(project){
  return project.rooms.map(room=>({...room,children:project.placements.filter(p=>p.roomId===room.id).map(p=>({...p,tileName:project.tiles.find(t=>t.id===p.tileId)?.name||'없는 타일',gimmicks:project.gimmicks.filter(g=>g.placementId===p.id)}))}));
}
