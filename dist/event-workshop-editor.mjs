import {BLOCKS,CATEGORY_LABELS,accepts,createBlock,createProgram,findBlock,slotOf,insertBlock,moveBlock,duplicateBlock,programIssues,describeProgram,blockDescription,walkBlocks,targetOptions} from './logic.mjs';
import {referenceTarget} from './authoring.mjs';
import {SLOT_LABELS,EVENT_TEMPLATES,createEventTemplate,copyEvent,eventCount,slotPath,paletteTypes} from './event-workshop.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createLogicEditor({panel,getProject,commit,notify,onSelect,onRender,showPreview,onLocate,onSimulate}){
  const state={id:null,category:'action',parentId:'',slot:'actions',query:'',filter:'',paletteOpen:innerWidth>620,collapsed:new Set()};let drag=null,updatingFields=false;
  const current=()=>getProject().programs.find(p=>p.id===state.id);
  const location=()=>{try{return current()&&slotOf(current(),state.parentId,state.slot);}catch{return null;}};
  function normalize(){if(!current()){state.id=getProject().programs[0]?.id||null;state.parentId='';state.slot='actions';state.filter='';state.collapsed.clear();}if(!location()){state.parentId='';state.slot='actions';}}
  function choose(id,blockId){state.id=id;state.parentId='';state.slot='actions';state.query='';state.paletteOpen=innerWidth>620;state.collapsed.clear();if(['condition','trigger'].includes(state.category))state.category='action';onSelect?.();onRender();if(blockId)requestAnimationFrame(()=>{const el=[...panel.querySelectorAll('[data-node]')].find(el=>el.dataset.node===blockId);el?.classList.add('reference-focus');el?.scrollIntoView({block:'center',behavior:'smooth'});});}
  function add(){const p=createProgram(getProject());if(commit(project=>project.programs.push(p))){state.filter='';choose(p.id);notify('새 이벤트를 만들었습니다. 발생 조건과 실행 동작을 정하세요.');}}
  function templates(){return EVENT_TEMPLATES.map(t=>`<button class="event-template" data-logic="template" data-template-id="${t.id}"><strong>${esc(t.name)}</strong><small>${esc(t.description)}</small><span aria-hidden="true">＋</span></button>`).join('');}
  function programCards(){
    const needle=state.filter.trim().toLocaleLowerCase(),programs=getProject().programs.filter(p=>(p.name+' '+BLOCKS[p.trigger.type].label).toLocaleLowerCase().includes(needle));
    return programs.map(p=>`<button class="room-card ${p.id===state.id?'selected':''}" data-logic="select" data-program="${esc(p.id)}" ${p.id===state.id?'aria-current="true"':''}><span class="event-indicator ${p.enabled?'':'disabled'}">⚑</span><div><strong>${esc(p.name)}</strong><small>${p.enabled?'사용':'사용 안 함'} · ${p.once?'한 번만 실행':'반복 실행 허용'}</small><small class="event-list-trigger">${esc(BLOCKS[p.trigger.type].label)}</small></div></button>`).join('')||`<div class="empty-state">${needle?'일치하는 이벤트가 없습니다.':'아직 이벤트가 없습니다.<br>새 이벤트나 아래 템플릿으로 시작하세요.'}</div>`;
  }
  function library(){normalize();return `<button class="button primary full" data-logic="new">＋ 이벤트 만들기</button><label class="event-list-search">이벤트 찾기<input id="eventSearch" type="search" aria-label="이벤트 검색" placeholder="이름·발생 조건 검색" value="${esc(state.filter)}"></label><div class="section-label"><span>이벤트 목록</span><span>${getProject().programs.length}</span></div><div id="eventList">${programCards()}</div><details class="event-template-library" ${getProject().programs.length?'':'open'}><summary>템플릿으로 시작</summary>${templates()}</details><button class="subtle-button full" data-logic="example">구역 진입 예시 추가</button>`;}
  function render(){
    const canvasScroll=panel.querySelector('.block-canvas')?.scrollTop||0,paletteScroll=panel.querySelector('.palette-results')?.scrollTop||0;
    normalize();const p=current();panel.hidden=false;
    panel.innerHTML=`<header class="logic-heading"><div><h2>이벤트 작업실</h2><p>이벤트 선택 → 발생 조건 → 실행 동작 순서로 구성하세요.</p></div><button class="button primary" data-logic="new">＋ 새 이벤트</button></header>${p?workspace(p):`<div class="logic-welcome"><span>⚑</span><h3>첫 이벤트를 만들어 보세요</h3><p>직접 블록을 조립하거나 아래 흐름에서 시작할 수 있습니다.<br>템플릿을 추가한 뒤 구역·문·스캔 대상을 확인하세요.</p><div class="event-template-grid">${templates()}</div><button class="button" data-logic="new">빈 이벤트로 시작</button></div>`}`;
    if(panel.querySelector('.block-canvas'))panel.querySelector('.block-canvas').scrollTop=canvasScroll;
    if(panel.querySelector('.palette-results'))panel.querySelector('.palette-results').scrollTop=paletteScroll;
    const count=panel.querySelector('#paletteCount');if(count)count.textContent=paletteTypes(getProject(),state.category,state.query).length+'개 · 끌거나 클릭해서 추가';
  }
  function workspace(p){
    const project=getProject(),issues=programIssues({...project,programs:[p]}),count=issues.length;
    return `<div class="logic-program-settings"><label>이벤트 이름<input data-program-field="name" value="${esc(p.name)}" maxlength="160" required></label><label class="logic-check"><input type="checkbox" data-program-field="enabled" ${p.enabled?'checked':''}> 이벤트 사용</label><label class="logic-check"><input type="checkbox" data-program-field="once" ${p.once?'checked':''}> 한 번만 실행</label><div class="event-program-actions"><button class="button" data-logic="preview">흐름 보기</button><button class="button" data-logic="copy-program">복제</button><button class="button danger" data-logic="delete-program" aria-label="이벤트 삭제">삭제</button></div></div>
      <div class="event-workbar"><span class="event-status ${count?'needs-attention':'good'}">${p.enabled?'사용 중':'사용 안 함'} · 블록 ${eventCount(p)}개 · ${count?`확인 ${count}개`:'연결 검사 통과'}</span><div><button data-logic="fold-all">모두 접기</button><button data-logic="unfold-all">모두 펼치기</button><button data-logic="palette" aria-expanded="${state.paletteOpen}">${state.paletteOpen?'블록 목록 접기':'블록 목록 열기'}</button></div></div>
      <div class="logic-workspace ${state.paletteOpen?'':'palette-closed'}"><aside class="block-palette" aria-label="이벤트 블록 목록"><div class="palette-controls"><label>블록 찾기<input id="blockSearch" type="search" aria-label="이벤트 블록 검색" placeholder="문, 스캔, 조명…" value="${esc(state.query)}"></label><div class="block-categories" aria-label="블록 종류">${Object.entries(CATEGORY_LABELS).map(([key,label])=>`<button data-logic="category" data-category="${key}" aria-pressed="${state.category===key}" class="category-${key}">${label}</button>`).join('')}</div><div class="slot-hint"><small>현재 추가 위치</small><strong>${esc(slotPath(p,state.parentId,state.slot))}</strong><span>${location().single?'발생 블록을 교체합니다. 실행 취소로 되돌릴 수 있습니다.':location().type==='statement'?'실행·흐름 블록을 추가할 수 있습니다.':'같은 종류의 하위 블록을 추가하세요.'}</span></div><span id="paletteCount" class="palette-count"></span></div><div class="palette-results">${paletteHTML()}</div></aside>
      <div class="block-canvas" aria-label="이벤트 블록 조립 영역"><div class="event-flow"><div class="event-step-heading"><b>1</b><div><h3>언제 시작하나요?</h3><p>발생 조건을 고르면 블록 목록에서 다른 조건으로 바꿀 수 있습니다.</p></div></div>${slotHTML(p,'','trigger','trigger',true)}<div class="event-step-heading"><b>2</b><div><h3>무엇을 실행하나요?</h3><p>위에서 아래로 실행합니다. 분기와 반복 안에도 동작을 넣을 수 있습니다.</p></div></div>${slotHTML(p,'','actions','statement')}<div class="logic-issues" role="status">${issues.map(i=>`<p>${i.severity==='error'?'△':'ⓘ'} ${esc(i.message)}</p>`).join('')||'<p class="good">✓ 블록 연결과 대상 참조가 올바릅니다.</p>'}</div><p class="logic-runtime-note">블록은 드래그하거나 추가 위치를 고른 뒤 클릭해 넣습니다. ↑↓로 순서를 바꾸고, 공통 메뉴의 ↶ 또는 Ctrl+Z로 되돌립니다.</p></div></div></div>`;
  }
  function paletteHTML(){
    const slot=location(),types=paletteTypes(getProject(),state.category,state.query);
    return types.map(([type,def])=>`<button class="palette-block block-${def.category}" draggable="true" data-logic="add" data-block-type="${type}" ${accepts(slot.type,type)?'':'aria-disabled="true"'} title="${accepts(slot.type,type)?slot.single?'발생 조건을 이 블록으로 교체':'선택한 위치에 추가':'다른 종류의 추가 위치를 먼저 선택하세요'}"><span><strong>${esc(def.label)}</strong><small>${CATEGORY_LABELS[def.category]}${accepts(slot.type,type)?'':' · 현재 위치에 추가 불가'}</small></span><span aria-hidden="true">${slot.single?'↺':'＋'}</span></button>`).join('')||'<div class="empty-state">일치하는 블록이 없습니다.<br><button class="subtle-button" data-logic="clear-search">검색 지우기</button></div>';
  }
  function refreshPalette(){const results=panel.querySelector('.palette-results');if(results)results.innerHTML=paletteHTML();const count=panel.querySelector('#paletteCount');if(count)count.textContent=paletteTypes(getProject(),state.category,state.query).length+'개 · 끌거나 클릭해서 추가';}
  function slotHTML(owner,parentId,name,kind,single=false){
    const active=state.parentId===parentId&&state.slot===name,blocks=single?[owner[name]]:owner[name];
    return `<section class="block-slot slot-${kind} ${active?'slot-active':''}" data-slot-parent="${esc(parentId)}" data-slot-name="${name}" data-slot-kind="${kind}" aria-label="${esc(SLOT_LABELS[name])}"><button class="slot-heading" data-logic="slot" data-parent="${esc(parentId)}" data-slot="${name}">${esc(SLOT_LABELS[name])}<span>${active?'● 선택됨':'＋ 여기 추가'}</span></button>${blocks.map((b,index)=>`<div class="block-insert" data-slot-parent="${esc(parentId)}" data-slot-name="${name}" data-slot-index="${index}" data-slot-kind="${kind}"></div>${blockHTML(b,single)}`).join('')}${single?'':`<button class="block-drop" data-logic="slot" data-parent="${esc(parentId)}" data-slot="${name}" data-slot-parent="${esc(parentId)}" data-slot-name="${name}" data-slot-index="${blocks.length}" data-slot-kind="${kind}">${blocks.length?'＋ 다음 동작 추가':'＋ 추가할 위치를 고르고 블록을 클릭하세요'}</button>`}</section>`;
  }
  function blockHTML(block,root=false){
    const def=BLOCKS[block.type],folded=state.collapsed.has(block.id);
    return `<article class="event-block block-${def.category}" data-node="${esc(block.id)}"><div class="block-title" ${root?'':'draggable="true"'} data-drag-node="${esc(block.id)}"><span class="block-grip" aria-hidden="true">⠿</span><strong>${esc(def.label)}</strong><div class="block-buttons"><button data-logic="fold" data-node-id="${esc(block.id)}" aria-expanded="${!folded}" aria-label="${esc(def.label)} ${folded?'펼치기':'접기'}">${folded?'▸':'▾'}</button>${root?'<span>발생</span>':`<button data-logic="up" data-node-id="${esc(block.id)}" aria-label="${esc(def.label)} 위로">↑</button><button data-logic="down" data-node-id="${esc(block.id)}" aria-label="${esc(def.label)} 아래로">↓</button><button data-logic="copy" data-node-id="${esc(block.id)}" aria-label="${esc(def.label)} 복제">⧉</button><button data-logic="remove" data-node-id="${esc(block.id)}" aria-label="${esc(def.label)} 삭제">×</button>`}</div></div>${folded?`<p class="block-summary" title="${esc(blockDescription(block,getProject()))}">${esc(blockDescription(block,getProject()))}</p>`:''}<div class="block-content" ${folded?'hidden':''}>${Object.keys(def.fields).length?`<div class="block-fields">${Object.entries(def.fields).map(([key,f])=>fieldHTML(block,key,f)).join('')}</div>`:''}${Object.entries(def.slots).map(([key,kind])=>slotHTML(block,block.id,key,kind)).join('')}</div></article>`;
  }
  function fieldHTML(block,key,f){
    const value=block.args[key],attributes=`data-node-field="${key}" data-node-id="${esc(block.id)}" aria-label="${esc(f.label)}"`;let input;
    if(f.kind==='number')input=`<input type="number" ${attributes} value="${value}" min="${f.min}" max="${f.max}" step="${block.type==='flow.repeat'?'1':'any'}" required>`;
    else if(f.kind==='text')input=`<input ${attributes} value="${esc(value)}" maxlength="${f.max}" required>`;
    else{const options=f.kind==='choice'?f.options:targetOptions(getProject(),f.kind);input=`<select ${attributes}><option value="" ${value===''?'selected':''}>대상을 선택하세요</option>${value&&!options.some(([id])=>id===value)?`<option value="${esc(value)}" selected>없는 대상 · 다시 선택</option>`:''}${options.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`;}
    const ref=referenceTarget(f.kind,value);return `<label>${esc(f.label)}${input}${ref?`<button type="button" class="subtle-button target-locate" data-logic="locate" data-target-kind="${ref.kind}" data-target-id="${esc(ref.id)}">대상 위치 보기 ↗</button>`:''}</label>`;
  }
  function edit(fn,inline=false){const selected=state.id;updatingFields=inline;try{return commit(project=>{const p=project.programs.find(p=>p.id===selected);if(!p)throw new Error('이벤트를 먼저 선택하세요.');fn(p,project);});}finally{updatingFields=false;}}
  function refreshInline(){
    const p=current(),issues=programIssues({...getProject(),programs:[p]}),status=panel.querySelector('.event-status');
    if(status){status.className='event-status '+(issues.length?'needs-attention':'good');status.textContent=`${p.enabled?'사용 중':'사용 안 함'} · 블록 ${eventCount(p)}개 · ${issues.length?`확인 ${issues.length}개`:'연결 검사 통과'}`;}
    const list=panel.querySelector('.logic-issues');if(list)list.innerHTML=issues.map(i=>`<p>${i.severity==='error'?'△':'ⓘ'} ${esc(i.message)}</p>`).join('')||'<p class="good">✓ 블록 연결과 대상 참조가 올바릅니다.</p>';
    // Keep field and button nodes stable while blur/change is followed by a click.
    for(const row of document.querySelectorAll('#eventList [data-program]')){const event=getProject().programs.find(p=>p.id===row.dataset.program);if(!event)continue;row.querySelector('strong').textContent=event.name;row.querySelector('small').textContent=`${event.enabled?'사용':'사용 안 함'} · ${event.once?'한 번만 실행':'반복 실행 허용'}`;row.querySelector('.event-indicator').classList.toggle('disabled',!event.enabled);}
  }
  function addAt(type,parentId=state.parentId,name=state.slot,index){let id;const ok=edit((p,project)=>{const block=createBlock(type,project);id=block.id;insertBlock(p,parentId,name,block,index);});if(ok)requestAnimationFrame(()=>[...panel.querySelectorAll('[data-node]')].find(el=>el.dataset.node===id)?.scrollIntoView({block:'nearest'}));return ok;}
  function template(id){const p=createEventTemplate(id,getProject());if(commit(project=>project.programs.push(p))){state.filter='';choose(p.id);notify('템플릿을 추가했습니다. 발생 조건과 실행 동작의 대상을 확인하세요.');}}
  function selectSlot(parentId,name){state.parentId=parentId;state.slot=name;state.paletteOpen=true;state.query='';const kind=location()?.type;state.category=kind==='trigger'||kind==='condition'?kind:'action';}
  function click(event){
    const button=event.target.closest('[data-logic]');if(!button)return;event.preventDefault();const action=button.dataset.logic;
    if(action==='new')return add();if(action==='example')return template('area-alarm');if(action==='template')return template(button.dataset.templateId);if(action==='select')return choose(button.dataset.program);
    if(action==='category'){state.category=button.dataset.category;state.query='';render();return;}
    if(action==='clear-search'){state.query='';panel.querySelector('#blockSearch').value='';refreshPalette();return;}
    if(action==='slot'){selectSlot(button.dataset.parent,button.dataset.slot);render();return;}
    if(action==='add'){if(button.getAttribute('aria-disabled')==='true'){notify('발생·조건·실행에 맞는 추가 위치를 먼저 선택하세요.',true);return;}if(innerWidth<=620)state.paletteOpen=false;addAt(button.dataset.blockType);return;}
    if(action==='locate')return onLocate?.(button.dataset.targetKind,button.dataset.targetId);
    if(action==='simulate')return onSimulate?.();if(action==='preview')return showPreview(current().name,describeProgram(current(),getProject()));
    if(action==='palette'){state.paletteOpen=!state.paletteOpen;render();return;}
    if(action==='fold-all'||action==='unfold-all'){state.collapsed.clear();if(action==='fold-all'){walkBlocks(current(),b=>state.collapsed.add(b.id));state.parentId='';state.slot='actions';}render();return;}
    if(action==='copy-program'){const copy=copyEvent(current(),getProject());if(commit(p=>p.programs.push(copy))){state.filter='';choose(copy.id);notify('이벤트를 복제했습니다. 대상 연결은 유지됩니다.');}return;}
    if(action==='delete-program'){const id=state.id;if(commit(p=>{p.programs=p.programs.filter(p=>p.id!==id);})){choose(getProject().programs[0]?.id||null);notify('이벤트를 삭제했습니다. 실행 취소로 되돌릴 수 있습니다.');}return;}
    const found=findBlock(current(),button.dataset.nodeId);if(!found)return;
    if(action==='fold'){if(state.collapsed.has(found.block.id))state.collapsed.delete(found.block.id);else{state.collapsed.add(found.block.id);state.parentId='';state.slot='actions';}render();return;}
    if(action==='remove'){edit(p=>{const f=findBlock(p,button.dataset.nodeId);f.parent[f.slot].splice(f.parent[f.slot].indexOf(f.block),1);});return;}
    if(action==='copy'){edit(p=>{const f=findBlock(p,button.dataset.nodeId);f.parent[f.slot].splice(f.parent[f.slot].indexOf(f.block)+1,0,duplicateBlock(f.block));});return;}
    if(action==='up'||action==='down')edit(p=>{const f=findBlock(p,button.dataset.nodeId),list=f.parent[f.slot],i=list.indexOf(f.block),j=i+(action==='up'?-1:1);if(j>=0&&j<list.length)[list[i],list[j]]=[list[j],list[i]];});
  }
  function change(event){const input=event.target;if(!panel.contains(input))return;if(!input.checkValidity()){input.reportValidity();return;}
    if(input.dataset.programField){const key=input.dataset.programField,value=input.type==='checkbox'?input.checked:input.value.trim();if(edit(p=>p[key]=value,true)&&input.type!=='checkbox')input.value=value;return;}
    if(input.dataset.nodeField){const key=input.dataset.nodeField,id=input.dataset.nodeId,value=input.type==='number'?Number(input.value):input.value;if(edit(p=>findBlock(p,id).block.args[key]=value,true)){
      const block=findBlock(current(),id).block,ref=referenceTarget(BLOCKS[block.type].fields[key].kind,value),label=input.closest('label'),button=label.querySelector('.target-locate');
      if(ref){if(button){button.dataset.targetKind=ref.kind;button.dataset.targetId=ref.id;}else label.insertAdjacentHTML('beforeend',`<button type="button" class="subtle-button target-locate" data-logic="locate" data-target-kind="${ref.kind}" data-target-id="${esc(ref.id)}">대상 위치 보기 ↗</button>`);}else button?.remove();
    }}
  }
  function input(event){if(event.target.id==='blockSearch'){state.query=event.target.value;refreshPalette();}if(event.target.id==='eventSearch'){state.filter=event.target.value;const list=document.getElementById('eventList');if(list)list.innerHTML=programCards();}}
  function dragStart(event){if(!panel.contains(event.target))return;const palette=event.target.closest('[data-block-type]'),node=event.target.closest('[draggable=true][data-drag-node]');drag=palette?{type:palette.dataset.blockType}:node?{id:node.dataset.dragNode}:null;if(!drag)return;event.dataTransfer.setData('application/x-erosion-block',JSON.stringify(drag));event.dataTransfer.effectAllowed=drag.id?'move':'copy';}
  function clearDrop(){panel.querySelectorAll('.drop-hover,.drop-invalid').forEach(e=>e.classList.remove('drop-hover','drop-invalid'));}
  function dragOver(event){const slot=event.target.closest('[data-slot-kind]');if(!drag||!slot)return;event.preventDefault();event.dataTransfer.dropEffect=drag.id?'move':'copy';clearDrop();const type=drag.type||findBlock(current(),drag.id)?.block.type;slot.classList.add(accepts(slot.dataset.slotKind,type)?'drop-hover':'drop-invalid');}
  function drop(event){if(!drag)return;const slot=event.target.closest('[data-slot-kind]');if(!slot)return;event.preventDefault();clearDrop();const payload=drag;drag=null;const parentId=slot.dataset.slotParent,name=slot.dataset.slotName,index=slot.dataset.slotIndex===undefined?undefined:Number(slot.dataset.slotIndex);
    if(!accepts(slot.dataset.slotKind,payload.type||findBlock(current(),payload.id)?.block.type)){notify('이 위치에는 해당 종류의 블록을 연결할 수 없습니다.',true);return;}
    selectSlot(parentId,name);if(payload.type)addAt(payload.type,parentId,name,index);else edit(p=>moveBlock(p,payload.id,parentId,name,index));
  }
  document.addEventListener('click',click);document.addEventListener('input',input);panel.addEventListener('change',change);panel.addEventListener('dragstart',dragStart);panel.addEventListener('dragover',dragOver);panel.addEventListener('drop',drop);panel.addEventListener('dragend',()=>{drag=null;clearDrop();});
  return {render:()=>updatingFields?refreshInline():render(),updatingFields:()=>updatingFields,library,choose,add,current,close:()=>panel.hidden=true};
}
