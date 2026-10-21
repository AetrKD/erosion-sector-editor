import {assertScans,scanIssues,normalizeScanCoordinates} from './scan.mjs';
export const OBJECTIVE_TYPES={interact:'오브젝트 상호작용',survive:'제한 시간 생존',clear:'길 정리',scan:'스캔 완료',command:'터미널 명령어 입력',visit:'타일 방문',collect:'ID 키카드 획득',pickup:'화물 들어 올리기',deliver:'화물을 탈출 지점으로 운반',manual:'이벤트로 완료'};
export function normalizeMission(p){
  p.missionMode??='extract';p.objectives??=[];
  if(!['extract','objectives'].includes(p.missionMode)||!Array.isArray(p.objectives)||p.objectives.length>200)throw new Error('임무 목표 설정이 올바르지 않습니다.');
  const ids=new Set();for(const o of p.objectives){
    if(!o||typeof o.id!=='string'||!o.id||o.id.length>160||ids.has(o.id)||typeof o.name!=='string'||!o.name.trim()||o.name.length>160||!OBJECTIVE_TYPES[o.type]||typeof o.targetId!=='string'||o.targetId.length>160||typeof o.command!=='string'||o.command.length>120||typeof o.required!=='boolean')throw new Error('임무 목표의 이름·종류·대상·명령어를 확인하세요.');ids.add(o.id);
  }
  for(const g of p.gimmicks||[]){const s=g.settings;if(!s||Array.isArray(s))throw new Error('기믹 설정이 올바르지 않습니다.');
    if(g.type==='supply'){for(const key of ['ammoPacks','healthPacks'])if(s[key]!==undefined&&(!Number.isInteger(s[key])||s[key]<0||s[key]>36))throw new Error(g.name+': 보급 팩 수량은 0~36 정수여야 합니다.');if(Math.ceil((s.ammoPacks??0)/5)+Math.ceil((s.healthPacks??0)/5)>9)throw new Error(g.name+': 보급 팩은 팩당 5회분씩 총 9칸 안에 들어가야 합니다.');}
    for(const key of ['enabled','wake','requireAll','unlockOnObjectives'])if(s[key]!==undefined&&typeof s[key]!=='boolean')throw new Error(g.name+': 켜기/끄기 설정을 확인하세요.');
    for(const key of ['commands','spawnTiles'])if(s[key]!==undefined&&(!Array.isArray(s[key])||s[key].length>(key==='commands'?64:1000)||s[key].some(v=>typeof v!=='string'||!v.trim()||v.length>(key==='commands'?120:160))))throw new Error(g.name+': 명령어 또는 생성 타일 목록을 확인하세요.');
    for(const key of ['entity','containerId','keyId','objectKey','wakeRoomId','mode','spawnRule','finishRule'])if(s[key]!==undefined&&(typeof s[key]!=='string'||s[key].length>160))throw new Error(g.name+': 장치 설정 문자열을 확인하세요.');
    for(const key of ['duration','radius','count','distance','waves','waveInterval'])if(s[key]!==undefined&&(!Number.isFinite(s[key])||Math.abs(s[key])>3600))throw new Error(g.name+': 수량·시간·거리 설정을 확인하세요.');
  }assertScans(p);normalizeScanCoordinates(p);return p;
}
export function objectiveTargets(p,type){return type==='clear'?(p.enemyGroups||[]).map(g=>[g.id,g.name]):type==='survive'?[]:type==='interact'?[...p.gimmicks.filter(g=>g.type==='object').map(g=>[g.id,g.name]),...(p.resourceRules||[]).filter(r=>r.kind==='object').map(r=>[r.objectKey||r.id,r.name])]:type==='visit'?p.placements.map(q=>[q.id,`${p.rooms.find(r=>r.id===q.roomId)?.code||'?'} / ${q.areaCode||'?'} · ${q.name||p.tiles.find(t=>t.id===q.tileId)?.name||'타일'} · ${q.y>=0?(q.y+1)+'층':'지하 '+Math.abs(q.y)+'층'}`]):type==='manual'?[]:p.gimmicks.filter(g=>g.type===({command:'terminal',collect:'keycard',pickup:'cargo',deliver:'cargo',scan:'scan'}[type])).map(g=>[g.id,g.name]).concat((p.resourceRules||[]).filter(r=>r.kind===({collect:'keycard',pickup:'cargo',deliver:'cargo'}[type])).map(r=>[r.objectKey||r.id,r.name]));}
export function missionIssues(p){
  const issues=[],add=(message,target=null)=>issues.push({severity:'error',message,target});
  if(p.missionMode==='objectives'&&!(p.objectives||[]).some(o=>o.required))add('목표 달성 임무에는 필수 목표를 하나 이상 지정하세요.');
  for(const o of p.objectives||[]){if(!['manual','survive'].includes(o.type)&&!objectiveTargets(p,o.type).some(([id])=>id===o.targetId))add(`${o.name}: 목표 대상이 없습니다.`);if(o.type==='command'&&(!o.command.trim()||['HELP','STATUS'].includes(o.command.trim().toUpperCase())))add(`${o.name}: HELP·STATUS 이외의 목표 명령어를 지정하세요.`);}
  for(const g of p.gimmicks){const s=g.settings;
    if(g.type==='alarm'){
      if(!['distance','tiles','none'].includes(s.spawnRule||'distance'))add(`${g.name}: 알람의 생성 규칙을 확인하세요.`,{kind:'gimmick',id:g.id});
      if(s.spawnRule==='tiles'&&(!Array.isArray(s.spawnTiles)||!s.spawnTiles.length||s.spawnTiles.some(id=>!p.placements.some(q=>q.id===id))))add(`${g.name}: 몹을 생성할 배치 타일을 지정하세요.`,{kind:'gimmick',id:g.id});
      if(s.wakeRoomId&&!p.rooms.some(r=>r.id===s.wakeRoomId))add(`${g.name}: 깨울 구역이 없습니다.`,{kind:'gimmick',id:g.id});
    }
    if(g.type==='keycard'&&s.containerId&&!p.gimmicks.some(q=>q.id===s.containerId&&q.type==='supply'))add(`${g.name}: 키카드를 넣을 보급 컨테이너가 없습니다.`,{kind:'gimmick',id:g.id});
  }return [...issues,...scanIssues(p)];
}
export function runtimeIssues(p,issues=[]){
  const out=[...issues.filter(i=>i.severity==='error')];
  for(const t of p.tiles.filter(t=>p.placements.some(q=>q.tileId===t.id)))if(!t.asset?.reference)out.push({severity:'error',message:`${t.name}: 실행하려면 실제 타일 설계도와 타일셋 경로를 연결하세요.`,target:{kind:'library',id:t.id}});
  return out;
}
