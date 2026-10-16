import {CELL,FACES,KINDS,uid,clone,tileOf,dimensions,bounds,placementError,portError,connections,validate,demoProject,emptyProject,readProject,worldPoint} from './core.mjs';
import {inspectStructure,restoreProject,loadTileFolder} from './nbt.mjs';
import {packStage,unpackStage} from './stage-file.mjs';
import {createMap} from './map.mjs';
import {nextAreaCode,areaTree,areaLabel,placementLabel} from './hierarchy.mjs';
import {createLogicEditor} from './logic-editor.mjs';
import {createMissionEditor,gimmickSettings,gimmickDefaults,GIMMICK_DESCRIPTIONS} from './mission-editor.mjs';
import {createTilePreview} from './tile-preview.mjs';
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
  showPreview:(name,text)=>modal(name+' · 흐름 보기',`<pre class="logic-preview">${esc(text)}</pre><div class="note subtle">조건 분기와 실행 순서를 보여줍니다. 게임의 동작을 실행하지 않습니다.</div>`,null)});
const missionEditor=createMissionEditor({getProject:()=>project,commit,modal,field,selectField,esc,uid});
const tilePreview=createTilePreview({panel:$('tilePreviewPanel'),notify:toast});
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
  const sequence=++saveSequence,value=clone(project);
  try{const db=await openDatabase();await new Promise((resolve,reject)=>{const transaction=db.transaction('projects','readwrite');transaction.objectStore('projects').put(value,'current');transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
    if(sequence===saveSequence){$('saveStatus').textContent='자동 저장됨';$('saveStatus').className='save-status saved';}
  }catch{if(sequence===saveSequence){$('saveStatus').textContent='파일로 저장해 주세요';$('saveStatus').className='save-status';toast('브라우저 자동 저장에 실패했습니다. 스테이지 저장으로 파일을 백업하세요.',true);}}
}
function scheduleSave(){clearTimeout(saveTimer);$('saveStatus').textContent='저장 중…';$('saveStatus').className='save-status';saveTimer=setTimeout(writeAutoSave,350);}
function commit(change,message){
  const next=clone(project);
  let checked;try{change(next);checked=readProject(next);}catch(error){toast(error.message,true);return false;}
  undo.push(clone(project));if(undo.length>25)undo.shift();redo=[];project=checked;renderAll();scheduleSave();if(message)toast(message);return true;
}
async function setProject(value,message){
  let next,linkError='';try{next=await restoreProject(value);}catch(error){toast(error.message,true);return;}
  if(tileFolderFiles&&next.tiles.some(t=>t.asset&&!t.asset.bytes)){
    try{next=(await loadTileFolder(next,tileFolderFiles)).project;}catch(error){linkError=error.message;}
  }
  project=next;undo=[];redo=[];ui.selection=null;ui.brush=null;ui.mode='select';ui.floor=0;ui.activeRoomId=project.rooms[0]?.id||'';renderAll();scheduleSave();requestAnimationFrame(()=>map.fit());
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
function renderLibrary(){
  document.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===ui.tab)));
  if(ui.tab==='tiles'){
    $('libraryContent').innerHTML=`<button class="button full" data-action="import-nbt">↑ Create 설계도 가져오기</button><div style="height:12px"></div><input class="search" id="tileSearch" placeholder="타일 이름 검색…" aria-label="타일 이름 검색" value="${esc(ui.search)}"><div class="section-label"><span>타일 라이브러리</span><span>${project.tiles.length}</span></div><div id="tileList"></div><button class="subtle-button" data-action="new-tile">＋ 설계용 타일 만들기</button>`;
    renderTileList();
  }else if(ui.tab==='gimmicks'){
    $('libraryContent').innerHTML=`<div class="section-label"><span>기믹 배치</span><span>${project.gimmicks.length}</span></div><small>기믹을 고른 뒤 배치도에서 타일 내부를 클릭하세요.</small><div style="height:14px"></div>${Object.entries(KINDS).map(([type,kind])=>`<button class="gimmick-card ${ui.brush?.kind==='gimmick'&&ui.brush.id===type?'selected':''}" data-gimmick-type="${type}"><span class="gimmick-icon" style="color:${kind.color}">${kind.icon}</span><div><strong>${kind.label}</strong><small>${GIMMICK_DESCRIPTIONS[type]}</small></div></button>`).join('')}<div class="divider"></div><div class="section-label">배치된 기믹</div>${project.gimmicks.map(g=>`<button class="room-card ${ui.selection?.id===g.id?'selected':''}" data-select-kind="gimmick" data-select-id="${esc(g.id)}"><span style="color:${KINDS[g.type].color}">${KINDS[g.type].icon}</span><div><strong>${esc(g.name)}</strong><small>${esc(KINDS[g.type].label)}</small></div></button>`).join('')}`;
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
  }).join('')||'<div class="empty-state">검색 결과가 없습니다.</div>';
  const orphan=project.placements.filter(p=>!project.rooms.some(r=>r.id===p.roomId));
  if(orphan.length)target.insertAdjacentHTML('beforeend',`<div class="note warning">구역 미지정</div>${orphan.map(p=>leaf({...p,tileName:tileOf(project,p)?.name||'없는 타일',gimmicks:project.gimmicks.filter(g=>g.placementId===p.id)})).join('')}`);
}
function renderTileList(){
  if(!$('tileList'))return;
  const tiles=project.tiles.filter(t=>(t.name+' '+t.category).toLowerCase().includes(ui.search.toLowerCase()));
  const groups=new Map();for(const tile of tiles){const folder=tile.asset?.reference?.split('/').slice(0,-1).join('/')||'설계용 · 미연결';if(!groups.has(folder))groups.set(folder,[]);groups.get(folder).push(tile);}
  const card=tile=>`<button class="tile-card ${ui.brush?.id===tile.id?'selected':''}" data-library-tile="${esc(tile.id)}"><div class="tile-preview"><span class="tile-kind">${esc(tile.category)}</span><span class="tile-status ${tile.asset?'real':''}">${tile.asset?'NBT 연결됨':'설계용'}</span>${tileThumbnail(tile)}</div><div class="tile-info"><div><strong>${esc(tile.name)}</strong><small>${tile.size.x} × ${tile.size.z} × 높이 ${tile.size.y} · 문 ${tile.ports.length}</small></div><span class="tile-dots">↗</span></div></button>`;
  $('tileList').innerHTML=[...groups].map(([folder,items])=>`<details class="tileset-folder" open><summary>▰ ${esc(folder)} <span>${items.length}</span></summary>${items.map(card).join('')}</details>`).join('')||'<div class="empty-state">검색 결과가 없습니다.</div>';
}
function renderFloors(){
  const floors=new Set([ui.floor,0]);for(const p of project.placements){const t=tileOf(project,p);if(t)for(let f=p.y;f<p.y+t.size.y/8;f++)floors.add(f);}
  let values=[...floors].sort((a,b)=>a-b);if(values.length>7)values=values.filter(f=>Math.abs(f-ui.floor)<=3);
  $('floorTabs').innerHTML=values.map(f=>`<button data-floor="${f}" class="${f===ui.floor?'active':''}" title="블록 높이 ${f*8}~${f*8+7}">${floorName(f)}</button>`).join('');
  $('viewLabel').textContent=ui.view==='plan'?`${floorName(ui.floor)} · 높이 ${ui.floor*8}~${ui.floor*8+7} · 타일 배치도`:'전체 층 · 타일 입체 배치도';
  $('mapInstructions').textContent=ui.view==='iso'?'드래그로 시점 회전 · 클릭해서 선택 · 휠 확대 · Space+드래그 이동':ui.mode==='paint'?'클릭해서 타일 배치 · R 회전 · Esc 선택 모드':ui.mode==='gimmick'?'타일 내부를 클릭해서 기믹 배치 · Esc 취소':'타일을 드래그해 이동 · 휠 확대 · Space+드래그 화면 이동';
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
  renderLibrary();renderFloors();renderInspector();if(ui.workspace==='events')logicEditor.render();else logicEditor.close();$('canvasWrap').hidden=ui.workspace!=='map';document.querySelector('.floor-bar').hidden=ui.workspace!=='map';$('tilePreviewPanel').hidden=ui.workspace!=='preview';tilePreview.draw();map.draw();
}
function renderInspector(){
  const sel=ui.selection,container=$('inspectorContent');
  $('inspectorLabel').textContent=sel?sel.kind.toUpperCase():'STAGE';
  if(sel?.kind==='placement'){
    const p=project.placements.find(p=>p.id===sel.id),t=p&&tileOf(project,p);if(!t){ui.selection=null;return renderInspector();}
    const d=dimensions(t,p.rotation),room=project.rooms.find(r=>r.id===p.roomId),net=connections(project);
    container.innerHTML=`<div class="inspect-kicker">TILE INSTANCE</div><h3 class="inspect-title">${esc(p.name||t.name)}</h3><p class="inspect-description">${esc(room?.code||'방 미지정')} · ${d.x} × ${d.z}블록 · 높이 ${d.y/8}층</p>${propField('하위 구역 이름','areaCode',p.areaCode,'text','required maxlength="40"')}${propField('배치 이름','name',p.name,'text','maxlength="80" placeholder="타일 이름 사용"')}<div class="field-row triple">${propField('X','x',p.x*16,'number','step="1" min="-16384" max="16384"')}${propField('층 높이','y',p.y,'number','step="1" min="-1024" max="1024"')}${propField('Z','z',p.z*16,'number','step="1" min="-16384" max="16384"')}</div>${propSelect('회전','rotation',p.rotation,[0,90,180,270].map(n=>[n,n+'°']))}${propSelect('소속 구역','roomId',p.roomId,project.rooms.map(r=>[r.id,r.code+' · '+r.name]))}<div class="action-row"><button class="button" data-action="rotate">↻ 회전</button><button class="button" data-action="duplicate">복제</button><button class="button danger" data-action="delete">삭제</button></div><div class="divider"></div><div class="section-title"><span>문 연결</span><span class="badge">${t.ports.length}개</span></div>${t.ports.map(port=>`<div class="port-row"><span class="port-dot" style="background:${net.connected.has(p.id+':'+port.id)?'#b8dcae':'#d5a06b'}"></span><div><strong>${esc(port.name)}</strong><small>${directionName[port.facing]} · ${floorName(p.y+Math.floor(port.y/8))} · ${net.connected.has(p.id+':'+port.id)?'연결됨':port.required?'연결 필수':'미연결 허용'}</small></div></div>`).join('')||'<small>원본 타일에서 연결구를 설정하세요.</small>'}<button class="subtle-button" data-select-kind="library" data-select-id="${esc(t.id)}">타일 원본과 연결구 편집 →</button><div class="note subtle">이 타일은 ${floorName(p.y)}${d.y>8?'~'+floorName(p.y+d.y/8-1):''}을 점유합니다. 이동·회전·삭제는 모든 층에 함께 적용됩니다.</div>`;
  }else if(sel?.kind==='library'){
    const t=project.tiles.find(t=>t.id===sel.id);if(!t){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">TILE SOURCE</div><h3 class="inspect-title">${esc(t.name)}</h3><p class="inspect-description">X ${t.size.x} × Z ${t.size.z} × 높이 ${t.size.y}블록</p>${propField('타일 이름','name',t.name,'text','required maxlength="80"')}${propField('분류','category',t.category,'text','maxlength="40"')}<button class="button full" data-action="preview-tile">설계도 미리보기</button><button class="button full" data-action="coordinates" style="margin-top:8px">좌표로 배치</button><div class="divider"></div><div class="section-title"><span>Create 설계도</span><span class="badge">${t.asset?(t.asset.bytes?'연결됨':'원본 미연결'):'설계용'}</span></div><button class="button full" data-action="attach-asset">${t.asset?'설계도 교체':'설계도 파일 연결'} ↑</button>${t.asset?`${propField('타일 경로 · tile 폴더 기준','asset.reference',t.asset.reference||'','text','maxlength="512" placeholder="연구소/복도.nbt"')}<div class="asset-stats" style="margin-top:10px">${esc(t.asset.reference||t.asset.name)}${!t.asset.bytes?'<br><strong>원본 미연결 · 타일 폴더를 연결하세요</strong>':''}<br>점유 블록 ${(t.asset.occupancy?.count??t.asset.blockCount).toLocaleString()} · 재질 ${t.asset.paletteCount} · 문 마커 ${t.asset.markerCount}<br>포함 네임스페이스: ${esc(t.asset.namespaces.join(', '))}<br><code>SHA-256 ${esc(t.asset.sha256.slice(0,16))}…</code></div>`:'<div class="note warning">배치 설계용 타일입니다. 실제 건축물을 사용하려면 같은 크기의 .nbt 설계도를 연결하세요.</div>'}<div class="divider"></div><div class="section-title"><span>문 연결구</span><button class="subtle-button" data-action="add-port">＋ 추가</button></div>${t.ports.map(port=>`<div class="port-row"><div><strong>${esc(port.name)}</strong><small>${directionName[port.facing]} · 높이 ${port.y} · ${port.width}×${port.height} · ${port.required?'필수':'선택'}</small></div><button class="icon-button" data-edit-port="${esc(port.id)}" aria-label="${esc(port.name)} 편집">⋯</button></div>`).join('')||'<small>문 연결구가 없습니다. 추가하거나 마커가 포함된 설계도를 가져오세요.</small>'}<div class="note subtle">연결구 설정은 이 타일 쪽의 접근 조건입니다. 반대편과 알람·터미널 조건이 달라도 연결할 수 있습니다. 최소 문 하나를 유지하세요.</div><button class="subtle-button" data-action="delete-library">사용하지 않는 원본 삭제</button>`;
  }else if(sel?.kind==='gimmick'){
    const g=project.gimmicks.find(g=>g.id===sel.id);if(!g){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">GIMMICK · ${esc(KINDS[g.type].label)}</div><h3 class="inspect-title">${esc(g.name)}</h3>${propField('표시 이름','name',g.name,'text','required maxlength="80"')}${propSelect('소속 타일','placementId',g.placementId,project.placements.map(p=>[p.id,(project.rooms.find(r=>r.id===p.roomId)?.code||'미지정')+' · '+(p.name||tileOf(project,p)?.name||'타일')]))}<div class="section-title">타일 내부 좌표 · 블록 단위</div><div class="field-row triple">${['x','y','z'].map(k=>propField(k.toUpperCase(),'position.'+k,g.position[k],'number','step="0.5" min="0" max="255"')).join('')}</div>${gimmickSettings(g,project,{field:propField,select:propSelect,esc})}<div class="divider"></div><button class="button primary full" data-action="events">블록 이벤트 편집</button><div class="section-title"><span>간단 이벤트 연결</span><button class="subtle-button" data-action="add-link">＋ 추가</button></div>${project.links.filter(l=>l.from===g.id).map(l=>`<div class="link-row"><div><strong>→ ${esc(project.gimmicks.find(q=>q.id===l.to)?.name||'없는 대상')}</strong><small>${esc(l.event)} → ${esc(l.action)}</small></div><button class="icon-button" data-delete-link="${esc(l.id)}" aria-label="연결 삭제">×</button></div>`).join('')||'<small>이 기믹에서 발생하는 이벤트를 다른 기믹에 연결할 수 있습니다.</small>'}<div class="divider"></div><button class="button danger full" data-action="delete">기믹 삭제</button><div class="note subtle">모드 0.4.0에서 이 설정을 읽어 장치·목표·알람을 실행합니다. 실물 장치 좌표는 빈 공간 또는 같은 종류의 장치여야 합니다.</div>`;
  }else if(sel?.kind==='room'){
    const r=project.rooms.find(r=>r.id===sel.id);if(!r){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">ROOM</div><h3 class="inspect-title">${esc(r.code)} · ${esc(r.name)}</h3>${propField('표시 번호','code',r.code,'text','required maxlength="40"')}${propField('구역 이름','name',r.name,'text','required maxlength="80"')}${propSelect('시설 묶음','zoneId',r.zoneId,project.zones.map(z=>[z.id,z.name]))}${propField('지도 색상','color',r.color,'color')}<div class="asset-stats">고유 ID: <code>${esc(r.id)}</code><br>이 ID는 표시 번호를 바꿔도 유지됩니다.</div><div class="divider"></div><div class="section-title">소속 타일</div>${project.placements.filter(p=>p.roomId===r.id).map(p=>`<button class="room-card" data-select-kind="placement" data-select-id="${esc(p.id)}"><div><strong>${esc(p.name||tileOf(project,p)?.name)}</strong><small>X ${p.x} · Z ${p.z} · ${floorName(p.y)}</small></div></button>`).join('')||'<small>새 타일을 배치하거나 타일 속성에서 이 방을 지정하세요.</small>'}`;
  }else if(sel?.kind==='zone'){
    const z=project.zones.find(z=>z.id===sel.id);if(!z){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">ZONE</div><h3 class="inspect-title">${esc(z.name)}</h3>${propField('구역 이름','name',z.name,'text','required maxlength="80"')}${propField('구역 색상','color',z.color,'color')}<div class="note subtle">방은 소속 구역으로 묶입니다. 방의 세부 색상은 방 속성에서 설정합니다.</div>`;
  }else{
    const network=connections(project);container.innerHTML=`<div class="inspect-kicker">STAGE OVERVIEW</div><h3 class="inspect-title">${esc(project.name)}</h3><p class="inspect-description">${esc(project.description||'스테이지 설정에서 임무 설명을 입력하세요.')}</p><div class="metric-grid"><div class="metric"><small>배치된 타일</small><b>${project.placements.length}<span style="font-size:10px;color:#8298a5"> 개</span></b></div><div class="metric"><small>연결된 문</small><b>${network.pairs.length}<span style="font-size:10px;color:#8298a5"> 쌍</span></b></div></div><button class="button full" data-action="project">스테이지 설정</button><button class="button primary full" data-action="mission" style="margin-top:8px">임무 목표와 탈출 · ${project.objectives.length}개</button><button class="button full" data-action="events" style="margin-top:8px">블록 이벤트 편집 · ${project.programs.length}개</button><div class="divider"></div><div class="section-title">임무 흐름</div>${project.gimmicks.filter(g=>['spawn','alarm','terminal','extraction'].includes(g.type)).map((g,i)=>`<button class="room-card" data-select-kind="gimmick" data-select-id="${esc(g.id)}"><span class="flow-number">${i+1}</span><div><strong>${esc(g.name)}</strong><small>${esc(KINDS[g.type].label)}</small></div></button>`).join('')||'<small>기믹 탭에서 시작점과 목표를 추가하세요.</small>'}<div class="divider"></div><div class="section-title">작업 순서</div><div class="flow-item"><span class="flow-number">1</span><div><strong>타일 배치</strong><small>라이브러리에서 고른 후 격자를 클릭</small></div></div><div class="flow-item"><span class="flow-number">2</span><div><strong>층과 문 연결 확인</strong><small>높이가 같은 연결구끼리 자동 판정</small></div></div><div class="flow-item"><span class="flow-number">3</span><div><strong>기믹과 임무 흐름 지정</strong><small>장치를 놓고 이벤트 연결</small></div></div><div class="note warning">현재 예시 타일은 공간 설계용입니다. 게임에서 실행하려면 실제 설계도를 연결하고 모드 0.4.0 이상을 사용하세요.</div>`;
  }
}
function placeTile(x,y,z){
  if(ui.brush?.kind!=='tile'){toast('라이브러리에서 타일을 먼저 선택하세요.');return;}
  const p={id:uid('placement'),tileId:ui.brush.id,x,y,z,rotation:ui.brush.rotation||0,roomId:ui.activeRoomId||project.rooms[0]?.id||'',name:''};
  const error=placementError(project,p);if(error){toast(error,true);return;}
  ui.selection={kind:'placement',id:p.id};commit(pj=>pj.placements.push(p));
}
function moveTile(p){const old=project.placements.find(q=>q.id===p.id);if(old&&old.roomId!==p.roomId)p={...p,areaCode:nextAreaCode(project,p.roomId,p.id)};const error=placementError(project,p);if(error){toast(error,true);return false;}return commit(pj=>{pj.placements[pj.placements.findIndex(q=>q.id===p.id)]=p;});}
function placeGimmick(placement,position){
  const type=ui.brush.id,g={id:uid('gimmick'),type,name:KINDS[type].label,placementId:placement.id,
    position:Object.fromEntries(Object.entries(position).map(([k,v])=>[k,Math.floor(v*2)/2])),settings:gimmickDefaults(type)};
  ui.selection={kind:'gimmick',id:g.id};ui.mode='select';ui.brush=null;commit(pj=>pj.gimmicks.push(g));
}
function selectTarget(kind,id){if(kind==='program'){logicEditor.choose(id);return;}ui.workspace='map';if(kind==='room')ui.activeRoomId=id;ui.selection={kind,id};ui.mode='select';if(kind==='placement'){const p=project.placements.find(p=>p.id===id);if(p){ui.activeRoomId=p.roomId;closedAreas.delete(p.roomId);ui.floor=p.y;map.focus(p);}}else if(kind==='gimmick'){const g=project.gimmicks.find(g=>g.id===id),p=project.placements.find(p=>p.id===g?.placementId),t=p&&tileOf(project,p);if(t){ui.floor=Math.floor(worldPoint(g.position,t,p).y/8);map.focus(p);}}renderAll();if(innerWidth<950)$('inspectorPanel').classList.add('visible');}
function projectDetailsDialog(){modal('스테이지 설정',`${field('스테이지 이름','name',project.name,'text','required maxlength="80"')}<div class="field-row">${field('챕터 ID','chapterId',project.chapter.id,'text','maxlength="160"')}${field('챕터 이름','chapterName',project.chapter.name,'text','maxlength="160"')}</div><label class="field">챕터 설명<textarea name="chapterDescription" maxlength="3000">${esc(project.chapter.description)}</textarea></label>${field('미션 코드','missionCode',project.missionCode,'text','maxlength="160" placeholder="예: A1"')}<label class="field">임무 설명<textarea name="description" maxlength="3000">${esc(project.description)}</textarea></label><div class="field-row">${field('최소 인원','minPlayers',project.minPlayers,'number','required min="1" max="16"')}${field('최대 인원','maxPlayers',project.maxPlayers,'number','required min="1" max="16"')}</div>`,data=>commit(p=>{p.name=data.get('name').trim();p.chapter={id:data.get('chapterId').trim(),name:data.get('chapterName').trim(),description:data.get('chapterDescription')};p.missionCode=data.get('missionCode').trim();p.description=data.get('description');p.minPlayers=Number(data.get('minPlayers'));p.maxPlayers=Number(data.get('maxPlayers'));}));}
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
function helpDialog(){modal('Erosion Sector 제작 가이드',`<p>Create 설계도로 만든 공간을 타일로 등록하고, 방과 기믹을 조립하는 도구입니다.</p><div class="section-title">타일 제작과 가져오기</div><p>Create에서 영역을 저장하세요. 크기는 <b>가로·깊이는 자유 크기, 높이는 8의 배수</b>여야 합니다. 타일 탭의 ‘설계도 가져오기’에서 .nbt를 선택합니다. 파일은 브라우저에서 읽습니다. 타일 원본은 외부 tile 폴더에 보관하고 .esfile에는 상대 경로와 확인용 해시만 기록합니다.</p><p>설계도의 가로·깊이는 양의 정수, 높이는 8의 배수여야 하며 외곽에 Erosion Sector 문이 최소 하나 있어야 합니다. 4×4·6×4·10×6 문 구동부 행을 읽고, 양쪽 접근 조건은 각각 보존합니다. 실제 설계도에서는 공기를 제외한 블록의 겹침을 검사합니다. 공기는 다른 타일을 덮어쓰지 않는 배치 규칙으로 내보냅니다. X/Z 배치 좌표는 블록 단위입니다.</p><div class="section-title">배치와 복층</div><p>타일을 고르고 격자를 클릭하세요. <span class="guide-key">V</span> 선택, <span class="guide-key">B</span> 배치, <span class="guide-key">R</span> 수평 회전, <span class="guide-key">Del</span> 삭제입니다. 휠로 확대하고 Space+드래그로 화면을 이동합니다. 속성에서 좌표를 입력할 수도 있습니다.</p><p>층 탭은 같은 입체 타일을 높이 8블록 단위로 나눠 보여줍니다. 위아래 공간이 겹치지 않으면 같은 XZ에 배치할 수 있습니다. 문은 동서남북으로만 연결되며 실제 위치와 크기가 맞아야 합니다.</p><div class="section-title">저장과 실행</div><p>‘스테이지 저장’으로 챕터·임무 설명, 타일 배치·방·기믹을 .esfile 하나에 저장합니다. 별도의 프로젝트 파일이나 외부 stage.json은 필요 없습니다. 타일 NBT는 묶음에 넣지 않으며 tile 폴더 기준 타일셋/타일이름.nbt 경로로 참조합니다. 불러온 뒤 ‘타일 폴더 연결’에서 tile 폴더를 선택하면 원본을 찾습니다. 같은 파일명이 다른 타일셋에 있어도 전체 상대 경로로 구분합니다.</p><div class="note warning">이 앱은 배치 설계 도구입니다. 설계도 미리보기는 실제 블록 좌표를 간단한 색상 육면체로 보여주며, 모드 0.4.0에서는 설정 파일을 읽어 임무 차원을 구성합니다. 사이트와 로컬 앱의 자동 저장 공간은 서로 다르므로 파일로 이동하세요.</div><div class="section-title">게임에서 실행</div><p>지정한 작업 폴더에 <code>tile/타일셋/타일.nbt</code>와 <code>stage/미션.esfile</code>을 둡니다. 게임에서 <code>/erosionsector stage workspace 경로</code>로 그 폴더를 지정하고, <code>/erosionsector stage check 미션.esfile</code>로 검사한 뒤 <code>/erosionsector stage start 미션.esfile</code>로 출발하세요. 시설 터미널에서는 STAGES와 DEPLOY 미션.esfile도 사용할 수 있습니다. 임무는 서버당 하나이며 로비 방장 또는 로비 미가입 솔로로 시작합니다. 방장이 나가면 실패하고 원래 위치로 복귀합니다.</p><p>실물 기믹은 타일 내부의 빈 공간에 놓으세요. 진입 패드는 1×1블록이며 위쪽에 플레이어가 설 공간이 필요합니다. 보안 문 시도·터미널 명령어·화물 들기·키카드 획득을 이벤트에 연결할 수 있습니다.</p>`,null);}
const actions={
  'new':()=>confirmChange('새 스테이지','현재 작업 대신 빈 스테이지를 엽니다.',()=>setProject(emptyProject(),'빈 스테이지를 열었습니다.')),
  'sample':()=>confirmChange('예시 스테이지','A1 · 잠든 관측소의 예시 구성을 엽니다.',()=>setProject({...demoProject(),id:uid('stage')},'예시 스테이지를 열었습니다.')),
  'open':()=>$('projectInput').click(),
  'events':()=>{ui.workspace='events';ui.tab='events';renderAll();},
  'mission':()=>missionEditor.show(),'preview':showPreview,'preview-tile':previewTile,
  'welcome-new':()=>{$('welcome').close();setProject(emptyProject(),'새 스테이지를 열었습니다.');},
  'welcome-open':()=>$('projectInput').click(),
  'welcome-resume':()=>{if(recoveredProject){$('welcome').close();setProject(recoveredProject,'작업을 복원했습니다.');}},
  'welcome-sample':()=>{$('welcome').close();setProject({...demoProject(),id:uid('stage')},'공간 설계 예시를 열었습니다. 실제 실행용 설계도는 포함되지 않습니다.');},
  'save':()=>{try{download(packStage(project),safeName(project.name)+'.esfile');toast('스테이지를 저장했습니다. 타일 원본은 tile 폴더의 상대 경로로 참조합니다.');}catch(error){toast(error.message,true);}},
  'tile-folder':()=>$('tileFolderInput').click(),
  'project':projectDialog,'help':helpDialog,'new-tile':newTileDialog,'new-room':newRoomDialog,'new-zone':newZoneDialog,'add-port':()=>portDialog(),'add-link':addLinkDialog,'coordinates':coordinateDialog,'validation':validationDialog,
  'close-dialog':()=>$('dialog').close(),
  'import-nbt':()=>{pendingAssetTileId=null;$('nbtInput').click();},
  'attach-asset':()=>{pendingAssetTileId=ui.selection?.id;$('nbtInput').click();},
  'undo':()=>{if(!undo.length)return;redo.push(clone(project));project=undo.pop();renderAll();scheduleSave();},
  'redo':()=>{if(!redo.length)return;undo.push(clone(project));project=redo.pop();renderAll();scheduleSave();},
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
  if(button.dataset.action){actions[button.dataset.action]?.();return;}
  if(button.dataset.tab){ui.tab=button.dataset.tab;ui.workspace=ui.tab==='events'?'events':'map';renderAll();return;}
  if(button.dataset.libraryTile){ui.workspace='map';const id=button.dataset.libraryTile;ui.selection={kind:'library',id};ui.brush={kind:'tile',id,rotation:0};ui.mode='paint';ui.view='plan';renderAll();if(innerWidth<620)$('libraryPanel').classList.remove('visible');return;}
  if(button.dataset.mode){ui.workspace='map';ui.mode=button.dataset.mode;if(ui.mode==='paint'&&ui.brush?.kind!=='tile'){ui.brush={kind:'tile',id:project.tiles[0]?.id,rotation:0};}ui.view='plan';renderAll();return;}
  if(button.dataset.view){ui.workspace='map';ui.view=button.dataset.view;renderAll();return;}
  if(button.dataset.floor!==undefined){ui.floor=Number(button.dataset.floor);renderFloors();map.draw();return;}
  if(button.dataset.gimmickType){ui.brush={kind:'gimmick',id:button.dataset.gimmickType};ui.mode='gimmick';ui.view='plan';renderAll();if(innerWidth<620)$('libraryPanel').classList.remove('visible');return;}
  if(button.dataset.room){ui.activeRoomId=button.dataset.room;selectTarget('room',button.dataset.room);return;}
  if(button.dataset.selectKind){selectTarget(button.dataset.selectKind,button.dataset.selectId);return;}
  if(button.dataset.editPort){portDialog(button.dataset.editPort);return;}
  if(button.dataset.removePort){const id=button.dataset.removePort;commit(p=>{const tile=p.tiles.find(t=>t.id===ui.selection.id);tile.ports=tile.ports.filter(port=>port.id!==id);});$('dialog').close();return;}
  if(button.dataset.deleteLink){commit(p=>p.links=p.links.filter(l=>l.id!==button.dataset.deleteLink));return;}
  if(button.dataset.issue!==undefined){const issue=validate(project)[Number(button.dataset.issue)];if(issue?.target){$('dialog').close();selectTarget(issue.target.kind,issue.target.id);}return;}
});
document.addEventListener('input',event=>{if(event.target.id==='tileSearch'){ui.search=event.target.value;renderTileList();}if(event.target.id==='areaSearch'){ui.areaSearch=event.target.value;renderAreaTree();}});
document.addEventListener('toggle',event=>{if(!event.target.matches?.('.area-folder'))return;const id=event.target.dataset.folder;if(event.target.open)closedAreas.delete(id);else closedAreas.add(id);},true);
document.addEventListener('dragstart',event=>{const row=event.target.closest('[data-tree-placement]');if(!row)return;draggedArea=row.dataset.treePlacement;event.dataTransfer.setData('application/x-erosion-area',draggedArea);event.dataTransfer.effectAllowed='move';});
document.addEventListener('dragover',event=>{if(draggedArea&&event.target.closest('.area-folder')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
document.addEventListener('drop',event=>{const room=event.target.closest('.area-folder')?.dataset.folder;if(!draggedArea||!room)return;event.preventDefault();const p=project.placements.find(p=>p.id===draggedArea);draggedArea=null;if(p&&p.roomId!==room){closedAreas.delete(room);ui.activeRoomId=room;moveTile({...p,roomId:room});}});
document.addEventListener('dragend',()=>{draggedArea=null;});
$('ghostToggle').addEventListener('change',event=>{ui.ghost=event.target.checked;map.draw();});
$('inspectorContent').addEventListener('change',event=>{
  const input=event.target,key=input.dataset.property,sel=ui.selection;if(!key||!sel)return;
  if(!input.checkValidity()){input.reportValidity();renderInspector();return;}
  const numeric=input.type==='number'||key==='rotation',value=input.dataset.valueKind==='lines'?input.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean):input.dataset.valueKind==='list'?[...input.selectedOptions].map(o=>o.value):['settings.wake','settings.requireAll','settings.unlockOnObjectives'].includes(key)?input.value==='true':numeric?Number(input.value):input.value;
  if(sel.kind==='placement'){
    const p=project.placements.find(p=>p.id===sel.id),next={...p,[key]:['x','z'].includes(key)?value/16:value};if(moveTile(next)&&key==='y'){ui.floor=value;renderFloors();map.draw();}return;
  }
  const collection={library:'tiles',gimmick:'gimmicks',room:'rooms',zone:'zones'}[sel.kind];if(!collection)return;
  if(sel.kind==='room'&&key==='code'&&project.rooms.some(r=>r.id!==sel.id&&r.code===value)){toast('이미 사용 중인 구역 번호입니다.',true);renderInspector();return;}
  const changed=commit(p=>{const item=p[collection].find(q=>q.id===sel.id),parts=key.split('.');if(parts.length===2)item[parts[0]][parts[1]]=value;else item[key]=value;});
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
    case 'r':event.preventDefault();if(ui.mode==='paint'&&ui.brush?.kind==='tile'){ui.brush.rotation=((ui.brush.rotation||0)+90)%360;map.draw();toast(`배치 방향 ${ui.brush.rotation}°`);}else actions.rotate();break;
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
globalThis.EROSIONSECTOR_EDITOR=Object.freeze({summary:()=>({placements:project.placements.length,gimmicks:project.gimmicks.length,rooms:project.rooms.length,programs:project.programs.length,workspace:ui.workspace,floor:ui.floor,view:ui.view,camera:map.cameraState(),preview:tilePreview.state(),issues:validate(project)}),snapshot:()=>clone(project)});
