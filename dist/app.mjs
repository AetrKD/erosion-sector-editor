import {CELL,FACES,KINDS,uid,clone,tileOf,dimensions,bounds,placementError,portError,connections,validate,demoProject,emptyProject,worldPoint,validateProjectDraft} from './core.mjs';
import {inspectStructure,restoreProject,loadTileFolder} from './nbt.mjs';
import {packStage,unpackStage} from './stage-file.mjs';
import {createMap} from './map.mjs';
import {PALETTE_MIME} from './palette-placement.mjs';
import {nextAreaCode,areaTree,areaLabel,placementLabel} from './hierarchy.mjs';
import {createLogicEditor} from './logic-editor.mjs';
import {createMissionEditor,gimmickSettings,gimmickDefaults,GIMMICK_DESCRIPTIONS} from './mission-editor.mjs';
import {createTilePreview} from './tile-preview.mjs';
import {relatedPrograms,updateScanStep,duplicatePlacement,scanCandidates} from './authoring.mjs';
import {isScan,scanSteps} from './scan.mjs';
import {createSimulationPanel} from './simulation-panel.mjs';
import {workflowSteps,workflowMarkup} from './workflow.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let project=emptyProject(),tileFolderFiles=null,recoveredProject=null;
const ui={floor:0,tab:'tiles',mode:'select',view:'plan',workspace:'map',selection:null,brush:null,activeRoomId:'r1',ghost:true,search:'',areaSearch:''};
const closedAreas=new Set();let draggedArea=null;
let undo=[],redo=[],saveTimer,toastTimer,pendingAssetTileId=null,modalSubmit=null,dbPromise=null,saveSequence=0;
const floorName=f=>f>=0?`${f+1}층`:`지하 ${Math.abs(f)}층`;
const directionName={north:'북쪽',east:'동쪽',south:'남쪽',west:'서쪽'};
const map=createMap($('map'),()=>({...ui,project}),{
  select:selection=>{ui.selection=selection;const p=selection?.kind==='placement'&&project.placements.find(p=>p.id===selection.id);if(p){ui.activeRoomId=p.roomId;closedAreas.delete(p.roomId);}if(ui.tab==='rooms')renderLibrary();renderInspector();map.draw();},
  place:placeTile,move:moveTile,gimmick:placeGimmick,notify:toast,
  drop:item=>{ui.mode='select';ui.brush=null;paletteWorkspaceChanged=false;const ok=item.brush.kind==='tile'?placeTile(item.placement.x,item.placement.y,item.placement.z,item.brush):placeGimmick(item.placement,item.position,item.brush.id);if(!ok)renderAll();},
  dropPreview:state=>{const el=$('paletteDropStatus');el.hidden=!state;if(state){el.textContent=state.message;el.classList.toggle('invalid',!state.valid);}},
  scan:(id,index,patch)=>commit(p=>updateScanStep(p.gimmicks.find(g=>g.id===id),index,patch)),
  cancel:()=>{ui.mode='select';ui.brush=null;renderAll();},
  zoom:value=>$('zoomLabel').textContent=value+'%',
  cursor:(x,y,z)=>$('cursorStatus').textContent=`X ${Math.round(x*16)} · Z ${Math.round(z*16)} · 높이 ${y*8}`,
  camera:({azimuth,elevation,accelerated})=>{
    $('cameraAngle').textContent=`${Math.round(azimuth)}° · 높이 ${Math.round(elevation)}°`;
    $('map').dataset.renderer=accelerated?'depth':'fallback';
    $('cameraFallback').hidden=accelerated;
    const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
    $('northArrow').style.transform=`rotate(${Math.atan2(Math.sin(a),Math.cos(a)*Math.sin(e))*180/Math.PI}deg)`;
  }
});
const logicEditor=createLogicEditor({panel:$('logicPanel'),getProject:()=>project,commit,notify:toast,
  onSelect:()=>{ui.workspace='events';ui.tab='events';ui.selection=null;if(innerWidth<620)$('libraryPanel').classList.remove('visible');},onRender:renderAll,
  onLocate:(kind,id)=>{ui.returnProgram=logicEditor.current()?.id;selectTarget(kind,id);},onSimulate:()=>simulation.open(),
  showPreview:(name,text)=>modal(name+' · 흐름 보기',`<pre class="logic-preview">${esc(text)}</pre><div class="note subtle">조건 분기와 실행 순서를 보여줍니다. 게임의 동작을 실행하지 않습니다.</div>`,null)});
const missionEditor=createMissionEditor({getProject:()=>project,commit,modal,field,selectField,esc,uid});
const tilePreview=createTilePreview({panel:$('tilePreviewPanel'),notify:toast});
const simulation=createSimulationPanel({getProject:()=>project,modal,body:$('dialogBody'),navigate:(kind,id)=>{$('dialog').close();selectTarget(kind,id);}});

tilePreview.openButton.onclick=()=>$('previewNbtInput').click();
function showPreview(){ui.workspace='preview';renderAll();}
async function previewTile(){const tile=project.tiles.find(t=>t.id===ui.selection?.id);showPreview();if(!tile?.asset?.bytes){toast('원본이 연결되지 않았습니다. 타일 폴더를 연결하거나 설계도 하나를 여세요.');return;}tilePreview.open(Uint8Array.from(atob(tile.asset.bytes),c=>c.charCodeAt(0)),tile.name);}
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').className='toast show'+(error?' error':'');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4200);
  if(error&&$('dialog').open){let note=$('dialogBody').querySelector('[data-dialog-error]');if(!note){note=document.createElement('div');note.dataset.dialogError='';note.className='note warning';note.setAttribute('role','alert');$('dialogBody').append(note);}note.textContent=message;}
}
function openDatabase(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error('자동 저장을 사용할 수 없습니다.'));
    const request=indexedDB.open('erosion-sector-editor',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  return dbPromise;
}
async function writeAutoSave(){
  // Revisions are immutable; IndexedDB snapshots the value in put(), without a second manual copy.
  const sequence=++saveSequence,value=project;
  try{const db=await openDatabase();await new Promise((resolve,reject)=>{const transaction=db.transaction('projects','readwrite');transaction.objectStore('projects').put(value,'current');transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
    if(sequence===saveSequence){$('saveStatus').textContent='자동 저장됨';$('saveStatus').className='save-status saved';}
  }catch{if(sequence===saveSequence){$('saveStatus').textContent='파일로 저장해 주세요';$('saveStatus').className='save-status';toast('브라우저 자동 저장에 실패했습니다. 스테이지 저장으로 파일을 백업하세요.',true);}}
}
function scheduleSave(){clearTimeout(saveTimer);$('saveStatus').textContent='저장 중…';$('saveStatus').className='save-status';saveTimer=setTimeout(writeAutoSave,350);}
function commit(change,message){
  const next=clone(project);
  let checked;try{change(next);checked=validateProjectDraft(next);}catch(error){toast(error.message,true);return false;}
  // Keep the immutable previous revision; only the owned draft above needs a deep copy.
  undo.push(project);if(undo.length>25)undo.shift();redo=[];project=checked;renderAll();scheduleSave();if(message)toast(message);return true;
}
async function setProject(value,message){
  let next,linkError='';try{next=await restoreProject(value);}catch(error){toast(error.message,true);return;}
  if(tileFolderFiles&&next.tiles.some(t=>t.asset&&!t.asset.bytes)){
    try{next=(await loadTileFolder(next,tileFolderFiles)).project;}catch(error){linkError=error.message;}
  }
  project=next;undo=[];redo=[];ui.selection=null;ui.returnProgram=null;ui.brush=null;ui.mode='select';ui.workspace='map';ui.tab='tiles';ui.floor=0;ui.activeRoomId=project.rooms[0]?.id||'';renderAll();scheduleSave();requestAnimationFrame(()=>map.fit());
  if(message||linkError)toast([message,linkError&&('타일 원본 연결 실패: '+linkError)].filter(Boolean).join(' '),!!linkError);
}
function download(value,filename){const blob=new Blob([value],{type:'application/zip'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
const safeName=name=>(name||'stage').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,80);
function field(label,name,value,type='text',extra=''){return `<label class="field">${esc(label)}<input type="${type}" name="${esc(name)}" value="${esc(value)}" ${extra}></label>`;}
function selectField(label,name,value,items,extra=''){return `<label class="field">${esc(label)}<select name="${name}" aria-label="${esc(label)}" ${extra}>${items.map(([id,title])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;}
function propField(label,name,value,type='text',extra=''){return field(label,name,value,type,`data-property="${esc(name)}" ${extra}`);}
function propSelect(label,name,value,items){return selectField(label,name,value,items,`data-property="${esc(name)}"`);}
function modal(title,body,submit,label='저장'){modalSubmit=submit;$('dialogTitle').textContent=title;$('dialogBody').innerHTML=body;$('dialogActions').innerHTML=`<button type="button" class="button" data-action="close-dialog">닫기</button>${submit?`<button type="submit" class="button primary">${esc(label)}</button>`:''}`;$('dialog').showModal();}
function confirmChange(title,message,callback){modal(title,`<p>${esc(message)}</p><div class="note subtle">현재 작업은 브라우저에 저장됩니다. 파일 백업이 필요하면 먼저 스테이지 저장을 이용하세요.</div>`,()=>{callback();return true;},'계속');}
$('dialogForm').addEventListener('submit',event=>{event.preventDefault();if(modalSubmit){try{if(modalSubmit(new FormData(event.currentTarget))!==false)$('dialog').close();}catch(error){toast(error.message,true);}}});
function tileThumbnail(tile){const multi=tile.size.y>8,w=tile.size.x>16?64:42,d=tile.size.z>16?30:20;
  return `<svg viewBox="0 0 120 68" aria-hidden="true"><g transform="translate(60 23)"><path d="M0 ${-d/2} L${w/2} 0 L0 ${d/2} L${-w/2} 0Z" fill="#879c92" stroke="#bbccbc" stroke-width=".7"/><path d="M${-w/2} 0 L0 ${d/2} L0 ${d/2+18} L${-w/2} 18Z" fill="#3c5559" stroke="#8aa19b" stroke-width=".6"/><path d="M0 ${d/2} L${w/2} 0 L${w/2} 18 L0 ${d/2+18}Z" fill="#526b6a" stroke="#9db4a7" stroke-width=".6"/>${multi?`<path d="M${-w/2} 9 L0 ${d/2+9} L${w/2} 9" fill="none" stroke="#c9d6b8" stroke-width="1"/>`:''}<path d="M${w/4} ${d/4+5} v10 l6 -3 v-10Z" fill="#16232b" stroke="#bcd5b7" stroke-width=".8"/></g></svg>`;}
function gimmickCards(){
  const groups=[['진입과 탈출',['spawn','extraction']],['스캔과 이벤트',['scan','trigger','alarm','wave']],['보급과 목표',['supply','cargo','keycard']],['적 배치',['sleeper']]];
  return groups.map(([name,types])=>`<h3 class="gimmick-group-title">${name}</h3>${types.map(type=>{const kind=KINDS[type];return `<button class="gimmick-card ${ui.brush?.kind==='gimmick'&&ui.brush.id===type?'selected':''}" draggable="true" title="지도로 끌어 배치하거나 클릭해서 선택" data-gimmick-type="${type}"><span class="gimmick-icon" style="color:${kind.color}">${kind.icon}</span><div><strong>${kind.label}</strong><small>${GIMMICK_DESCRIPTIONS[type]}</small></div></button>`;}).join('')}`).join('');
}
function renderLibrary(){
  document.querySelectorAll('[data-tab]').forEach(button=>{button.setAttribute('aria-selected',String(button.dataset.tab===ui.tab));button.tabIndex=button.dataset.tab===ui.tab?0:-1;});
  if(ui.tab==='tiles'){
    $('libraryContent').innerHTML=`<button class="button full" data-action="import-nbt">↑ Create 설계도 가져오기</button><div style="height:12px"></div><input class="search" id="tileSearch" placeholder="타일 이름 검색…" aria-label="타일 이름 검색" value="${esc(ui.search)}"><div class="section-label"><span>타일 라이브러리</span><span>${project.tiles.length}</span></div><div id="tileList"></div><button class="subtle-button" data-action="new-tile">＋ 설계용 타일 만들기</button>`;
    renderTileList();
  }else if(ui.tab==='gimmicks'){
    $('libraryContent').innerHTML=`<div class="section-label"><span>기믹 배치</span><span>${project.gimmicks.length}</span></div><small>기믹을 타일 안으로 끌어 놓거나, 고른 뒤 배치도를 클릭하세요.</small><div style="height:14px"></div>${gimmickCards()}<div class="divider"></div><div class="section-label">배치된 기믹</div>${project.gimmicks.map(g=>`<button class="room-card ${ui.selection?.id===g.id?'selected':''}" data-select-kind="gimmick" data-select-id="${esc(g.id)}"><span style="color:${KINDS[g.type].color}">${KINDS[g.type].icon}</span><div><strong>${esc(g.name)}</strong><small>${esc(KINDS[g.type].label)}</small></div></button>`).join('')}`;
  }else if(ui.tab==='events'){
    $('libraryContent').innerHTML=logicEditor.library();
  }else{
    $('libraryContent').innerHTML=`<div class="action-row"><button class="button" data-action="new-room">＋ 구역</button><button class="button" data-action="new-zone">＋ 시설 묶음</button></div><input class="search" id="areaSearch" aria-label="구역과 배치 타일 검색" placeholder="구역·타일 검색…" value="${esc(ui.areaSearch)}"><small>구역 선택 후 타일을 배치하세요. 타일을 다른 구역으로 끌어 옮길 수도 있습니다.</small><div id="areaTree" class="area-tree" aria-label="구역과 배치 타일 목록"></div>`;
    renderAreaTree();
    $('libraryContent').insertAdjacentHTML('beforeend',`<details class="facility-settings"><summary>시설 묶음 설정</summary>${project.zones.map(z=>`<button class="room-card" data-select-kind="zone" data-select-id="${esc(z.id)}"><i class="room-swatch" style="background:${z.color}"></i><span>${esc(z.name)}</span></button>`).join('')}</details>`);
  }
}
function renderAreaTree(){
  const target=$('areaTree');if(!target)return;const query=ui.areaSearch.toLowerCase();
  const leaf=p=>`<div class="tree-leaf ${ui.selection?.kind==='placement'&&ui.selection.id===p.id?'selected':''}"><button draggable="true" data-tree-placement="${esc(p.id)}" data-select-kind="placement" data-select-id="${esc(p.id)}"><span aria-hidden="true">▧</span><span><strong>${esc(p.areaCode)}구역 <em>(${esc(p.tileName)})</em></strong><small>${p.name?esc(p.name)+' · ':''}${floorName(p.y)} · X ${p.x*16}, Z ${p.z*16}</small></span></button>${p.gimmicks.map(g=>`<button class="tree-gimmick" data-select-kind="gimmick" data-select-id="${esc(g.id)}"><span style="color:${KINDS[g.type].color}">${KINDS[g.type].icon}</span> ${esc(g.name)}</button>`).join('')}</div>`;
  target.innerHTML=areaTree(project).map(room=>{
    const matches=(room.code+' '+room.name).toLowerCase().includes(query),children=room.children.filter(p=>matches||(p.areaCode+' '+p.name+' '+p.tileName+' '+p.gimmicks.map(g=>g.name).join(' ')).toLowerCase().includes(query));
    if(query&&!matches&&!children.length)return '';
    return `<details class="area-folder ${ui.activeRoomId===room.id?'active-area':''}" data-folder="${esc(room.id)}" ${!closedAreas.has(room.id)||query?'open':''}><summary><button class="tree-folder-select" data-room="${esc(room.id)}"><span class="folder-symbol" style="color:${room.color}">▰</span><span><strong>${esc(areaLabel(room))}</strong><small>${esc(room.name)} · ${room.children.length}개 타일</small></span></button><button class="icon-button" data-select-kind="room" data-select-id="${esc(room.id)}" aria-label="${esc(areaLabel(room))} 속성">⋯</button></summary><div class="tree-children">${children.map(leaf).join('')||'<small class="tree-empty">이 구역에 타일을 배치하세요.</small>'}</div></details>`;
  }).join('')||(project.tiles.length?'<div class="empty-state">검색 결과가 없습니다.</div>':'<div class="empty-state">등록된 타일이 없습니다.<br>폴더를 연결하거나 아래에서 설계용 타일을 만드세요.</div>');
  const orphan=project.placements.filter(p=>!project.rooms.some(r=>r.id===p.roomId));
  if(orphan.length)target.insertAdjacentHTML('beforeend',`<div class="note warning">구역 미지정</div>${orphan.map(p=>leaf({...p,tileName:tileOf(project,p)?.name||'없는 타일',gimmicks:project.gimmicks.filter(g=>g.placementId===p.id)})).join('')}`);
}
function renderTileList(){
  if(!$('tileList'))return;
  const tiles=project.tiles.filter(t=>(t.name+' '+t.category).toLowerCase().includes(ui.search.toLowerCase()));
  const groups=new Map();for(const tile of tiles){const folder=tile.asset?.reference?.split('/').slice(0,-1).join('/')||'설계용 · 미연결';if(!groups.has(folder))groups.set(folder,[]);groups.get(folder).push(tile);}
  const card=tile=>`<button class="tile-card ${ui.brush?.id===tile.id?'selected':''}" draggable="true" title="지도로 끌어 배치하거나 클릭해서 선택" data-library-tile="${esc(tile.id)}"><div class="tile-preview"><span class="tile-kind">${esc(tile.category)}</span><span class="tile-status ${tile.asset?'real':''}">${tile.asset?(tile.asset.bytes?'원본 연결됨':'원본 미연결'):'설계용'}</span>${tileThumbnail(tile)}</div><div class="tile-info"><div><strong>${esc(tile.name)}</strong><small>${tile.size.x} × ${tile.size.z} × 높이 ${tile.size.y} · 문 ${tile.ports.length}</small></div><span class="tile-dots">↗</span></div></button>`;
  $('tileList').innerHTML=[...groups].map(([folder,items])=>`<details class="tileset-folder" open><summary>▰ ${esc(folder)} <span>${items.length}</span></summary>${items.map(card).join('')}</details>`).join('')||'<div class="empty-state">검색 결과가 없습니다.</div>';
}
function renderFloors(){
  const floors=new Set([ui.floor,0]);for(const p of project.placements){const t=tileOf(project,p);if(t)for(let f=p.y;f<p.y+t.size.y/8;f++)floors.add(f);}
  let values=[...floors].sort((a,b)=>a-b);if(values.length>7)values=values.filter(f=>Math.abs(f-ui.floor)<=3);
  $('floorTabs').innerHTML=values.map(f=>`<button data-floor="${f}" class="${f===ui.floor?'active':''}" title="블록 높이 ${f*8}~${f*8+7}">${floorName(f)}</button>`).join('');
  $('viewLabel').textContent=ui.view==='plan'?`${floorName(ui.floor)} · 높이 ${ui.floor*8}~${ui.floor*8+7} · 타일 배치도`:'전체 층 · 타일 입체 배치도';
  $('mapInstructions').textContent=ui.view==='iso'?'드래그로 시점 회전 · 클릭해서 선택 · 휠 확대 · Space+드래그 이동':ui.mode==='paint'?'클릭해서 타일 배치 · R 회전 · Esc 선택 모드':ui.mode==='gimmick'?'타일 내부를 클릭해서 기믹 배치 · Esc 취소':'타일·스캔 중심 드래그 이동 · 스캔 손잡이로 반경 조절 · Space로 화면 이동';
  $('isoControls').hidden=ui.view!=='iso';$('map').dataset.view=ui.view;
  if(ui.view!=='iso'){$('northArrow').style.transform='';$('cameraFallback').hidden=true;}
}
function renderAll(){
  $('projectName').textContent=project.name;$('missionBadge').textContent=project.missionCode||'ES';$('chapterCaption').textContent=project.chapter.name||'공간을 연결하고, 임무를 설계하세요.';$('projectSummary').innerHTML=`<span>타일<b>${project.placements.length}</b></span><span>구역<b>${project.rooms.length}</b></span><span>기믹<b>${project.gimmicks.length}</b></span>`;
  document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===ui.mode));
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',ui.workspace==='map'&&button.dataset.view===ui.view));
  document.querySelector('[data-action=undo]').disabled=!undo.length;document.querySelector('[data-action=redo]').disabled=!redo.length;
  const issues=validate(project),errors=issues.filter(i=>i.severity==='error').length,warnings=issues.filter(i=>i.severity==='warning').length;
  $('validationSummary').textContent=errors?`⊗ 수정 필요 ${errors} · 주의 ${warnings}`:warnings?`△ 설계도 연결 등 확인 ${warnings}`:'✓ 배치 검사 통과';
  $('validationSummary').className='validation-summary '+(errors?'error':warnings?'':'good');
  renderWorkflow(issues);
  renderLibrary();renderFloors();renderInspector();if(ui.workspace==='events')logicEditor.render();else logicEditor.close();$('canvasWrap').hidden=ui.workspace!=='map';document.querySelector('.floor-bar').hidden=ui.workspace!=='map';$('tilePreviewPanel').hidden=ui.workspace!=='preview';tilePreview.draw();map.draw();
}
function renderWorkflow(issues=validate(project)){
  const steps=workflowSteps(project,issues),done=steps.filter(s=>s.done).length,next=steps.find(s=>!s.done);
  $('workflowCount').textContent=`${done}/${steps.length}`;$('workflowNext').textContent=next?'다음: '+next.title:'제작 체크리스트';
  document.querySelectorAll('button[data-workspace],button[data-workspace-tab]').forEach(button=>{if((button.dataset.workspace||button.dataset.workspaceTab)===ui.workspace)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  document.querySelector('.editor').dataset.workspace=ui.workspace;
  const context=$('workspaceContext');context.hidden=ui.workspace==='map';context.innerHTML=(ui.workspace==='preview'?'개별 NBT 설계도의 모양을 확인합니다. 배치 지도에서는 크기와 문 위치를 사용합니다.':'조건이 충족됐을 때 실행할 동작을 블록으로 연결하세요.')+'<button data-workspace="map">배치 지도로 돌아가기</button>';
  const placing=ui.workspace==='map'&&ui.brush&&['paint','gimmick'].includes(ui.mode);$('placementBanner').hidden=!placing;
  if(placing){const name=ui.brush.kind==='tile'?project.tiles.find(t=>t.id===ui.brush.id)?.name:KINDS[ui.brush.id]?.label;$('placementHint').textContent=ui.brush.kind==='tile'?`${name||'타일'} · ${ui.brush.rotation||0}° — 지도에 클릭해서 배치 · R 회전`:`${name||'기믹'} — 배치된 타일 안을 클릭하세요`;}
  $('emptyMap').hidden=ui.workspace!=='map'||project.placements.length>0||!!placing;
  $('emptyMapHint').textContent=project.tiles.length?'왼쪽 라이브러리의 타일을 지도로 끌어 놓으세요. 타일을 고른 뒤 격자를 클릭해도 됩니다.':'Create에서 만든 assets/tile 폴더를 연결하거나, 설계용 타일부터 만들어 시작하세요.';
}
function workflowDialog(){modal('스테이지 제작 체크리스트',`<p class="workflow-note">현재 작업을 기준으로 남은 단계를 표시합니다. 항목을 누르면 해당 작업으로 이동합니다.</p>${workflowMarkup(workflowSteps(project,validate(project)),esc)}<div class="workflow-note">알람·조명·문 연동은 <b>이벤트 편집</b>에서 구성하고 <b>모의 실행</b>으로 확인하세요.<br>자동 저장은 이 브라우저의 복원본입니다. <b>스테이지 저장</b>으로 받은 <code>.esfile</code>을 작업 폴더의 <code>stage/</code>에 보관하세요. 타일 원본은 <code>assets/tile/타일셋/타일.nbt</code>에 따로 둡니다.</div>`,null);}
function guideTo(id){
  $('dialog').close();ui.workspace='map';ui.mode='select';ui.brush=null;
  ui.tab=id==='gimmicks'?'gimmicks':'tiles';renderAll();
  if(id==='mission'){actions.mission();return;}if(id==='validation'){validationDialog();return;}
  if(id==='tiles')actions['tile-folder']();else if(id==='draft')actions['new-tile']();else if(innerWidth<620)$('libraryPanel').classList.add('visible');
}
function renderInspector(){
  const sel=ui.selection,container=$('inspectorContent');
  $('inspectorLabel').textContent=sel?sel.kind.toUpperCase():'STAGE';
  if(sel?.kind==='placement'){
    const p=project.placements.find(p=>p.id===sel.id),t=p&&tileOf(project,p);if(!t){ui.selection=null;return renderInspector();}
    const d=dimensions(t,p.rotation),room=project.rooms.find(r=>r.id===p.roomId),net=connections(project);
    container.innerHTML=`<div class="inspect-kicker">TILE INSTANCE</div><h3 class="inspect-title">${esc(p.name||t.name)}</h3><p class="inspect-description">${esc(room?.code||'방 미지정')} · ${d.x} × ${d.z}블록 · 높이 ${d.y/8}층</p>${propField('하위 구역 이름','areaCode',p.areaCode,'text','required maxlength="40"')}${propField('배치 이름','name',p.name,'text','maxlength="80" placeholder="타일 이름 사용"')}<div class="field-row triple">${propField('X','x',p.x*16,'number','step="1" min="-16384" max="16384"')}${propField('층 높이','y',p.y,'number','step="1" min="-1024" max="1024"')}${propField('Z','z',p.z*16,'number','step="1" min="-16384" max="16384"')}</div>${propSelect('회전','rotation',p.rotation,[0,90,180,270].map(n=>[n,n+'°']))}${propSelect('소속 구역','roomId',p.roomId,project.rooms.map(r=>[r.id,r.code+' · '+r.name]))}<div class="action-row"><button class="button" data-action="rotate">↻ 회전</button><button class="button" data-action="duplicate">복제</button><button class="button danger" data-action="delete">삭제</button></div><button class="button full" data-action="duplicate-bundle">기믹·이벤트 포함 복제</button><div class="divider"></div><div class="section-title"><span>문 연결</span><span class="badge">${t.ports.length}개</span></div>${t.ports.map(port=>`<div class="port-row"><span class="port-dot" style="background:${net.connected.has(p.id+':'+port.id)?'#b8dcae':'#d5a06b'}"></span><div><strong>${esc(port.name)}</strong><small>${directionName[port.facing]} · ${floorName(p.y+Math.floor(port.y/8))} · ${net.connected.has(p.id+':'+port.id)?'연결됨':port.required?'연결 필수':'미연결 허용'}</small></div></div>`).join('')||'<small>원본 타일에서 연결구를 설정하세요.</small>'}<button class="subtle-button" data-select-kind="library" data-select-id="${esc(t.id)}">타일 원본과 연결구 편집 →</button><div class="note subtle">이 타일은 ${floorName(p.y)}${d.y>8?'~'+floorName(p.y+d.y/8-1):''}을 점유합니다. 이동·회전·삭제는 모든 층에 함께 적용됩니다.</div>`;
  }else if(sel?.kind==='door'){
    const port=connections(project).ports.find(p=>p.key===sel.id);if(!port){ui.selection=null;return renderInspector();}
    const p=project.placements.find(p=>p.id===port.placementId),pair=connections(project).pairs.find(pair=>pair.a.key===sel.id||pair.b.key===sel.id),other=pair&&(pair.a.key===sel.id?pair.b:pair.a);
    container.innerHTML=`<div class="inspect-kicker">DOOR · 이쪽 면</div><h3 class="inspect-title">${esc(port.name)}</h3><p>${esc(placementLabel(project,p))}</p><div class="note subtle">잠금 조건과 이벤트는 이쪽 면을 기준으로 확인합니다. 반대편 문은 별도 대상으로 설정할 수 있습니다.</div><button class="button full" data-select-kind="placement" data-select-id="${esc(p.id)}">소속 타일 보기</button>${other?`<button class="button full" data-select-kind="door" data-select-id="${esc(other.key)}">반대편 문 보기</button>`:''}`;
  }else if(sel?.kind==='library'){
    const t=project.tiles.find(t=>t.id===sel.id);if(!t){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">TILE SOURCE</div><h3 class="inspect-title">${esc(t.name)}</h3><p class="inspect-description">X ${t.size.x} × Z ${t.size.z} × 높이 ${t.size.y}블록</p>${propField('타일 이름','name',t.name,'text','required maxlength="80"')}${propField('분류','category',t.category,'text','maxlength="40"')}<button class="button full" data-action="preview-tile">설계도 미리보기</button><button class="button full" data-action="coordinates" style="margin-top:8px">좌표로 배치</button><div class="divider"></div><div class="section-title"><span>Create 설계도</span><span class="badge">${t.asset?(t.asset.bytes?'연결됨':'원본 미연결'):'설계용'}</span></div><button class="button full" data-action="attach-asset">${t.asset?'설계도 교체':'설계도 파일 연결'} ↑</button>${t.asset?`${propField('타일 경로 · assets/tile 폴더 기준','asset.reference',t.asset.reference||'','text','maxlength="512" placeholder="연구소/복도.nbt"')}<div class="asset-stats" style="margin-top:10px">${esc(t.asset.reference||t.asset.name)}${!t.asset.bytes?'<br><strong>원본 미연결 · 타일 폴더를 연결하세요</strong>':''}<br>점유 블록 ${(t.asset.occupancy?.count??t.asset.blockCount).toLocaleString()} · 재질 ${t.asset.paletteCount} · 문 마커 ${t.asset.markerCount}<br>포함 네임스페이스: ${esc(t.asset.namespaces.join(', '))}<br><code>SHA-256 ${esc(t.asset.sha256.slice(0,16))}…</code></div>`:'<div class="note warning">배치 설계용 타일입니다. 실제 건축물을 사용하려면 같은 크기의 .nbt 설계도를 연결하세요.</div>'}<div class="divider"></div><div class="section-title"><span>문 연결구</span><button class="subtle-button" data-action="add-port">＋ 추가</button></div>${t.ports.map(port=>`<div class="port-row"><div><strong>${esc(port.name)}</strong><small>${directionName[port.facing]} · 높이 ${port.y} · ${port.width}×${port.height} · ${port.required?'필수':'선택'}</small></div><button class="icon-button" data-edit-port="${esc(port.id)}" aria-label="${esc(port.name)} 편집">⋯</button></div>`).join('')||'<small>문 연결구가 없습니다. 추가하거나 마커가 포함된 설계도를 가져오세요.</small>'}<div class="note subtle">연결구 설정은 이 타일 쪽의 접근 조건입니다. 반대편과 알람·터미널 조건이 달라도 연결할 수 있습니다. 최소 문 하나를 유지하세요.</div><button class="subtle-button" data-action="delete-library">사용하지 않는 원본 삭제</button>`;
  }else if(sel?.kind==='gimmick'){
    const g=project.gimmicks.find(g=>g.id===sel.id);if(!g){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">GIMMICK · ${esc(KINDS[g.type].label)}</div><h3 class="inspect-title">${esc(g.name)}</h3>${propField('표시 이름','name',g.name,'text','required maxlength="80"')}${propSelect('소속 타일','placementId',g.placementId,project.placements.map(p=>[p.id,(project.rooms.find(r=>r.id===p.roomId)?.code||'미지정')+' · '+(p.name||tileOf(project,p)?.name||'타일')]))}<div class="section-title">타일 내부 좌표 · 블록 단위</div><div class="field-row triple">${['x','y','z'].map(k=>propField(k.toUpperCase(),'position.'+k,g.position[k],'number','step="0.5" min="0" max="255"')).join('')}</div>${gimmickSettings(g,project,{field:propField,select:propSelect,esc})}<div class="divider"></div><button class="button primary full" data-action="events">블록 이벤트 편집</button><div class="section-title"><span>간단 이벤트 연결</span><button class="subtle-button" data-action="add-link">＋ 추가</button></div>${project.links.filter(l=>l.from===g.id).map(l=>`<div class="link-row"><div><strong>→ ${esc(project.gimmicks.find(q=>q.id===l.to)?.name||'없는 대상')}</strong><small>${esc(l.event)} → ${esc(l.action)}</small></div><button class="icon-button" data-delete-link="${esc(l.id)}" aria-label="연결 삭제">×</button></div>`).join('')||'<small>이 기믹에서 발생하는 이벤트를 다른 기믹에 연결할 수 있습니다.</small>'}<div class="divider"></div><button class="button danger full" data-action="delete">기믹 삭제</button><div class="note subtle">모드 0.5.0 이상에서 스캔을 실행합니다. 진입은 즉시 지정 좌표로 투하하며, 스캔은 블록 없이 바닥에 표시합니다.</div>`;
  }else if(sel?.kind==='room'){
    const r=project.rooms.find(r=>r.id===sel.id);if(!r){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">ROOM</div><h3 class="inspect-title">${esc(r.code)} · ${esc(r.name)}</h3>${propField('표시 번호','code',r.code,'text','required maxlength="40"')}${propField('구역 이름','name',r.name,'text','required maxlength="80"')}${propSelect('시설 묶음','zoneId',r.zoneId,project.zones.map(z=>[z.id,z.name]))}${propField('지도 색상','color',r.color,'color')}<div class="asset-stats">고유 ID: <code>${esc(r.id)}</code><br>이 ID는 표시 번호를 바꿔도 유지됩니다.</div><div class="divider"></div><div class="section-title">소속 타일</div>${project.placements.filter(p=>p.roomId===r.id).map(p=>`<button class="room-card" data-select-kind="placement" data-select-id="${esc(p.id)}"><div><strong>${esc(p.name||tileOf(project,p)?.name)}</strong><small>X ${p.x} · Z ${p.z} · ${floorName(p.y)}</small></div></button>`).join('')||'<small>새 타일을 배치하거나 타일 속성에서 이 방을 지정하세요.</small>'}`;
  }else if(sel?.kind==='zone'){
    const z=project.zones.find(z=>z.id===sel.id);if(!z){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">ZONE</div><h3 class="inspect-title">${esc(z.name)}</h3>${propField('구역 이름','name',z.name,'text','required maxlength="80"')}${propField('구역 색상','color',z.color,'color')}<div class="note subtle">방은 소속 구역으로 묶입니다. 방의 세부 색상은 방 속성에서 설정합니다.</div>`;
  }else{
    const network=connections(project);container.innerHTML=`<div class="inspect-kicker">STAGE OVERVIEW</div><h3 class="inspect-title">${esc(project.name)}</h3><p class="inspect-description">${esc(project.description||'스테이지 설정에서 임무 설명을 입력하세요.')}</p><dl class="stage-metadata"><div><dt>작성자</dt><dd>${esc(project.author||'미지정')}</dd></div><div><dt>챕터명</dt><dd>${esc(project.chapter.name||'미지정')}</dd></div><div><dt>난이도</dt><dd>${esc(project.difficulty||'미지정')}</dd></div></dl><div class="metric-grid"><div class="metric"><small>배치된 타일</small><b>${project.placements.length}<span style="font-size:10px;color:#8298a5"> 개</span></b></div><div class="metric"><small>연결된 문</small><b>${network.pairs.length}<span style="font-size:10px;color:#8298a5"> 쌍</span></b></div></div><button class="button full" data-action="project">스테이지 설정</button><button class="button primary full" data-action="mission" style="margin-top:8px">임무 목표와 탈출 · ${project.objectives.length}개</button><button class="button full" data-action="events" style="margin-top:8px">블록 이벤트 편집 · ${project.programs.length}개</button><div class="divider"></div><div class="section-title">임무 흐름</div>${project.gimmicks.filter(g=>['spawn','alarm','scan','extraction'].includes(g.type)).map((g,i)=>`<button class="room-card" data-select-kind="gimmick" data-select-id="${esc(g.id)}"><span class="flow-number">${i+1}</span><div><strong>${esc(g.name)}</strong><small>${esc(KINDS[g.type].label)}</small></div></button>`).join('')||'<small>기믹 탭에서 시작점과 목표를 추가하세요.</small>'}<div class="divider"></div><div class="section-title">작업 순서</div><div class="flow-item"><span class="flow-number">1</span><div><strong>타일 배치</strong><small>라이브러리에서 고른 후 격자를 클릭</small></div></div><div class="flow-item"><span class="flow-number">2</span><div><strong>층과 문 연결 확인</strong><small>높이가 같은 연결구끼리 자동 판정</small></div></div><div class="flow-item"><span class="flow-number">3</span><div><strong>기믹과 임무 흐름 지정</strong><small>장치를 놓고 이벤트 연결</small></div></div><div class="note warning">${project.tiles.some(t=>!t.asset?.bytes)?"원본이 연결되지 않은 타일이 있습니다. 게임에서 실행하기 전에 타일 폴더를 연결하고 검사 결과를 확인하세요.":"스테이지 저장으로 .esfile 파일을 내려받으세요. 자동 저장은 이 브라우저의 복원본입니다."}</div>`;
  }
  if(sel&&['placement','door','gimmick','room'].includes(sel.kind)){
    const refs=relatedPrograms(project,sel);
    container.insertAdjacentHTML('beforeend',`<div class="divider"></div><div class="section-title">연결된 블록 이벤트 · ${refs.length}개</div>${refs.map(({program,refs})=>`<button class="room-card" data-related-program="${esc(program.id)}" data-related-node="${esc(refs[0].blockId)}"><div><strong>${esc(program.name)}</strong><small>${[...new Set(refs.map(r=>({trigger:'발생 조건',condition:'검사 조건',action:'제어 대상'}[r.role]||'참조')))].join(' · ')}${program.enabled?'':' · 사용 안 함'}</small></div><span>↗</span></button>`).join('')||'<small>이 대상을 참조하는 블록 이벤트가 없습니다.</small>'}`);
    if(sel.kind==='gimmick'){
      const g=project.gimmicks.find(g=>g.id===sel.id);
      if(isScan(g.type)){const index=Math.min(sel.step??0,scanSteps(g).length-1),step=scanSteps(g)[index],p=project.placements.find(p=>p.id===step.placementId),tile=p&&tileOf(project,p),preview=step.positionMode==='random'&&tile?scanCandidates(tile,step.position.y,step.radius??2.5,step.position):null;
        container.insertAdjacentHTML('afterbegin',`<div class="scan-map-tools"><strong>지도 편집 · ${index+1}단계</strong><p>중심 드래그로 이동 · 오른쪽 사각 손잡이로 반경 조절</p><div>${scanSteps(g).map((_,i)=>`<button class="button ${i===index?'primary':''}" data-scan-focus="${i}">${i+1}단계</button>`).join('')}</div>${preview?`<p>${preview.known?`초록: 배치 후보 ${preview.cells.filter(c=>c.valid).length}곳 · 빨강: 원이 들어가지 않는 바닥`:'설계도 원본을 연결하면 배치 후보를 표시합니다.'}<br>단순 블록 점유 기준의 예상이며 모드 블록의 정확한 충돌은 게임에서 판정합니다.</p>`:''}</div>`);
      }
    }
  }
  if(ui.returnProgram&&project.programs.some(p=>p.id===ui.returnProgram))container.insertAdjacentHTML('afterbegin','<button class="button full" data-action="return-event">← 보고 있던 이벤트로 돌아가기</button>');
}
function placeTile(x,y,z,brush=ui.brush){
  if(brush?.kind!=='tile'){toast('라이브러리에서 타일을 먼저 선택하세요.');return;}
  if(brush.sourceId){let selected;const sourceId=brush.sourceId;if(commit(p=>{selected=duplicatePlacement(p,sourceId,{x,y,z,rotation:brush.rotation||0});},'타일과 기믹·관련 이벤트를 복제했습니다. 외부 대상 참조는 유지합니다.')){ui.selection={kind:'placement',id:selected.id};ui.brush=null;ui.mode='select';renderAll();}return;}
  const p={id:uid('placement'),tileId:brush.id,x,y,z,rotation:brush.rotation||0,roomId:ui.activeRoomId||project.rooms[0]?.id||'',name:''};
  const error=placementError(project,p);if(error){toast(error,true);return;}
  ui.selection={kind:'placement',id:p.id};return commit(pj=>pj.placements.push(p));
}
function moveTile(p){const old=project.placements.find(q=>q.id===p.id);if(old&&old.roomId!==p.roomId)p={...p,areaCode:nextAreaCode(project,p.roomId,p.id)};const error=placementError(project,p);if(error){toast(error,true);return false;}return commit(pj=>{pj.placements[pj.placements.findIndex(q=>q.id===p.id)]=p;});}
function placeGimmick(placement,position,type=ui.brush?.id){
  if(!KINDS[type])return false;
  const g={id:uid('gimmick'),type,name:KINDS[type].label,placementId:placement.id,
    position:Object.fromEntries(Object.entries(position).map(([k,v])=>[k,Math.floor(v*2)/2])),settings:gimmickDefaults(type)};
  ui.selection={kind:'gimmick',id:g.id};ui.mode='select';ui.brush=null;return commit(pj=>pj.gimmicks.push(g));
}
function selectTarget(kind,id){if(kind==='objective'){missionEditor.show();return;}if(kind==='program'){logicEditor.choose(id);return;}ui.workspace='map';if(kind==='door'){const port=connections(project).ports.find(p=>p.key===id),p=port&&project.placements.find(p=>p.id===port.placementId);if(p){ui.floor=Math.floor(port.y/8);map.focus(p);}}if(kind==='room')ui.activeRoomId=id;ui.selection={kind,id};ui.mode='select';if(kind==='placement'){const p=project.placements.find(p=>p.id===id);if(p){ui.activeRoomId=p.roomId;closedAreas.delete(p.roomId);ui.floor=p.y;map.focus(p);}}else if(kind==='gimmick'){const g=project.gimmicks.find(g=>g.id===id),p=project.placements.find(p=>p.id===g?.placementId),t=p&&tileOf(project,p);if(t){ui.floor=Math.floor(worldPoint(g.position,t,p).y/8);map.focus(p);}}renderAll();if(innerWidth<950)$('inspectorPanel').classList.add('visible');}
function projectDetailsDialog(){modal('스테이지 설정',`<div class="field-row">${field('작성자','author',project.author,'text','maxlength="160" placeholder="제작자 또는 제작 팀"')}${field('스테이지 난이도','difficulty',project.difficulty,'text','maxlength="80" placeholder="예: 튜토리얼, 쉬움, 보통, 어려움"')}</div>${field('스테이지 이름','name',project.name,'text','required maxlength="80"')}<div class="field-row">${field('챕터 ID','chapterId',project.chapter.id,'text','maxlength="160"')}${field('챕터 이름','chapterName',project.chapter.name,'text','maxlength="160"')}</div><label class="field">챕터 설명<textarea name="chapterDescription" aria-label="챕터 설명" maxlength="3000">${esc(project.chapter.description)}</textarea></label>${field('미션 코드','missionCode',project.missionCode,'text','maxlength="160" placeholder="예: A1"')}<label class="field">임무 설명<textarea name="description" aria-label="임무 설명" maxlength="3000">${esc(project.description)}</textarea></label><div class="field-row">${field('최소 인원','minPlayers',project.minPlayers,'number','required min="1" max="16"')}${field('최대 인원','maxPlayers',project.maxPlayers,'number','required min="1" max="16"')}</div>`,data=>commit(p=>{p.author=data.get('author').trim();p.difficulty=data.get('difficulty').trim();p.name=data.get('name').trim();p.chapter={id:data.get('chapterId').trim(),name:data.get('chapterName').trim(),description:data.get('chapterDescription')};p.missionCode=data.get('missionCode').trim();p.description=data.get('description');p.minPlayers=Number(data.get('minPlayers'));p.maxPlayers=Number(data.get('maxPlayers'));}));}
function newTileDialog(){modal('설계용 타일 만들기',`${field('타일 이름','name','새 타일','text','required maxlength="80"')}<div class="field-row triple">${field('가로 X · 블록','x',16,'number','required min="1" max="256" step="1"')}${field('높이 Y · 블록','y',8,'number','required min="8" max="256" step="8"')}${field('깊이 Z · 블록','z',16,'number','required min="1" max="256" step="1"')}</div><div class="note subtle">가로·깊이는 자유롭게, 높이는 8의 배수로 지정합니다. 최소 문 하나가 필요하며 기본 소형 연결구를 만든 뒤 수정할 수 있습니다. 설계도 연결 전에는 저장 범위 전체로 겹침을 검사합니다.</div>`,data=>{
  const size={x:Number(data.get('x')),y:Number(data.get('y')),z:Number(data.get('z'))};
  if(Math.max(size.x,size.z)<4){toast('소형 문을 놓으려면 가로 또는 깊이가 최소 4블록이어야 합니다.',true);return false;}
  const east=size.z>=4,port={id:uid('port'),name:'기본 문',facing:east?'east':'south',x:east?size.x:size.x/2,z:east?size.z/2:size.z,y:1,width:4,height:4,required:true,doorSettings:{type:'NORMAL',access:'HOLD',hold_ticks:20}};
  const t={id:uid('tile'),name:data.get('name').trim(),category:'설계용',size,ports:[port],asset:null};
  ui.selection={kind:'library',id:t.id};ui.brush={kind:'tile',id:t.id,rotation:0};ui.mode='paint';return commit(p=>p.tiles.push(t));
},'타일 만들기');}
function portDialog(id=null){
  const t=project.tiles.find(t=>t.id===ui.selection?.id);if(!t)return;
  if(t.asset&&!id){toast('실제 문 추가는 설계도에서 작업한 뒤 파일을 다시 연결하세요.',true);return;}
  const existing=t.ports.find(p=>p.id===id),east=t.size.z>=4,p=existing||{id:uid('port'),name:'새 연결구',facing:east?'east':'south',x:east?t.size.x:t.size.x/2,y:1,z:east?t.size.z/2:t.size.z,width:4,height:4,required:true};
  modal(existing?'문 연결구 편집':'문 연결구 추가',`${field('연결구 이름','name',p.name,'text','required maxlength="80"')}${selectField('방향','facing',p.facing,FACES.map(f=>[f,directionName[f]]))}<div class="field-row triple">${field('X','x',p.x,'number','required step="0.5" min="0"')}${field('높이 Y','y',p.y,'number','required step="0.5" min="0"')}${field('Z','z',p.z,'number','required step="0.5" min="0"')}</div><div class="field-row">${field('문 폭','width',p.width,'number','required min="1" max="64" step="1"')}${field('문 높이','height',p.height,'number','required min="1" max="32" step="1"')}</div>${selectField('문 종류','doorType',p.doorSettings?.type||'NORMAL',[['NORMAL','일반 문'],['SECURITY','보안 문']])}${selectField('이쪽에서 여는 조건','access',p.doorSettings?.access||'HOLD',[['HOLD','조건 없음'],['ALARM','알람 완료'],['TERMINAL','터미널 명령']])}${field('알람 시간 · 초','alarmSeconds',(p.doorSettings?.alarm_ticks||200)/20,'number','min="1" max="1200" step="1" required')}${field('터미널 명령','command',p.doorSettings?.terminal_command||'UNLOCK','text','maxlength="64"')}<div class="note subtle">접근 조건은 이쪽 면에만 적용됩니다. 문짝과 개폐 상태는 연결된 양쪽이 공유합니다.</div><label><input type="checkbox" name="required" ${p.required?'checked':''}> 이 문은 반드시 다른 타일과 연결</label><div class="note subtle">좌표는 타일 원점 기준 블록 단위입니다. 동쪽 X=${t.size.x}, 서쪽 X=0, 남쪽 Z=${t.size.z}, 북쪽 Z=0에 놓습니다. 가로 좌표는 문의 중심, Y는 문 아래쪽 높이입니다.</div>${existing?`<button type="button" class="button danger" data-remove-port="${esc(existing.id)}">연결구 삭제</button>`:''}`,data=>{
    const next={...p,name:data.get('name').trim(),facing:t.asset?p.facing:data.get('facing'),required:data.has('required')};for(const k of ['x','y','z','width','height'])next[k]=t.asset?p[k]:Number(data.get(k));
    next.doorSettings={...p.doorSettings,type:t.asset?p.doorSettings.type:data.get('doorType'),access:data.get('access'),terminal_command:data.get('command').trim(),alarm_ticks:Number(data.get('alarmSeconds'))*20,hold_ticks:20};
    const error=portError(t,next);if(error){toast(error,true);return false;}
    return commit(pj=>{const tile=pj.tiles.find(q=>q.id===t.id);if(existing)tile.ports[tile.ports.findIndex(q=>q.id===id)]=next;else tile.ports.push(next);});
  });
  if(t.asset){for(const name of ['x','y','z','width','height'])$('dialogBody').querySelector(`[name="${name}"]`).readOnly=true;for(const name of ['facing','doorType'])$('dialogBody').querySelector(`[name="${name}"]`).disabled=true;$('dialogBody').querySelector('[data-remove-port]')?.remove();}
}
function projectDialog(){
  projectDetailsDialog();
  const note=document.createElement('p');note.className='note subtle';note.textContent='이름을 바꿔도 클리어 기록은 유지됩니다. 다른 작품으로 배포하려면 별도 스테이지로 복제하세요.';
  const fork=document.createElement('button');fork.type='button';fork.className='button';fork.textContent='다른 스테이지로 복제';
  fork.addEventListener('click',()=>{$('dialog').close();confirmChange('스테이지 복제','현재 구성을 새 고유 ID를 가진 별도 스테이지로 복제합니다. 원본의 클리어 기록은 이어받지 않습니다.',()=>{const next=clone(project);next.id=uid('stage');next.name=(project.name+' 복사본').slice(0,80);setProject(next,'별도 스테이지로 복제했습니다.');});});
  $('dialogBody').append(note,fork);
}
function newRoomDialog(){modal('구역 만들기',`${field('구역 번호','code',String(Math.max(100,...project.rooms.map(r=>Number(r.code)||0))+1),'text','required maxlength="40"')}${field('구역 이름','name','새 구역','text','required maxlength="80"')}${selectField('시설 묶음','zoneId',project.zones[0]?.id||'',project.zones.map(z=>[z.id,z.name]))}${field('지도 색상','color','#819e94','color')}`,data=>{
  if(project.rooms.some(r=>r.code===data.get('code').trim())){toast('이미 사용 중인 구역 번호입니다.',true);return false;}
  const room={id:uid('room'),code:data.get('code').trim(),name:data.get('name').trim(),zoneId:data.get('zoneId'),color:data.get('color')};ui.activeRoomId=room.id;ui.selection={kind:'room',id:room.id};return commit(p=>p.rooms.push(room));});}
function newZoneDialog(){modal('시설 묶음 만들기',`${field('시설 이름','name','새 시설','text','required maxlength="80"')}${field('구역 색상','color','#8398b1','color')}`,data=>{const zone={id:uid('zone'),name:data.get('name').trim(),color:data.get('color')};ui.selection={kind:'zone',id:zone.id};return commit(p=>p.zones.push(zone));});}
function addLinkDialog(){const from=ui.selection?.id,targets=project.gimmicks.filter(g=>g.id!==from);if(!targets.length){toast('연결할 기믹을 먼저 하나 더 배치하세요.');return;}
  modal('기믹 이벤트 연결',`${selectField('발생 이벤트','event','상호작용',['상호작용','범위 진입','목표 완료','방어전 종료'].map(v=>[v,v]))}${selectField('대상 기믹','to',targets[0].id,targets.map(g=>[g.id,g.name+' · '+KINDS[g.type].label]))}${selectField('실행 동작','action','활성화',['활성화','비활성화','목표 완료 처리'].map(v=>[v,v]))}`,data=>commit(p=>p.links.push({id:uid('link'),from,to:data.get('to'),event:data.get('event'),action:data.get('action')})));
}
function coordinateDialog(){const tile=project.tiles.find(t=>t.id===ui.brush?.id)||project.tiles.find(t=>t.id===ui.selection?.id);if(!tile)return;modal('좌표로 타일 배치',`<p>${esc(tile.name)}</p><div class="field-row triple">${field('X','x',0,'number','required min="-16384" max="16384" step="1"')}${field('층 높이','y',ui.floor,'number','required min="-1024" max="1024" step="1"')}${field('Z','z',0,'number','required min="-16384" max="16384" step="1"')}</div>${selectField('회전','rotation',0,[0,90,180,270].map(a=>[a,a+'°']))}${selectField('소속 구역','roomId',ui.activeRoomId,project.rooms.map(r=>[r.id,r.code+' · '+r.name]))}`,data=>{
    const p={id:uid('placement'),tileId:tile.id,x:Number(data.get('x'))/16,y:Number(data.get('y')),z:Number(data.get('z'))/16,rotation:Number(data.get('rotation')),roomId:data.get('roomId'),name:''},error=placementError(project,p);
    if(error){toast(error,true);return false;}ui.selection={kind:'placement',id:p.id};ui.floor=p.y;return commit(pj=>pj.placements.push(p));},'배치');}
function validationDialog(){const issues=validate(project),errors=issues.filter(i=>i.severity==='error').length;modal('스테이지 검사',`<p>${errors?`수정할 항목이 ${errors}개 있습니다.`:'공간 배치와 기믹 참조를 검사했습니다.'}</p>${issues.map((i,index)=>`<button type="button" class="issue ${i.severity}" data-issue="${index}"><span>${{error:'⊗',warning:'△',info:'ⓘ'}[i.severity]}</span><span>${esc(i.message)}</span></button>`).join('')}`,null);}
function helpDialog(){modal('사용 가이드',`<p>스테이지 파일 하나에 타일 배치·구역·기믹·목표·이벤트가 저장됩니다. 타일 NBT 원본은 별도 폴더에서 이름과 경로로 참조합니다.</p><div class="section-title workflow-section">처음 만드는 순서</div><p>타일 폴더 연결 → 지도에 드래그해서 배치 → 시작점·탈출 지점 배치 → 임무 목표 → 필요한 이벤트 → 검사·저장 순서로 진행하세요.</p><button type="button" class="button full" data-action="workflow">내 작업의 제작 체크리스트 열기</button><div class="section-title workflow-section">어떤 메뉴를 사용하나요?</div><p><b>배치 지도</b>: 타일 크기와 문의 위치로 배치합니다. 복층 타일은 층을 바꿔 확인하며, 평면·입체 보기에서 회전할 수 있습니다.<br><b>타일 미리보기</b>: 개별 Create NBT 설계도의 블록 배치를 확인합니다. 모드 블록의 정확한 외형·동작은 게임에서 확인하세요.<br><b>이벤트 편집</b>: 발생 조건과 실행 동작을 블록으로 연결합니다. 모의 실행으로 목표·문·스캔의 연결을 확인할 수 있습니다.</p><div class="section-title workflow-section">파일은 어디에 저장하나요?</div><p>작업 폴더 안에 <code>assets/tile/타일셋/타일.nbt</code>와 <code>stage/미션.esfile</code>을 둡니다. 이 사이트는 파일을 서버로 업로드하지 않습니다. 폴더 선택은 읽기 전용 연결이고, <b>스테이지 저장</b>은 다운로드입니다. 브라우저 자동 저장은 이 주소의 복원본이므로 다른 PC·주소로 옮길 때는 .esfile 파일을 사용하세요.</p><div class="section-title workflow-section">주요 단축키</div><p><kbd>V</kbd> 선택 · <kbd>B</kbd> 배치 · <kbd>R</kbd> 회전 · <kbd>Del</kbd> 삭제<br><kbd>Esc</kbd> 배치 취소 · <kbd>Space + 드래그</kbd> 화면 이동<br><kbd>Ctrl Z</kbd> 실행 취소 · <kbd>Ctrl Y</kbd> 다시 실행 · <kbd>Ctrl S</kbd> 파일 저장</p><div class="section-title workflow-section">게임에서 실행</div><p>모드 0.5.0 이상에서 기본 <code>es/</code> 작업 폴더를 읽습니다. <code>/erosionsector stage check 미션.esfile</code>로 검사하고 <code>/erosionsector stage start 미션.esfile</code>로 출발합니다. 다른 작업 폴더는 <code>/erosionsector stage workspace 경로</code>로 지정합니다. 진입은 시작점에 즉시 투하하며 스캔은 별도 블록 없이 바닥에 나타납니다.</p>`,null);}
const actions={
  'workflow':workflowDialog,
  'cancel-placement':()=>{ui.brush=null;ui.mode='select';renderAll();},
  'new':()=>confirmChange('새 스테이지','현재 작업 대신 빈 스테이지를 엽니다.',()=>setProject(emptyProject(),'빈 스테이지를 열었습니다.')),
  'sample':()=>confirmChange('예시 스테이지','A1 · 잠든 관측소의 예시 구성을 엽니다.',()=>setProject({...demoProject(),id:uid('stage')},'예시 스테이지를 열었습니다.')),
  'open':()=>$('projectInput').click(),
  'events':()=>{ui.workspace='events';ui.tab='events';renderAll();},
  'simulate':()=>simulation.open(),
  'return-event':()=>logicEditor.choose(ui.returnProgram),
  'duplicate-bundle':()=>{const p=ui.selection?.kind==='placement'&&project.placements.find(p=>p.id===ui.selection.id);if(!p)return;ui.brush={kind:'tile',id:p.tileId,rotation:p.rotation,sourceId:p.id};ui.mode='paint';ui.workspace='map';ui.view='plan';ui.activeRoomId=p.roomId;renderAll();toast('복제할 위치를 클릭하세요. 관련 이벤트의 외부 참조는 유지됩니다.');},
  'mission':()=>missionEditor.show(),'preview':showPreview,'preview-tile':previewTile,
  'welcome-new':()=>{$('welcome').close();setProject(emptyProject(),'새 스테이지를 열었습니다.');},
  'welcome-open':()=>$('projectInput').click(),
  'welcome-resume':()=>{if(recoveredProject){$('welcome').close();setProject(recoveredProject,'작업을 복원했습니다.');}},
  'welcome-sample':()=>{$('welcome').close();setProject({...demoProject(),id:uid('stage')},'공간 설계 예시를 열었습니다. 실제 실행용 설계도는 포함되지 않습니다.');},
  'save':()=>{try{download(packStage(project),safeName(project.name)+'.esfile');toast('스테이지를 저장했습니다. 타일 원본은 assets/tile 폴더의 상대 경로로 참조합니다.');}catch(error){toast(error.message,true);}},
  'tile-folder':()=>$('tileFolderInput').click(),
  'project':projectDialog,'help':helpDialog,'new-tile':newTileDialog,'new-room':newRoomDialog,'new-zone':newZoneDialog,'add-port':()=>portDialog(),'add-link':addLinkDialog,'coordinates':coordinateDialog,'validation':validationDialog,
  'close-dialog':()=>$('dialog').close(),
  'import-nbt':()=>{pendingAssetTileId=null;$('nbtInput').click();},
  'attach-asset':()=>{pendingAssetTileId=ui.selection?.id;$('nbtInput').click();},
  'undo':()=>{if(!undo.length)return;redo.push(project);project=undo.pop();renderAll();scheduleSave();},
  'redo':()=>{if(!redo.length)return;undo.push(project);project=redo.pop();renderAll();scheduleSave();},
  'rotate':()=>{
    const p=ui.selection?.kind==='placement'&&project.placements.find(p=>p.id===ui.selection.id);if(p)moveTile({...p,rotation:(p.rotation+90)%360});
  },
  'duplicate':()=>{const p=project.placements.find(p=>p.id===ui.selection?.id);if(!p)return;ui.brush={kind:'tile',id:p.tileId,rotation:p.rotation};ui.mode='paint';ui.activeRoomId=p.roomId;renderAll();toast('복제할 위치를 클릭하세요.');},
  'delete':()=>{
    const sel=ui.selection;if(!sel)return;
    if(sel.kind==='placement'){commit(p=>{p.placements=p.placements.filter(q=>q.id!==sel.id);const removed=new Set(p.gimmicks.filter(g=>g.placementId===sel.id).map(g=>g.id));p.gimmicks=p.gimmicks.filter(g=>!removed.has(g.id));p.links=p.links.filter(l=>!removed.has(l.from)&&!removed.has(l.to));},'타일과 소속 기믹을 삭제했습니다. 실행 취소할 수 있습니다.');}
    else if(sel.kind==='gimmick')commit(p=>{p.gimmicks=p.gimmicks.filter(g=>g.id!==sel.id);p.links=p.links.filter(l=>l.from!==sel.id&&l.to!==sel.id);},'기믹을 삭제했습니다.');
  },
  'delete-library':()=>{const id=ui.selection?.id;if(project.placements.some(p=>p.tileId===id)){toast('맵에서 사용 중인 타일 원본은 삭제할 수 없습니다.',true);return;}commit(p=>p.tiles=p.tiles.filter(t=>t.id!==id),'타일 원본을 삭제했습니다.');},
  'floor-down':()=>{ui.floor=Math.max(-1024,ui.floor-1);renderFloors();map.draw();},'floor-up':()=>{ui.floor=Math.min(1024,ui.floor+1);renderFloors();map.draw();},
  'zoom-in':()=>map.zoom(1.2),'zoom-out':()=>map.zoom(1/1.2),'fit':()=>map.fit(),
  'camera-left':()=>map.rotateCamera(45),'camera-right':()=>map.rotateCamera(-45),'camera-reset':()=>map.resetCamera(),
  'toggle-library':()=>$('libraryPanel').classList.toggle('visible'),'toggle-inspector':()=>$('inspectorPanel').classList.toggle('visible'),
  'close-library':()=>$('libraryPanel').classList.remove('visible'),'close-inspector':()=>$('inspectorPanel').classList.remove('visible')
};
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.closest('#fileMenu'))$('fileMenu').open=false;
  if(button.dataset.fileCommand){actions[button.dataset.fileCommand]?.();return;}
  if(button.dataset.guide){guideTo(button.dataset.guide);return;}
  if(button.dataset.workspace){ui.workspace=button.dataset.workspace;if(ui.tab==='events')ui.tab='tiles';renderAll();return;}
  if(button.dataset.relatedProgram){logicEditor.choose(button.dataset.relatedProgram,button.dataset.relatedNode);return;}
  if(button.dataset.scanFocus!==undefined){const g=project.gimmicks.find(g=>g.id===ui.selection?.id);if(!g)return;const index=Number(button.dataset.scanFocus),step=scanSteps(g)[index],p=project.placements.find(p=>p.id===step.placementId),t=p&&tileOf(project,p);ui.selection={kind:'gimmick',id:g.id,step:index};ui.workspace='map';ui.view='plan';ui.mode='select';if(t){ui.floor=Math.floor(worldPoint(step.position,t,p).y/8);map.focus(p,true);}renderAll();return;}
  if(button.hasAttribute('data-scan-add')||button.hasAttribute('data-scan-remove')){
    if(ui.selection?.kind!=='gimmick')return;
    commit(p=>{const g=p.gimmicks.find(q=>q.id===ui.selection.id);if(!g||!['scan','extraction'].includes(g.type))return;g.settings.steps??=[];
      if(button.hasAttribute('data-scan-remove'))g.settings.steps.splice(Number(button.dataset.scanRemove),1);
      else if(g.settings.steps.length<63)g.settings.steps.push({placementId:g.placementId,position:{...g.position},radius:g.settings.radius??2.5,duration:g.settings.duration??5,requiredPlayers:g.settings.requiredPlayers??'all',positionMode:g.settings.positionMode||'fixed'});
    });return;
  }
  if(button.dataset.action){actions[button.dataset.action]?.();return;}
  if(button.dataset.tab){ui.tab=button.dataset.tab;ui.workspace=ui.tab==='events'?'events':'map';renderAll();return;}
  if(button.dataset.libraryTile){ui.workspace='map';const id=button.dataset.libraryTile;ui.selection={kind:'library',id};ui.brush={kind:'tile',id,rotation:0};ui.mode='paint';ui.view='plan';renderAll();if(innerWidth<620)$('libraryPanel').classList.remove('visible');return;}
  if(button.dataset.mode){ui.workspace='map';ui.mode=button.dataset.mode;if(ui.mode==='paint'&&ui.brush?.kind!=='tile'){ui.brush={kind:'tile',id:project.tiles[0]?.id,rotation:0};}ui.view='plan';renderAll();return;}
  if(button.dataset.view){ui.workspace='map';ui.view=button.dataset.view;renderAll();return;}
  if(button.dataset.floor!==undefined){ui.floor=Number(button.dataset.floor);renderFloors();map.draw();return;}
  if(button.dataset.gimmickType){ui.workspace='map';ui.brush={kind:'gimmick',id:button.dataset.gimmickType};ui.mode='gimmick';ui.view='plan';renderAll();if(innerWidth<620)$('libraryPanel').classList.remove('visible');return;}
  if(button.dataset.room){ui.activeRoomId=button.dataset.room;selectTarget('room',button.dataset.room);return;}
  if(button.dataset.selectKind){selectTarget(button.dataset.selectKind,button.dataset.selectId);return;}
  if(button.dataset.editPort){portDialog(button.dataset.editPort);return;}
  if(button.dataset.removePort){const id=button.dataset.removePort;commit(p=>{const tile=p.tiles.find(t=>t.id===ui.selection.id);tile.ports=tile.ports.filter(port=>port.id!==id);});$('dialog').close();return;}
  if(button.dataset.deleteLink){commit(p=>p.links=p.links.filter(l=>l.id!==button.dataset.deleteLink));return;}
  if(button.dataset.issue!==undefined){const issue=validate(project)[Number(button.dataset.issue)];if(issue?.target){$('dialog').close();selectTarget(issue.target.kind,issue.target.id);}return;}
});
document.addEventListener('click',event=>{if(!event.target.closest('#fileMenu'))$('fileMenu').open=false;});
document.querySelector('.tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('[data-tab]')],index=tabs.indexOf(event.target);if(index<0)return;
  event.preventDefault();const at=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[at].click();tabs[at].focus();
});
document.addEventListener('input',event=>{if(event.target.id==='tileSearch'){ui.search=event.target.value;renderTileList();}if(event.target.id==='areaSearch'){ui.areaSearch=event.target.value;renderAreaTree();}});
document.addEventListener('toggle',event=>{if(!event.target.matches?.('.area-folder'))return;const id=event.target.dataset.folder;if(event.target.open)closedAreas.delete(id);else closedAreas.add(id);},true);
let paletteSource=null,paletteWorkspaceChanged=false;
function finishPaletteDrag(){if(!paletteSource)return;paletteSource.classList.remove('palette-dragging');paletteSource=null;map.endPaletteDrag();renderWorkflow();if(paletteWorkspaceChanged){paletteWorkspaceChanged=false;renderAll();}}
document.addEventListener('dragstart',event=>{
  const source=event.target.closest('[data-library-tile],[data-gimmick-type]');if(!source)return;
  const brush=source.dataset.libraryTile?{kind:'tile',id:source.dataset.libraryTile,rotation:ui.brush?.kind==='tile'&&ui.brush.id===source.dataset.libraryTile?ui.brush.rotation||0:0}:{kind:'gimmick',id:source.dataset.gimmickType};
  event.dataTransfer.setData(PALETTE_MIME,JSON.stringify(brush));event.dataTransfer.effectAllowed='copy';paletteSource=source;source.classList.add('palette-dragging');
  paletteWorkspaceChanged=ui.workspace!=='map';ui.workspace='map';$('canvasWrap').hidden=false;$('emptyMap').hidden=true;$('placementBanner').hidden=true;document.querySelector('.floor-bar').hidden=false;$('tilePreviewPanel').hidden=true;logicEditor.close();renderFloors();map.beginPaletteDrag(brush);
});
document.addEventListener('dragend',finishPaletteDrag);
document.addEventListener('drop',finishPaletteDrag);
document.addEventListener('dragstart',event=>{const row=event.target.closest('[data-tree-placement]');if(!row)return;draggedArea=row.dataset.treePlacement;event.dataTransfer.setData('application/x-erosion-area',draggedArea);event.dataTransfer.effectAllowed='move';});
document.addEventListener('dragover',event=>{if(draggedArea&&event.target.closest('.area-folder')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
document.addEventListener('drop',event=>{const room=event.target.closest('.area-folder')?.dataset.folder;if(!draggedArea||!room)return;event.preventDefault();const p=project.placements.find(p=>p.id===draggedArea);draggedArea=null;if(p&&p.roomId!==room){closedAreas.delete(room);ui.activeRoomId=room;moveTile({...p,roomId:room});}});
document.addEventListener('dragend',()=>{draggedArea=null;});
$('ghostToggle').addEventListener('change',event=>{ui.ghost=event.target.checked;map.draw();});
$('inspectorContent').addEventListener('change',event=>{
  const input=event.target,key=input.dataset.property,sel=ui.selection;if(!key||!sel)return;
  if(!input.checkValidity()){input.reportValidity();renderInspector();return;}
  const numeric=input.type==='number'||key==='rotation'||key.endsWith('requiredPlayers')&&input.value!=='all',value=input.dataset.valueKind==='lines'?input.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean):input.dataset.valueKind==='list'?[...input.selectedOptions].map(o=>o.value):['settings.wake','settings.requireAll','settings.unlockOnObjectives','settings.enabled'].includes(key)?input.value==='true':numeric?Number(input.value):input.value;
  if(sel.kind==='placement'){
    const p=project.placements.find(p=>p.id===sel.id),next={...p,[key]:['x','z'].includes(key)?value/16:value};if(moveTile(next)&&key==='y'){ui.floor=value;renderFloors();map.draw();}return;
  }
  const collection={library:'tiles',gimmick:'gimmicks',room:'rooms',zone:'zones'}[sel.kind];if(!collection)return;
  if(sel.kind==='room'&&key==='code'&&project.rooms.some(r=>r.id!==sel.id&&r.code===value)){toast('이미 사용 중인 구역 번호입니다.',true);renderInspector();return;}
  const changed=commit(p=>{const item=p[collection].find(q=>q.id===sel.id),parts=key.split('.');let at=item;for(const part of parts.slice(0,-1)){at[part]??={};at=at[part];}at[parts.at(-1)]=value;});
  if(!changed)renderInspector();
});
$('nbtInput').addEventListener('change',async event=>{
  const files=[...event.target.files],target=pendingAssetTileId;pendingAssetTileId=null;
  for(const file of (target?files.slice(0,1):files)){
    try{toast(`${file.name} 읽는 중…`);const tile=await inspectStructure(await file.arrayBuffer(),file.name);
      if(target){const old=project.tiles.find(t=>t.id===target);if(!old)throw new Error('교체할 타일이 없습니다.');if(['x','y','z'].some(k=>old.size[k]!==tile.size[k]))throw new Error('기존 타일과 설계도의 크기가 다릅니다. 새 타일로 가져오세요.');
        commit(p=>{const t=p.tiles.find(t=>t.id===target);t.asset={...tile.asset,...(t.asset?.reference?{reference:t.asset.reference}:{})};if(tile.ports.length)t.ports=tile.ports;},'설계도 원본을 연결했습니다.');
      }else{ui.selection={kind:'library',id:tile.id};ui.brush={kind:'tile',id:tile.id,rotation:0};ui.tab='tiles';ui.mode='paint';commit(p=>p.tiles.push(tile),tile.asset.markerCount?'설계도와 문 마커를 가져왔습니다.':'설계도를 가져왔습니다. 문 연결구를 수동 설정할 수 있습니다.');}
    }catch(error){toast(file.name+': '+error.message,true);}
  }
  event.target.value='';
});
$('projectInput').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(!/\.esfile$/i.test(file.name))throw new Error('.esfile 스테이지 파일을 선택하세요.');if(file.size>64*1024*1024)throw new Error('스테이지는 64MB 이하로 가져오세요.');$('welcome').close();await setProject(unpackStage(await file.arrayBuffer()),'스테이지를 불러왔습니다. 타일 원본이 없으면 타일 폴더를 연결하세요.');}catch(error){toast(error.message,true);}event.target.value='';});
$('tileFolderInput').addEventListener('change',async event=>{const files=[...event.target.files];try{toast('타일 폴더 읽는 중…');const result=await loadTileFolder(project,files);if(commit(p=>Object.assign(p,result.project),`타일 폴더 연결: ${result.linked}개 복원 · ${result.added}개 추가`))tileFolderFiles=files;}catch(error){toast(error.message,true);}event.target.value='';});
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&$('fileMenu').open){$('fileMenu').open=false;$('fileMenu').querySelector('summary').focus();return;}
  if($('dialog').open)return;
  const editable=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(editable)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();actions.save();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();actions[event.shiftKey?'redo':'undo']();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();actions.redo();return;}
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  if(ui.workspace==='events'){if(event.key==='Escape'){ui.workspace='map';renderAll();}return;}
  switch(event.key.toLowerCase()){
    case 'v':ui.mode='select';renderAll();break;
    case 'b':ui.mode='paint';if(ui.brush?.kind!=='tile')ui.brush={kind:'tile',id:project.tiles[0]?.id,rotation:0};ui.view='plan';renderAll();break;
    case 'r':event.preventDefault();if(ui.mode==='paint'&&ui.brush?.kind==='tile'){ui.brush.rotation=((ui.brush.rotation||0)+90)%360;renderWorkflow();map.draw();toast(`배치 방향 ${ui.brush.rotation}°`);}else actions.rotate();break;
    case 'd':actions.duplicate();break;
    case 'delete':case 'backspace':event.preventDefault();actions.delete();break;
    case 'escape':ui.mode='select';ui.brush=null;ui.selection=null;renderAll();break;
  }
});
renderAll();$('welcome').showModal();
$('welcome').addEventListener('cancel',e=>e.preventDefault());
$('previewNbtInput').addEventListener('change',async e=>{const f=e.target.files[0];if(f){showPreview();tilePreview.open(new Uint8Array(await f.arrayBuffer()),f.name);}e.target.value='';});
try{const db=await openDatabase();const saved=await new Promise((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').get('current');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});if(saved){recoveredProject=saved;$('resumeProject').hidden=false;}$('saveStatus').textContent='자동 저장 준비';$('saveStatus').className='save-status saved';}catch{toast('자동 저장을 사용할 수 없습니다. 스테이지 파일로 저장해 주세요.',true);$('saveStatus').textContent='파일 저장 사용';}
// Read-only diagnostics expose counts for local browser QA without changing editor state.
globalThis.EROSIONSECTOR_EDITOR=Object.freeze({summary:()=>({placements:project.placements.length,gimmicks:project.gimmicks.length,rooms:project.rooms.length,programs:project.programs.length,workspace:ui.workspace,floor:ui.floor,view:ui.view,camera:map.cameraState(),preview:tilePreview.state(),issues:validate(project)}),snapshot:()=>clone(project),projectPoint:point=>map.projectPoint(point)});
