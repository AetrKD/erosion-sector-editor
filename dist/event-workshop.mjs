import {BLOCKS,createProgram,createBlock,duplicateBlock,findBlock,walkBlocks} from './logic.mjs';

export const SLOT_LABELS={trigger:'발생 조건 · 교체',actions:'실행 동작',items:'하위 블록',conditions:'조건 · 모두 만족',then:'참일 때 실행',else:'아닐 때 실행',body:'반복할 동작'};
export const EVENT_TEMPLATES=[
  {id:'area-alarm',name:'구역 진입 · 소등과 경보',description:'구역 진입 → 조명 끄기 → 3초 대기 → 알람'},
  {id:'door-scan',name:'보안 문 · 알람과 스캔',description:'문 열기 시도 → 알람 시작 → 스캔 완료 대기 → 알람 정지 → 잠금 해제'},
  {id:'scan-unlock',name:'스캔 완료 · 문 잠금 해제',description:'스캔 전체 완료 → 문 한쪽 잠금 해제'},
  {id:'keycard-unlock',name:'키카드 획득 · 문 잠금 해제',description:'ID 키카드 획득 → 문 한쪽 잠금 해제'}
];
export function createEventTemplate(id,project){
  const template=EVENT_TEMPLATES.find(t=>t.id===id);if(!template)throw new Error('없는 이벤트 템플릿입니다.');
  const p=createProgram(project);p.name=template.name;
  if(id==='area-alarm'){
    p.trigger=createBlock('when.area',project);const lights=createBlock('do.areaLights',project);lights.args.roomId=p.trigger.args.roomId;
    p.actions=[lights,createBlock('flow.wait',project),createBlock(project.gimmicks.some(g=>g.type==='alarm')?'do.alarm':'do.message',project)];
  }else{
    p.trigger=createBlock({'door-scan':'when.doorAttempt','scan-unlock':'when.scan','keycard-unlock':'when.collect'}[id],project);
    if(id==='door-scan'){const start=createBlock('do.alarm',project),stop=createBlock('do.alarm',project);stop.args={...start.args,action:'stop'};p.actions=[start,createBlock('do.runScan',project),stop,createBlock('do.door',project)];}else p.actions=[createBlock('do.door',project)];
  }
  return p;
}
export function copyEvent(program,project){return {...program,id:createProgram(project).id,name:program.name.slice(0,154)+' · 복사본',trigger:duplicateBlock(program.trigger),actions:program.actions.map(duplicateBlock)};}
export function eventCount(program){let count=0;walkBlocks(program,()=>count++);return count;}
export function slotPath(program,parentId,slot){
  const parts=[SLOT_LABELS[slot]||slot],seen=new Set();
  while(parentId&&!seen.has(parentId)){seen.add(parentId);const node=findBlock(program,parentId);if(!node)break;parts.unshift(BLOCKS[node.block.type].label);if(node.parent===program){parts.unshift(SLOT_LABELS[node.slot]);break;}parts.unshift(SLOT_LABELS[node.slot]||node.slot);parentId=node.parent.id;}
  return parts.join(' › ');
}
export function paletteTypes(project,category,query=''){
  const needle=query.trim().toLocaleLowerCase();
  const allowed=new Set(['when.start','when.area','when.tile','when.progress','when.signal','when.door','when.doorAttempt','when.all','when.any','check.players','check.objective','check.alarm','check.variable','check.all','check.any','check.not','flow.if','flow.repeat','flow.until','flow.wait','do.areaLights','do.door','do.objective','do.alarm','do.runScan','do.enemies','do.spawnTable','do.stopTable','do.signal','do.variable','do.mission','do.music']);
  return Object.entries(BLOCKS).filter(([type])=>allowed.has(type)&&(type!=='do.enemies'||project.enemyGroups?.length)).filter(([type,def])=>(needle?(def.label+' '+type).toLocaleLowerCase().includes(needle):def.category===category)&&(type!=='when.command'||project.gimmicks.some(g=>g.type==='terminal')));
}
