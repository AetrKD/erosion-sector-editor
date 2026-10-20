const field=(label,kind,value,extra={})=>({label,kind,value,...extra});
const target=(label,kind)=>field(label,kind,'');
const number=(label,value,min=0,max=3600)=>field(label,'number',value,{min,max});
const choice=(label,value,options)=>field(label,'choice',value,{options});
const text=(label,value,max=160)=>field(label,'text',value,{max});
const definition=(category,label,fields={},slots={})=>({category,label,fields,slots});
export const BLOCKS=Object.freeze({
  'when.progress':definition('trigger','목표 진행',{objectiveId:target('목표','objective'),state:choice('진행','complete',[['progress','진행'],['complete','완료']])}),
  'when.start':definition('trigger','스테이지가 시작되면'),
  'when.area':definition('trigger','구역에 진입하면',{roomId:target('진입 구역','room')}),
  'when.tile':definition('trigger','하위 구역에 진입하면',{placementId:target('진입 타일','placement')}),
  'when.interact':definition('trigger','기믹과 상호작용하면',{gimmickId:target('기믹','gimmick')}),
  'when.complete':definition('trigger','기믹의 목표가 완료되면',{gimmickId:target('완료 기믹','gimmick')}),
  'when.scan':definition('trigger','스캔 상태가 바뀌면',{gimmickId:target('스캔','scan'),state:choice('스캔 상태','complete',[['start','시작'],['step','다음 단계로 진행'],['complete','전체 완료']])}),
  'when.alarm':definition('trigger','경보가 끝나면',{gimmickId:target('경보','alarm')}),
  'when.door':definition('trigger','문의 상태가 바뀌면',{doorId:target('문 · 이쪽 면','door'),state:choice('상태','open',[['open','열림'],['closed','닫힘']])}),
  'when.signal':definition('trigger','신호를 받으면',{signal:text('신호 이름','전력_복구',80)}),
  'when.command':definition('trigger','터미널에 명령어를 입력하면',{gimmickId:target('시설 터미널','terminal'),command:text('명령어','RESTORE_POWER',120)}),
  'when.pickup':definition('trigger','화물을 들어 올리면',{gimmickId:target('화물 상자','cargo')}),
  'when.collect':definition('trigger','ID 키카드를 획득하면',{gimmickId:target('ID 키카드','keycard')}),
  'when.doorAttempt':definition('trigger','보안 문을 열려고 하면',{doorId:target('문 · 이쪽 면','door')}),
  'when.objective':definition('trigger','임무 목표가 완료되면',{objectiveId:target('임무 목표','objective')}),
  'when.all':definition('trigger','아래 이벤트가 모두 발생하면',{}, {items:'trigger'}),
  'when.any':definition('trigger','아래 이벤트 중 하나가 발생하면',{}, {items:'trigger'}),
  'check.players':definition('condition','구역에 플레이어가 있다',{roomId:target('구역','room')}),
  'check.objective':definition('condition','임무 목표가 완료되었다',{objectiveId:target('임무 목표','objective')}),
  'check.alarm':definition('condition','알람 상태를 확인한다',{gimmickId:target('알람','alarm'),state:choice('알람 상태','active',[['active','진행 중'],['complete','종료됨']])}),
  'check.complete':definition('condition','기믹 목표가 완료되었다',{gimmickId:target('기믹','gimmick')}),
  'check.door':definition('condition','문의 상태가 같다',{doorId:target('문 · 이쪽 면','door'),state:choice('상태','open',[['open','열림'],['closed','닫힘'],['locked','잠김']])}),
  'check.variable':definition('condition','변수 값을 비교한다',{variable:text('변수 이름','전력',80),operator:choice('비교','eq',[['eq','='],['ne','≠'],['gt','>'],['gte','≥'],['lt','<'],['lte','≤']]),value:number('비교 값',1,-1000000,1000000),valueVariable:{...text('다른 변수 ID · 비우면 숫자로 비교','',160),optional:true}}),
  'check.all':definition('condition','아래 조건을 모두 만족한다',{}, {items:'condition'}),
  'check.any':definition('condition','아래 조건 중 하나를 만족한다',{}, {items:'condition'}),
  'check.not':definition('condition','아래 조건을 만족하지 않는다',{}, {items:'condition'}),
  'flow.if':definition('control','만약 조건을 만족한다면',{}, {conditions:'condition',then:'statement',else:'statement'}),
  'flow.repeat':definition('control','정해진 횟수만큼 반복',{count:number('반복 횟수',3,1,100)}, {body:'statement'}),
  'flow.until':definition('control','다음 조건을 만족할 때까지 반복',{}, {conditions:'condition',body:'statement'}),
  'flow.wait':definition('control','잠시 기다리기',{seconds:number('대기 시간 · 초',3)}),
  'do.areaLights':definition('action','조명 제어',{roomId:target('조명 범위','lightTarget'),mode:choice('조명 동작','off',[['on','켜기'],['off','끄기'],['blink','깜빡이기']]),interval:number('깜빡임 간격 · 초',.5,.05,60)}),
  'do.tileLights':definition('action','타일 조명 제어',{placementId:target('조명 타일','placement'),mode:choice('조명 동작','off',[['on','켜기'],['off','끄기'],['blink','깜빡이기']]),interval:number('깜빡임 간격 · 초',.5,.05,60)}),
  'do.door':definition('action','문 제어',{doorId:target('문 · 이쪽 면','door'),action:choice('문 동작','unlock',[['open','열기'],['close','닫기'],['unlock','이쪽 면 잠금 해제'],['lock','이쪽 면 잠그기']])}),
  'do.gimmick':definition('action','기믹 제어',{gimmickId:target('대상 기믹','gimmick'),action:choice('기믹 동작','activate',[['activate','활성화'],['deactivate','비활성화'],['complete','목표 완료 처리']])}),
  'do.scan':definition('action','스캔 제어',{gimmickId:target('대상 스캔','scan'),action:choice('스캔 동작','start',[['start','시작'],['pause','일시정지'],['resume','다시 진행'],['reset','초기화 후 시작'],['stop','종료']])}),
  'do.alarm':definition('action','경보 제어',{gimmickId:target('경보 장치','alarm'),action:{...choice('동작','start',[['start','시작'],['stop','정지']]),optional:true}}),
  'do.objective':definition('action','목표 제어',{objectiveId:target('임무 목표','objective'),action:{...choice('동작','complete',[['activate','활성화'],['deactivate','비활성화'],['complete','완료 처리']]),optional:true}}),
  'do.wave':definition('action','적 출현 시작',{gimmickId:target('적 출현 지점','wave')}),
  'do.enemies':definition('action','적 생성 제어',{groupId:target('적 생성 그룹','enemyGroup'),action:choice('동작','start',[['start','시작'],['stop','정지']])}),
  'do.music':definition('action','음악 재생',{sound:text('사운드 리소스 ID','minecraft:music.game',160),action:choice('동작','play',[['play','재생'],['stop','정지']]),volume:number('음량',1,0,2)}),
  'do.message':definition('action','안내 문구 표시',{message:text('표시할 문구','전력이 차단되었습니다.',500),seconds:number('표시 시간 · 초',5,.1,60)}),
  'do.signal':definition('action','신호 보내기',{signal:text('신호 이름','전력_복구',80)}),
  'do.variable':definition('action','변수 값 변경',{variable:text('변수 이름','전력',80),operation:choice('변경 방법','set',[['set','값 설정'],['add','값 더하기']]),value:number('값',1,-1000000,1000000),valueVariable:{...text('다른 변수 ID · 비우면 숫자 사용','',160),optional:true}}),
  'do.mission':definition('action','목표 결과 제어 · 실패',{result:choice('임무 결과','failure',[['success','성공'],['failure','실패']])})
});
export const CATEGORY_LABELS={trigger:'발생',condition:'조건',control:'흐름',action:'실행'};
const id=prefix=>prefix+'_'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
export function accepts(slot,type){const category=BLOCKS[type]?.category;return slot==='statement'?category==='action'||category==='control':slot===category;}
export function targetOptions(project,kind){
  if(kind==='lightTarget')return [...project.rooms.map(r=>[r.id,'구역 · '+r.code]),...project.placements.map(p=>['tile:'+p.id,'타일 · '+p.areaCode])];
  if(kind==='enemyGroup')return (project.enemyGroups||[]).map(g=>[g.id,g.name]);
  if(kind==='scan')return project.gimmicks.filter(g=>g.type==='scan'||g.type==='extraction').map(g=>[g.id,`${project.rooms.find(r=>r.id===project.placements.find(p=>p.id===g.placementId)?.roomId)?.code||'?'} / ${project.placements.find(p=>p.id===g.placementId)?.areaCode||'?'} · ${g.name}`]);
  if(kind==='objective')return (project.objectives||[]).map(o=>[o.id,o.name]);
  if(kind==='room')return project.rooms.map(r=>[r.id,`${r.code}구역 · ${r.name}`]);
  if(kind==='placement')return project.placements.map(p=>[p.id,`${project.rooms.find(r=>r.id===p.roomId)?.code||'?'} / ${p.areaCode||'?'}구역 (${project.tiles.find(t=>t.id===p.tileId)?.name||'타일'})`]);
  if(kind==='door')return project.placements.flatMap(p=>(project.tiles.find(t=>t.id===p.tileId)?.ports||[]).map(port=>[p.id+':'+port.id,`${project.rooms.find(r=>r.id===p.roomId)?.code||'?'} / ${p.areaCode||'?'} · ${port.name}`]));
  return project.gimmicks.filter(g=>kind==='gimmick'||g.type===kind).map(g=>[g.id,`${project.rooms.find(r=>r.id===project.placements.find(p=>p.id===g.placementId)?.roomId)?.code||'?'} / ${project.placements.find(p=>p.id===g.placementId)?.areaCode||'?'} · ${g.name}`]);
}
export function createBlock(type,project){
  const def=BLOCKS[type];if(!def)throw new Error('지원하지 않는 이벤트 블록입니다.');
    const args=Object.fromEntries(Object.entries(def.fields).map(([key,f])=>[key,!['number','text','choice'].includes(f.kind)?targetOptions(project,f.kind)[0]?.[0]||'':f.value]));
  if(['do.variable','check.variable'].includes(type)&&project.variables?.length)args.variable=project.variables[0].id;
  return {id:id('block'),type,args,...Object.fromEntries(Object.keys(def.slots).map(k=>[k,[]]))};
}
export function createProgram(project){return {id:id('event'),name:'새 이벤트',enabled:true,once:true,trigger:createBlock('when.start',project),actions:[]};}
export function walkBlocks(program,visit){
  const walk=(block,parent,slot)=>{visit(block,parent,slot);for(const key of Object.keys(BLOCKS[block.type]?.slots||{}))for(const child of block[key]||[])walk(child,block,key);};
  walk(program.trigger,program,'trigger');for(const block of program.actions)walk(block,program,'actions');
}
export function findBlock(program,id){let found;walkBlocks(program,(block,parent,slot)=>{if(block.id===id)found={block,parent,slot};});return found;}
export function slotOf(program,parentId,name){
  if(!parentId){if(name==='trigger')return {type:'trigger',single:true,parent:program,name};if(name==='actions')return {type:'statement',parent:program,name};}
  const parent=findBlock(program,parentId)?.block,type=parent&&BLOCKS[parent.type]?.slots[name];
  if(!type)throw new Error('블록을 넣을 위치를 다시 선택하세요.');return {type,parent,name};
}
export function insertBlock(program,parentId,name,block,index){
  const slot=slotOf(program,parentId,name);if(!accepts(slot.type,block.type))throw new Error('이 위치에는 해당 종류의 블록을 연결할 수 없습니다.');
  if(slot.single)slot.parent[name]=block;else slot.parent[name].splice(index??slot.parent[name].length,0,block);
}
export function moveBlock(program,blockId,parentId,name,index){
  const source=findBlock(program,blockId);if(!source)throw new Error('옮길 블록이 없습니다.');if(source.slot==='trigger'&&source.parent===program)throw new Error('시작 블록은 교체하거나 내부 발생 슬롯에 새 블록을 추가하세요.');
  let descendant=source.block.id===parentId;
  const search=block=>{for(const key of Object.keys(BLOCKS[block.type].slots))for(const child of block[key]){if(child.id===parentId)descendant=true;search(child);}};search(source.block);
  if(descendant)throw new Error('블록을 자기 자신이나 자식 안으로 옮길 수 없습니다.');
  const slot=slotOf(program,parentId,name);if(!accepts(slot.type,source.block.type))throw new Error('발생·조건·실행 슬롯의 종류가 맞지 않습니다.');
  const list=source.parent[source.slot],old=list.indexOf(source.block);list.splice(old,1);
  if(slot.parent===source.parent&&slot.name===source.slot&&index!==undefined&&old<index)index--;
  insertBlock(program,parentId,name,source.block,index);
}
export function duplicateBlock(block){
  const copy=structuredClone(block);const refresh=b=>{b.id=id('block');for(const key of Object.keys(BLOCKS[b.type].slots))b[key].forEach(refresh);};refresh(copy);return copy;
}
export function assertPrograms(programs){
  const fail=message=>{throw new Error('이벤트 블록: '+message);};
  if(!Array.isArray(programs)||programs.length>300)fail('이벤트는 최대 300개입니다.');
  const ids=new Set();let count=0;
  const checkId=value=>{if(typeof value!=='string'||!value||value.length>160||ids.has(value))fail('ID가 잘못되었거나 중복되었습니다.');ids.add(value);};
  const check=(b,kind,depth)=>{
    if(++count>5000||depth>12)fail('블록은 총 5000개, 중첩은 12단계 이하로 구성하세요.');
    const def=b&&BLOCKS[b.type];if(!def||!accepts(kind,b.type))fail('알 수 없거나 연결 위치에 맞지 않는 블록입니다.');checkId(b.id);
    if(!b.args||Array.isArray(b.args)||typeof b.args!=='object')fail('블록 속성이 올바르지 않습니다.');
    for(const [key,f] of Object.entries(def.fields)){
      const value=b.args[key];if(f.optional&&value===undefined)continue;
      if(f.kind==='number'){if(!Number.isFinite(value)||value<f.min||value>f.max||(b.type==='flow.repeat'&&!Number.isInteger(value)))fail(f.label+' 값을 확인하세요.');}
      else if(f.kind==='choice'){if(!f.options.some(([id])=>id===value))fail(f.label+' 선택을 확인하세요.');}
      else if(typeof value!=='string'||value.length>(f.max||320))fail(f.label+' 값을 확인하세요.');
    }
    for(const [key,slot] of Object.entries(def.slots)){if(!Array.isArray(b[key]))fail('중첩 블록 목록이 올바르지 않습니다.');b[key].forEach(child=>check(child,slot,depth+1));}
  };
  for(const p of programs){if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>160||typeof p.enabled!=='boolean'||typeof p.once!=='boolean'||!Array.isArray(p.actions))fail('이벤트 이름이나 실행 설정이 올바르지 않습니다.');checkId(p.id);check(p.trigger,'trigger',0);p.actions.forEach(b=>check(b,'statement',0));}
}
export function programIssues(project){
  const issues=[],targets=new Map();
  const exists=(kind,value)=>{if(!targets.has(kind))targets.set(kind,new Set(targetOptions(project,kind).map(([id])=>id)));return targets.get(kind).has(value);};
  for(const p of project.programs||[]){
    const add=message=>issues.push({severity:p.enabled?'error':'warning',message:`${p.name}: ${message}`,target:{kind:'program',id:p.id}});
    if(!p.actions.length)add('실행 블록을 하나 이상 연결하세요.');
    walkBlocks(p,b=>{
      const def=BLOCKS[b.type];if(!def)return;
      for(const [key,f] of Object.entries(def.fields)){
        if(f.optional&&(b.args[key]===undefined||b.args[key]===''))continue;
        if(!['number','text','choice'].includes(f.kind)&&!exists(f.kind,b.args[key]))add(`${def.label}의 ${f.label} 대상이 없습니다.`);
        if(f.kind==='text'&&!b.args[key].trim())add(`${def.label}의 ${f.label}을 입력하세요.`);
      }
      if(['when.all','when.any','check.all','check.any','check.not'].includes(b.type)&&!b.items.length)add(`${def.label} 안에 블록을 넣으세요.`);
      if(b.type==='check.not'&&b.items.length>1)add('조건 반전에는 조건 하나를 넣으세요. 여러 조건은 모두/하나 블록으로 먼저 묶으세요.');
      if(b.type==='flow.if'&&!b.conditions.length)add('만약 블록에 조건을 넣으세요.');
      if(b.type==='flow.repeat'&&!b.body.length)add('반복할 실행 블록을 넣으세요.');
    });
  }
  // Signals are event wiring, never browser code. Flag direct and multi-event re-entry loops.
  const rules=(project.programs||[]).filter(p=>p.enabled),listeners=new Map(),edges=new Map();
  for(const p of rules){edges.set(p.id,new Set());walkBlocks(p,b=>{if(b.type==='when.signal'){const list=listeners.get(b.args.signal)||[];list.push(p);listeners.set(b.args.signal,list);}});}
  for(const p of rules)walkBlocks(p,b=>{if(b.type==='do.signal')for(const to of listeners.get(b.args.signal)||[])edges.get(p.id).add(to.id);});
  const visiting=new Set(),visited=new Set();
  const visit=id=>{if(visiting.has(id))return true;if(visited.has(id))return false;visiting.add(id);for(const next of edges.get(id)||[])if(visit(next))return true;visiting.delete(id);visited.add(id);return false;};
  if(rules.some(p=>visit(p.id)))issues.push({severity:'warning',message:'이벤트 신호가 순환 연결되어 있습니다. 반복 실행 이벤트는 대기·횟수 조건을 확인하세요.',target:null});
  return issues;
}
export function blockDescription(block,project){
  const def=BLOCKS[block.type];return def.label+Object.entries(def.fields).map(([key,f])=>{
    const v=block.args[key]??f.value;let value=v;
    if(f.kind==='choice')value=f.options.find(([id])=>id===v)?.[1]||v;
    else if(!['text','number'].includes(f.kind))value=targetOptions(project,f.kind).find(([id])=>id===v)?.[1]||'대상 없음';
    return ` · ${f.label}: ${value}`;
  }).join('');
}
export function describeProgram(program,project){
  const rows=[];const names={items:'하위 조건',conditions:'조건을 모두 만족하면',then:'실행',else:'아니면',body:'반복할 동작'};
  const visit=(b,depth)=>{rows.push('  '.repeat(depth)+blockDescription(b,project));for(const key of Object.keys(BLOCKS[b.type].slots)){if(b[key].length){rows.push('  '.repeat(depth+1)+names[key]);b[key].forEach(child=>visit(child,depth+2));}}};
  visit(program.trigger,0);program.actions.forEach(b=>visit(b,0));return rows.join('\n');
}
