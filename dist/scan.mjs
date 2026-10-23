export const isScan=type=>type==='scan'||type==='extraction';
export const scanDefaults=()=>({radius:2.5,duration:5,requiredPlayers:'all',positionMode:'fixed',steps:[]});
// Scan coordinates are integer points, with no block-center offset.
export function scanPosition(position,size){return Object.fromEntries(['x','y','z'].map(k=>{const v=position[k],n=Math.round(v);return [k,Number.isFinite(v)&&size&&v>=0&&v<size[k]?Math.min(size[k]-1,n):n];}));}
export function normalizeScanCoordinates(project){for(const g of project.gimmicks.filter(g=>isScan(g.type))){const normalize=(position,placementId)=>{const p=project.placements.find(p=>p.id===placementId),t=p&&project.tiles.find(t=>t.id===p.tileId);return position&&scanPosition(position,t?.size);};g.position=normalize(g.position,g.placementId);delete g.settings.centerAnchor;for(const step of g.settings.steps||[]){if(step?.position)step.position=normalize(step.position,step.placementId||g.placementId);if(step&&typeof step==='object')delete step.centerAnchor;}}}
export function scanSteps(g){return [{...g.settings,placementId:g.placementId,position:g.position},...(g.settings.steps||[]).map(s=>({...g.settings,...s,position:s.position||g.position,placementId:s.placementId||g.placementId}))];}
export function assertScans(project){
  let total=0,count=0;
  for(const g of project.gimmicks.filter(g=>isScan(g.type))){
    const fail=message=>{throw new Error(`${g.name}: ${message}`);},s=g.settings;
    if(++count>128)fail('스캔은 최대 128개입니다.');
    if(s.steps!==undefined&&(!Array.isArray(s.steps)||s.steps.length>63))fail('추가 스캔 단계는 최대 63개입니다.');
    if((total+=1+(s.steps?.length||0))>512)fail('스테이지 전체 스캔 단계는 최대 512개입니다.');
    if(s.steps?.some(step=>!step||Array.isArray(step)||typeof step!=='object'))fail('스캔 단계 형식을 확인하세요.');
    for(const step of scanSteps(g)){
      for(const [key,min,max,defaultValue] of [['radius',.5,16,2.5],['duration',.1,3600,5]]){const value=step[key]??defaultValue;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(`${key} 값은 ${min}~${max} 범위여야 합니다.`);}
      const people=step.requiredPlayers??(s.requireAll===false?1:'all');if(people!=='all'&&(!Number.isInteger(people)||people<1||people>16))fail('요구 인원은 팀 전체 또는 1~16명입니다.');
      if(!['fixed','random'].includes(step.positionMode||'fixed'))fail('스캔 위치 방식을 확인하세요.');
      if(typeof step.placementId!=='string'||!step.position||['x','y','z'].some(k=>typeof step.position[k]!=='number'||!Number.isFinite(step.position[k])))fail('스캔의 소속 타일과 좌표를 확인하세요.');
    }
  }
}
export function scanIssues(project){
  const out=[];for(const g of project.gimmicks.filter(g=>isScan(g.type)))for(const [index,step] of scanSteps(g).entries()){
    const p=project.placements.find(p=>p.id===step.placementId),tile=p&&project.tiles.find(t=>t.id===p.tileId);
    const error=message=>out.push({severity:'error',message:`${g.name} · ${index+1}단계: ${message}`,target:{kind:'gimmick',id:g.id}});
    if(!tile){error('스캔 타일을 지정하세요.');continue;}
    if(['x','y','z'].some(k=>step.position[k]<0||step.position[k]>=tile.size[k]))error('스캔 기준 좌표가 타일 밖에 있습니다.');
    if(step.positionMode==='random'&&!Number.isInteger(step.position.y))error('랜덤 위치의 바닥 높이는 정수여야 합니다.');
    if(step.positionMode==='random'&&((step.radius??2.5)*2>tile.size.x||(step.radius??2.5)*2>tile.size.z))error('타일보다 큰 원을 랜덤으로 배치할 수 없습니다. 반경을 줄이세요.');
  }return out;
}
export function scanFields(g,p,{field:f,select:s}){
  const people=[['all','생존한 팀 전체'],...Array.from({length:16},(_,i)=>[String(i+1),`${i+1}인 이상`])],modes=[['fixed','직접 지정'],['random','연결된 바닥에서 랜덤']];
  const a=g.settings;
  const fields=(step,path,label)=>s(label+' 위치 방식',path+'positionMode',step.positionMode||'fixed',modes)
    +f(label+' 반경 · 블록',path+'radius',step.radius??a.radius??2.5,'number','min="0.5" max="16" step="0.5"')
    +f(label+' 시간 · 초',path+'duration',step.duration??a.duration??5,'number','min="0.1" max="3600" step="0.1"')
    +s(label+' 요구 인원',path+'requiredPlayers',String(step.requiredPlayers??a.requiredPlayers??(a.requireAll===false?1:'all')),people);
  const leave=s('인원 부족 시','settings.leavePolicy',a.leavePolicy||'pause',[['pause','일시정지'],['resetStep','현재 단계 초기화'],['resetAll','전체 초기화']]);
  let html=leave+'<div class="section-title">원형 스캔 · 1단계</div>'+fields(a,'settings.','스캔');
  if(g.type==='scan')html+=s('시작 시 자동 활성화','settings.enabled',String(a.enabled??true),[['true','예'],['false','이벤트로 시작']]);
  if(g.type==='extraction')html+=s('필수 목표 완료 시 자동 활성화','settings.unlockOnObjectives',String(a.unlockOnObjectives??true),[['true','예'],['false','이벤트로 활성화']]);
  html+='<div class="note subtle">스캔 중심은 입력한 정수 좌표 그대로입니다. X=8, Z=8이면 중심은 (8, 8)입니다. 좌표에 0.5를 더하지 않습니다. 모드 0.5.41 이상을 사용하세요. 인원이 부족하면 진행도를 유지한 채 멈춥니다. 바닥 높이 ±1블록까지 집계합니다. 랜덤은 위의 좌표를 기준으로 연결된 평평한 바닥에서 원 전체가 들어가는 곳을 선택합니다. 벽·낭떠러지·타일 밖을 피하며 유효한 위치가 없으면 실행 전에 오류를 안내합니다.</div>';
  for(const [i,raw] of (a.steps||[]).entries()){
    const step={...a,...raw},path=`settings.steps.${i}.`,tile=raw.placementId||g.placementId,pos=raw.position||g.position;
    html+=`<div class="divider"></div><div class="section-title">스캔 ${i+2}단계 <button type="button" class="subtle-button" data-scan-remove="${i}">삭제</button></div>`
      +s(`${i+2}단계 타일`,path+'placementId',tile,p.placements.map(q=>[q.id,`${p.rooms.find(r=>r.id===q.roomId)?.code||'?'} / ${q.areaCode||'?'} · ${p.tiles.find(t=>t.id===q.tileId)?.name||'타일'}`]))
      +['x','y','z'].map(k=>f(`${i+2}단계 ${k.toUpperCase()}`,path+'position.'+k,pos[k],'number','min="0" max="255" step="1"')).join('')+fields(step,path,`${i+2}단계`);
  }
  if((a.steps?.length||0)<63)html+='<button type="button" class="button full" data-scan-add>＋ 다음 스캔 단계 추가</button>';
  return html;
}
