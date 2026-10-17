import {BLOCKS,CATEGORY_LABELS,accepts,targetOptions,createBlock,createProgram,findBlock,slotOf,insertBlock,moveBlock,duplicateBlock,programIssues,describeProgram} from './logic.mjs';
import {referenceTarget} from './authoring.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slotLabels={trigger:'시작 이벤트 · 교체',actions:'실행 순서',items:'하위 블록',conditions:'조건 · 모두 만족',then:'참일 때 실행',else:'아닐 때 실행',body:'반복할 동작'};
export function createLogicEditor({panel,getProject,commit,notify,onSelect,onRender,showPreview,onLocate,onSimulate}){
  const state={id:null,category:'action',parentId:'',slot:'actions'};let drag=null;
  const current=()=>getProject().programs.find(p=>p.id===state.id);
  function choose(id,blockId){state.id=id;state.parentId='';state.slot='actions';onSelect?.();onRender();if(blockId)requestAnimationFrame(()=>{const el=[...panel.querySelectorAll('[data-node]')].find(el=>el.dataset.node===blockId);el?.classList.add('reference-focus');el?.scrollIntoView({block:'center',behavior:'smooth'});});}
  function add(){const program=createProgram(getProject());if(commit(p=>p.programs.push(program))){choose(program.id);notify('이벤트를 만들었습니다. 시작 이벤트와 실행 블록을 연결하세요.');}}
  function library(){
    const programs=getProject().programs||[];
    return `<button class="button primary full" data-logic="new">＋ 이벤트 만들기</button><div class="note subtle">발생 → 조건 → 실행 블록을 연결하세요. 지도에서 선택한 구역과 타일을 대상으로 지정할 수 있습니다.</div><div class="section-label"><span>이벤트 목록</span><span>${programs.length}</span></div>${programs.map(p=>`<button class="room-card ${p.id===state.id?'selected':''}" data-logic="select" data-program="${esc(p.id)}"><span class="event-indicator ${p.enabled?'':'disabled'}">⚑</span><div><strong>${esc(p.name)}</strong><small>${p.enabled?'사용':'사용 안 함'} · ${p.once?'한 번만 실행':'반복 실행 허용'}</small></div></button>`).join('')||'<div class="empty-state">아직 이벤트가 없습니다.<br>이벤트 만들기로 시작하세요.</div>'}<div class="divider"></div><button class="button full" data-logic="example">예시 흐름 추가</button><small>구역 진입 → 소등 → 3초 대기 → 경보</small>`;
  }
  const location=()=>{const program=current();try{return program&&slotOf(program,state.parentId,state.slot);}catch{return null;}};
  function render(){
    const canvasScroll=panel.querySelector('.block-canvas')?.scrollTop||0,paletteScroll=panel.querySelector('.block-palette')?.scrollTop||0;
    const project=getProject();if(!current()){state.id=project.programs[0]?.id||null;state.parentId='';state.slot='actions';}
    if(!location()){state.parentId='';state.slot='actions';}
    const program=current();panel.hidden=false;
    panel.innerHTML=`<header class="logic-heading"><div><span class="inspect-kicker">EVENT BLOCKS</span><h2>이벤트 작업실</h2><p>블록을 끌어 넣거나, 연결 위치를 고른 뒤 블록을 눌러 추가하세요.</p></div><button class="button primary" data-logic="new">＋ 새 이벤트</button></header>${program?renderWorkspace(program,project):'<div class="logic-welcome"><span>⚑</span><h3>공간에 사건을 더하세요</h3><p>언제 시작할지 정하고, 조명·문·기믹을 움직이는 블록을 쌓으세요.</p><button class="button primary" data-logic="example">구역 진입 예시로 시작</button></div>'}`;
    if(panel.querySelector('.block-canvas'))panel.querySelector('.block-canvas').scrollTop=canvasScroll;
    if(panel.querySelector('.block-palette'))panel.querySelector('.block-palette').scrollTop=paletteScroll;
  }
  function renderWorkspace(program,project){
    const slot=location(),issues=programIssues({...project,programs:[program]});
    const palette=Object.entries(BLOCKS).filter(([,d])=>d.category===state.category).map(([type,def])=>`<button class="palette-block block-${def.category}" draggable="true" data-logic="add" data-block-type="${type}" ${!accepts(slot.type,type)?'aria-disabled="true"':''}>${esc(def.label)}<span>＋</span></button>`).join('');
    return `<div class="logic-program-settings"><label>이벤트 이름<input data-program-field="name" value="${esc(program.name)}" maxlength="160" required></label><label class="logic-check"><input type="checkbox" data-program-field="enabled" ${program.enabled?'checked':''}> 사용</label><label class="logic-check"><input type="checkbox" data-program-field="once" ${program.once?'checked':''}> 한 번만</label><button class="button" data-logic="preview">흐름 보기</button><button class="button" data-logic="simulate">모의 실행</button><button class="icon-button" data-logic="delete-program" aria-label="이벤트 삭제">×</button></div><div class="logic-workspace"><aside class="block-palette" aria-label="이벤트 블록 목록"><div class="block-categories">${Object.entries(CATEGORY_LABELS).map(([key,label])=>`<button data-logic="category" data-category="${key}" aria-pressed="${state.category===key}" class="category-${key}">${label}</button>`).join('')}</div><p class="slot-hint">선택 위치: <strong>${esc(slotLabels[state.slot])}</strong><br>${slot.type==='statement'?'흐름·실행':CATEGORY_LABELS[slot.type]} 블록을 넣을 수 있습니다.</p>${palette}</aside><div class="block-canvas" aria-label="이벤트 블록 조립 영역"><div class="block-rule-note">${program.once?'조건 충족 후 한 번 실행':'조건이 다시 충족되면 재실행 허용'} · 발생 블록은 노랑, 조건은 청록, 흐름은 보라, 실행은 파랑</div>${slotHTML(program,'','trigger','trigger',true)}<div class="event-flow-arrow">↓ 순서대로 실행</div>${slotHTML(program,'','actions','statement')}<div class="logic-issues" role="status">${issues.map(i=>`<p>${i.severity==='error'?'△':'ⓘ'} ${esc(i.message)}</p>`).join('')||'<p class="good">✓ 블록 연결과 대상 참조가 올바릅니다.</p>'}</div><p class="logic-runtime-note">모드 0.5.0 이상에서 스캔을 포함한 이벤트를 실행합니다. 대기와 반복은 서버 틱을 기준으로 처리합니다.</p></div></div>`;
  }
  function slotHTML(owner,parentId,name,kind,single=false){
    const active=state.parentId===parentId&&state.slot===name,blocks=single?[owner[name]]:owner[name];
    return `<section class="block-slot slot-${kind} ${active?'slot-active':''}" data-slot-parent="${esc(parentId)}" data-slot-name="${name}" data-slot-kind="${kind}" aria-label="${esc(slotLabels[name])}"><button class="slot-heading" data-logic="slot" data-parent="${esc(parentId)}" data-slot="${name}">${esc(slotLabels[name])}<span>${active?'● 연결 위치':'＋ 여기 연결'}</span></button>${blocks.map((b,index)=>`<div class="block-insert" data-slot-parent="${esc(parentId)}" data-slot-name="${name}" data-slot-index="${index}" data-slot-kind="${kind}"></div>${blockHTML(b,single)}`).join('')}${single?'':`<button class="block-drop" data-logic="slot" data-parent="${esc(parentId)}" data-slot="${name}" data-slot-parent="${esc(parentId)}" data-slot-name="${name}" data-slot-index="${blocks.length}" data-slot-kind="${kind}">${blocks.length?'＋ 다음 블록':'＋ 블록을 여기에 연결'}</button>`}</section>`;
  }
  function blockHTML(block,root=false){
    const def=BLOCKS[block.type];return `<article class="event-block block-${def.category}" data-node="${esc(block.id)}"><div class="block-title" ${root?'':'draggable="true"'} data-drag-node="${esc(block.id)}"><span class="block-grip" aria-hidden="true">⠿</span><strong>${esc(def.label)}</strong><div class="block-buttons">${!root?`<button data-logic="up" data-node-id="${esc(block.id)}" aria-label="${esc(def.label)} 위로">↑</button><button data-logic="down" data-node-id="${esc(block.id)}" aria-label="${esc(def.label)} 아래로">↓</button><button data-logic="copy" data-node-id="${esc(block.id)}" aria-label="${esc(def.label)} 복제">⧉</button><button data-logic="remove" data-node-id="${esc(block.id)}" aria-label="${esc(def.label)} 삭제">×</button>`:'<span>시작</span>'}</div></div>${Object.keys(def.fields).length?`<div class="block-fields">${Object.entries(def.fields).map(([key,f])=>fieldHTML(block,key,f)).join('')}</div>`:''}${Object.entries(def.slots).map(([key,kind])=>slotHTML(block,block.id,key,kind)).join('')}</article>`;
  }
  function fieldHTML(block,key,f){
    const value=block.args[key],attributes=`data-node-field="${key}" data-node-id="${esc(block.id)}" aria-label="${esc(f.label)}"`;
    let input;
    if(f.kind==='number')input=`<input type="number" ${attributes} value="${value}" min="${f.min}" max="${f.max}" step="${block.type==='flow.repeat'?'1':'any'}" required>`;
    else if(f.kind==='text')input=`<input ${attributes} value="${esc(value)}" maxlength="${f.max}" required>`;
    else{const options=f.kind==='choice'?f.options:targetOptions(getProject(),f.kind);input=`<select ${attributes}><option value="" ${value===''?'selected':''}>대상을 선택하세요</option>${value&&!options.some(([id])=>id===value)?`<option value="${esc(value)}" selected>없는 대상 · 다시 선택</option>`:''}${options.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`;}
    const ref=referenceTarget(f.kind,value);
    return `<label>${esc(f.label)}${input}${ref?`<button type="button" class="subtle-button target-locate" data-logic="locate" data-target-kind="${ref.kind}" data-target-id="${esc(ref.id)}">대상 위치 보기 ↗</button>`:''}</label>`;
  }
  function edit(fn){const selected=state.id;return commit(p=>{const program=p.programs.find(q=>q.id===selected);if(!program)throw new Error('이벤트를 먼저 선택하세요.');fn(program,p);});}
  function addAt(type,parentId=state.parentId,name=state.slot,index){return edit((program,p)=>insertBlock(program,parentId,name,createBlock(type,p),index));}
  function example(){
    const p=getProject(),program=createProgram(p);program.name='구역 진입 · 소등과 경보';program.trigger=createBlock('when.area',p);
    const alarm=p.gimmicks.find(g=>g.type==='alarm');const lights=createBlock('do.areaLights',p);lights.args.roomId=program.trigger.args.roomId;
    program.actions=[lights,createBlock('flow.wait',p),createBlock(alarm?'do.alarm':'do.message',p)];
    if(commit(next=>next.programs.push(program)))choose(program.id);
  }
  function click(event){
    const button=event.target.closest('[data-logic]');if(!button)return;event.preventDefault();const action=button.dataset.logic;
    if(action==='new')return add();if(action==='example')return example();if(action==='select')return choose(button.dataset.program);
    if(action==='category'){state.category=button.dataset.category;render();return;}
    if(action==='slot'){state.parentId=button.dataset.parent;state.slot=button.dataset.slot;const kind=location()?.type;if(kind==='trigger'||kind==='condition')state.category=kind;else if(['trigger','condition'].includes(state.category))state.category='action';render();return;}
    if(action==='add'){if(button.getAttribute('aria-disabled')==='true'){notify('발생·조건·실행 블록에 맞는 연결 위치를 먼저 선택하세요.',true);return;}addAt(button.dataset.blockType);return;}
    if(action==='locate')return onLocate?.(button.dataset.targetKind,button.dataset.targetId);
    if(action==='simulate')return onSimulate?.();
    if(action==='preview')return showPreview(current().name,describeProgram(current(),getProject()));
    if(action==='delete-program'){const id=state.id;if(commit(p=>{p.programs=p.programs.filter(q=>q.id!==id);}))choose(getProject().programs[0]?.id||null);return;}
    const found=findBlock(current(),button.dataset.nodeId);if(!found)return;
    if(action==='remove'){edit(program=>{const f=findBlock(program,button.dataset.nodeId);f.parent[f.slot].splice(f.parent[f.slot].indexOf(f.block),1);});return;}
    if(action==='copy'){edit(program=>{const f=findBlock(program,button.dataset.nodeId);f.parent[f.slot].splice(f.parent[f.slot].indexOf(f.block)+1,0,duplicateBlock(f.block));});return;}
    if(action==='up'||action==='down')edit(program=>{const f=findBlock(program,button.dataset.nodeId),list=f.parent[f.slot],i=list.indexOf(f.block),j=i+(action==='up'?-1:1);if(j>=0&&j<list.length)[list[i],list[j]]=[list[j],list[i]];});
  }
  function change(event){
    const input=event.target;if(!panel.contains(input))return;
    if(!input.checkValidity()){input.reportValidity();return;}
    if(input.dataset.programField){const key=input.dataset.programField,value=input.type==='checkbox'?input.checked:input.value.trim();edit(p=>p[key]=value);return;}
    if(input.dataset.nodeField){const key=input.dataset.nodeField,id=input.dataset.nodeId,value=input.type==='number'?Number(input.value):input.value;edit(p=>findBlock(p,id).block.args[key]=value);}
  }
  function dragStart(event){
    if(!panel.contains(event.target))return;
    const palette=event.target.closest('[data-block-type]'),node=event.target.closest('[draggable=true][data-drag-node]');
    drag=palette?{type:palette.dataset.blockType}:node?{id:node.dataset.dragNode}:null;
    if(!drag)return;event.dataTransfer.setData('application/x-erosion-block',JSON.stringify(drag));event.dataTransfer.effectAllowed=drag.id?'move':'copy';
  }
  function clearDrop(){panel.querySelectorAll('.drop-hover,.drop-invalid').forEach(e=>e.classList.remove('drop-hover','drop-invalid'));}
  function dragOver(event){const slot=event.target.closest('[data-slot-kind]');if(!drag||!slot)return;event.preventDefault();event.dataTransfer.dropEffect=drag.id?'move':'copy';clearDrop();const type=drag.type||findBlock(current(),drag.id)?.block.type;slot.classList.add(accepts(slot.dataset.slotKind,type)?'drop-hover':'drop-invalid');}
  function drop(event){
    if(!drag)return;const slot=event.target.closest('[data-slot-kind]');if(!slot)return;event.preventDefault();clearDrop();
    const payload=drag;drag=null;const parentId=slot.dataset.slotParent,name=slot.dataset.slotName,index=slot.dataset.slotIndex===undefined?undefined:Number(slot.dataset.slotIndex);
    if(payload.type)addAt(payload.type,parentId,name,index);else edit(program=>moveBlock(program,payload.id,parentId,name,index));
  }
  document.addEventListener('click',click);panel.addEventListener('change',change);panel.addEventListener('dragstart',dragStart);panel.addEventListener('dragover',dragOver);panel.addEventListener('drop',drop);panel.addEventListener('dragend',()=>{drag=null;clearDrop();});
  return {render,library,choose,add,current,close:()=>panel.hidden=true};
}
