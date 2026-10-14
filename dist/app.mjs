import {CELL,FACES,KINDS,uid,clone,tileOf,dimensions,bounds,placementError,portError,connections,validate,exportStage,demoProject,emptyProject,readProject,worldPoint} from './core.mjs';
import {inspectStructure} from './nbt.mjs';
import {createMap} from './map.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let project=demoProject();
const ui={floor:0,tab:'tiles',mode:'select',view:'plan',selection:null,brush:null,activeRoomId:'r1',ghost:true,search:''};
let undo=[],redo=[],saveTimer,toastTimer,pendingAssetTileId=null,modalSubmit=null,dbPromise=null,saveSequence=0;
const floorName=f=>f>=0?`${f+1}층`:`지하 ${Math.abs(f)}층`;
const directionName={north:'북쪽',east:'동쪽',south:'남쪽',west:'서쪽'};
const map=createMap($('map'),()=>({...ui,project}),{
  select:selection=>{ui.selection=selection;renderInspector();map.draw();},
  place:placeTile,move:moveTile,gimmick:placeGimmick,notify:toast,
  cancel:()=>{ui.mode='select';ui.brush=null;renderAll();},
  zoom:value=>$('zoomLabel').textContent=value+'%',
  cursor:(x,y,z)=>$('cursorStatus').textContent=`X ${x} · Z ${z} · 높이 ${y*8}`,
  camera:({azimuth,elevation,accelerated})=>{
    $('cameraAngle').textContent=`${Math.round(azimuth)}° · 높이 ${Math.round(elevation)}°`;
    $('map').dataset.renderer=accelerated?'depth':'fallback';
    $('cameraFallback').hidden=accelerated;
    const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
    $('northArrow').style.transform=`rotate(${Math.atan2(Math.sin(a),Math.cos(a)*Math.sin(e))*180/Math.PI}deg)`;
  }
});
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').className='toast show'+(error?' error':'');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function openDatabase(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error('자동 저장을 사용할 수 없습니다.'));
    const request=indexedDB.open('gtbo-stage-editor',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  return dbPromise;
}
async function writeAutoSave(){
  const sequence=++saveSequence,value=clone(project);
  try{const db=await openDatabase();await new Promise((resolve,reject)=>{const transaction=db.transaction('projects','readwrite');transaction.objectStore('projects').put(value,'current');transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
    if(sequence===saveSequence){$('saveStatus').textContent='자동 저장됨';$('saveStatus').className='save-status saved';}
  }catch{if(sequence===saveSequence){$('saveStatus').textContent='파일로 저장해 주세요';$('saveStatus').className='save-status';toast('브라우저 자동 저장에 실패했습니다. 프로젝트 저장으로 파일을 백업하세요.',true);}}
}
function scheduleSave(){clearTimeout(saveTimer);$('saveStatus').textContent='저장 중…';$('saveStatus').className='save-status';saveTimer=setTimeout(writeAutoSave,350);}
function commit(change,message){
  const next=clone(project);
  try{change(next);readProject(next);}catch(error){toast(error.message,true);return false;}
  undo.push(clone(project));if(undo.length>25)undo.shift();redo=[];project=next;renderAll();scheduleSave();if(message)toast(message);return true;
}
function setProject(value,message){try{project=readProject(value);}catch(error){toast(error.message,true);return;}
  undo=[];redo=[];ui.selection=null;ui.brush=null;ui.mode='select';ui.floor=0;ui.activeRoomId=project.rooms[0]?.id||'';renderAll();scheduleSave();requestAnimationFrame(()=>map.fit());if(message)toast(message);
}
function download(value,filename){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
const safeName=name=>(name||'stage').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,80);
function field(label,name,value,type='text',extra=''){return `<label class="field">${esc(label)}<input type="${type}" name="${esc(name)}" value="${esc(value)}" ${extra}></label>`;}
function selectField(label,name,value,items,extra=''){return `<label class="field">${esc(label)}<select name="${name}" ${extra}>${items.map(([id,title])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;}
function propField(label,name,value,type='text',extra=''){return field(label,name,value,type,`data-property="${esc(name)}" ${extra}`);}
function propSelect(label,name,value,items){return selectField(label,name,value,items,`data-property="${esc(name)}"`);}
function modal(title,body,submit,label='저장'){modalSubmit=submit;$('dialogTitle').textContent=title;$('dialogBody').innerHTML=body;$('dialogActions').innerHTML=`<button type="button" class="button" data-action="close-dialog">닫기</button>${submit?`<button type="submit" class="button primary">${esc(label)}</button>`:''}`;$('dialog').showModal();}
function confirmChange(title,message,callback){modal(title,`<p>${esc(message)}</p><div class="note subtle">현재 작업은 브라우저에 저장됩니다. 파일 백업이 필요하면 먼저 프로젝트 저장을 이용하세요.</div>`,()=>{callback();return true;},'계속');}
$('dialogForm').addEventListener('submit',event=>{event.preventDefault();if(modalSubmit){try{if(modalSubmit(new FormData(event.currentTarget))!==false)$('dialog').close();}catch(error){toast(error.message,true);}}});
function tileThumbnail(tile){const multi=tile.size.y>8,w=tile.size.x>16?64:42,d=tile.size.z>16?30:20;
  return `<svg viewBox="0 0 120 68" aria-hidden="true"><g transform="translate(60 23)"><path d="M0 ${-d/2} L${w/2} 0 L0 ${d/2} L${-w/2} 0Z" fill="#879c92" stroke="#bbccbc" stroke-width=".7"/><path d="M${-w/2} 0 L0 ${d/2} L0 ${d/2+18} L${-w/2} 18Z" fill="#3c5559" stroke="#8aa19b" stroke-width=".6"/><path d="M0 ${d/2} L${w/2} 0 L${w/2} 18 L0 ${d/2+18}Z" fill="#526b6a" stroke="#9db4a7" stroke-width=".6"/>${multi?`<path d="M${-w/2} 9 L0 ${d/2+9} L${w/2} 9" fill="none" stroke="#c9d6b8" stroke-width="1"/>`:''}<path d="M${w/4} ${d/4+5} v10 l6 -3 v-10Z" fill="#16232b" stroke="#bcd5b7" stroke-width=".8"/></g></svg>`;}
function renderLibrary(){
  document.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===ui.tab)));
  if(ui.tab==='tiles'){
    $('libraryContent').innerHTML=`<button class="button full" data-action="import-nbt">↑ Create 설계도 가져오기</button><div style="height:12px"></div><input class="search" id="tileSearch" placeholder="타일 이름 검색…" aria-label="타일 이름 검색" value="${esc(ui.search)}"><div class="section-label"><span>타일 라이브러리</span><span>${project.tiles.length}</span></div><div id="tileList"></div><button class="subtle-button" data-action="new-tile">＋ 설계용 타일 만들기</button>`;
    renderTileList();
  }else if(ui.tab==='gimmicks'){
    $('libraryContent').innerHTML=`<div class="section-label"><span>기믹 배치</span><span>${project.gimmicks.length}</span></div><small>기믹을 고른 뒤 배치도에서 타일 내부를 클릭하세요.</small><div style="height:14px"></div>${Object.entries(KINDS).map(([type,kind])=>`<button class="gimmick-card ${ui.brush?.kind==='gimmick'&&ui.brush.id===type?'selected':''}" data-gimmick-type="${type}"><span class="gimmick-icon" style="color:${kind.color}">${kind.icon}</span><div><strong>${kind.label}</strong><small>${{spawn:'참가자의 시작 위치',terminal:'상호작용으로 목표 완료',alarm:'방어전과 장치 활성화',wave:'적 종류와 수량 지정',supply:'보급 수량과 지점 설정',extraction:'임무 종료 후 집결',trigger:'범위 진입으로 이벤트 발생'}[type]}</small></div></button>`).join('')}<div class="divider"></div><div class="section-label">배치된 기믹</div>${project.gimmicks.map(g=>`<button class="room-card ${ui.selection?.id===g.id?'selected':''}" data-select-kind="gimmick" data-select-id="${esc(g.id)}"><span style="color:${KINDS[g.type].color}">${KINDS[g.type].icon}</span><div><strong>${esc(g.name)}</strong><small>${esc(KINDS[g.type].label)}</small></div></button>`).join('')}`;
  }else{
    $('libraryContent').innerHTML=`<div class="action-row"><button class="button" data-action="new-room">＋ 방</button><button class="button" data-action="new-zone">＋ 구역</button></div><small>방을 선택하면 새 타일을 해당 방에 배치합니다.</small><div style="height:16px"></div>${project.zones.map(zone=>`<div class="rooms-zone"><div class="zone-heading"><i class="room-swatch" style="background:${zone.color};height:8px"></i>${esc(zone.name)}<button class="icon-button" data-select-kind="zone" data-select-id="${esc(zone.id)}" aria-label="${esc(zone.name)} 편집">⋯</button></div>${project.rooms.filter(r=>r.zoneId===zone.id).map(room=>`<button class="room-card ${ui.activeRoomId===room.id?'selected':''}" data-room="${esc(room.id)}"><i class="room-swatch" style="background:${room.color}"></i><div><strong>${esc(room.code)} · ${esc(room.name)}</strong><small>${project.placements.filter(p=>p.roomId===room.id).length}개 타일</small></div></button>`).join('')}</div>`).join('')}`;
  }
}
function renderTileList(){
  if(!$('tileList'))return;
  const tiles=project.tiles.filter(t=>(t.name+' '+t.category).toLowerCase().includes(ui.search.toLowerCase()));
  $('tileList').innerHTML=tiles.map(tile=>`<button class="tile-card ${ui.brush?.id===tile.id?'selected':''}" data-library-tile="${esc(tile.id)}"><div class="tile-preview"><span class="tile-kind">${esc(tile.category)}</span><span class="tile-status ${tile.asset?'real':''}">${tile.asset?'NBT 연결됨':'설계용'}</span>${tileThumbnail(tile)}</div><div class="tile-info"><div><strong>${esc(tile.name)}</strong><small>${tile.size.x} × ${tile.size.z} × 높이 ${tile.size.y} · 문 ${tile.ports.length}</small></div><span class="tile-dots">↗</span></div></button>`).join('')||'<div class="empty-state">검색 결과가 없습니다.</div>';
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
  $('projectName').textContent=project.name;$('projectSummary').innerHTML=`<span>타일<b>${project.placements.length}</b></span><span>방<b>${project.rooms.length}</b></span><span>기믹<b>${project.gimmicks.length}</b></span>`;
  document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===ui.mode));
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===ui.view));
  document.querySelector('[data-action=undo]').disabled=!undo.length;document.querySelector('[data-action=redo]').disabled=!redo.length;
  const issues=validate(project),errors=issues.filter(i=>i.severity==='error').length,warnings=issues.filter(i=>i.severity==='warning').length;
  $('validationSummary').textContent=errors?`⊗ 수정 필요 ${errors} · 주의 ${warnings}`:warnings?`△ 설계도 연결 등 확인 ${warnings}`:'✓ 배치 검사 통과';
  $('validationSummary').className='validation-summary '+(errors?'error':warnings?'':'good');
  renderLibrary();renderFloors();renderInspector();map.draw();
}
function renderInspector(){
  const sel=ui.selection,container=$('inspectorContent');
  $('inspectorLabel').textContent=sel?sel.kind.toUpperCase():'STAGE';
  if(sel?.kind==='placement'){
    const p=project.placements.find(p=>p.id===sel.id),t=p&&tileOf(project,p);if(!t){ui.selection=null;return renderInspector();}
    const d=dimensions(t,p.rotation),room=project.rooms.find(r=>r.id===p.roomId),net=connections(project);
    container.innerHTML=`<div class="inspect-kicker">TILE INSTANCE</div><h3 class="inspect-title">${esc(p.name||t.name)}</h3><p class="inspect-description">${esc(room?.code||'방 미지정')} · ${d.x/16} × ${d.z/16}칸 · 높이 ${d.y/8}칸</p>${propField('배치 이름','name',p.name,'text','maxlength="80" placeholder="타일 이름 사용"')}<div class="field-row triple">${propField('X','x',p.x,'number','step="1" min="-1024" max="1024"')}${propField('층 높이','y',p.y,'number','step="1" min="-1024" max="1024"')}${propField('Z','z',p.z,'number','step="1" min="-1024" max="1024"')}</div>${propSelect('회전','rotation',p.rotation,[0,90,180,270].map(n=>[n,n+'°']))}${propSelect('소속 방','roomId',p.roomId,project.rooms.map(r=>[r.id,r.code+' · '+r.name]))}<div class="action-row"><button class="button" data-action="rotate">↻ 회전</button><button class="button" data-action="duplicate">복제</button><button class="button danger" data-action="delete">삭제</button></div><div class="divider"></div><div class="section-title"><span>문 연결</span><span class="badge">${t.ports.length}개</span></div>${t.ports.map(port=>`<div class="port-row"><span class="port-dot" style="background:${net.connected.has(p.id+':'+port.id)?'#b8dcae':'#d5a06b'}"></span><div><strong>${esc(port.name)}</strong><small>${directionName[port.facing]} · ${floorName(p.y+Math.floor(port.y/8))} · ${net.connected.has(p.id+':'+port.id)?'연결됨':port.required?'연결 필수':'미연결 허용'}</small></div></div>`).join('')||'<small>원본 타일에서 연결구를 설정하세요.</small>'}<button class="subtle-button" data-select-kind="library" data-select-id="${esc(t.id)}">타일 원본과 연결구 편집 →</button><div class="note subtle">이 타일은 ${floorName(p.y)}${d.y>8?'~'+floorName(p.y+d.y/8-1):''}을 점유합니다. 이동·회전·삭제는 모든 층에 함께 적용됩니다.</div>`;
  }else if(sel?.kind==='library'){
    const t=project.tiles.find(t=>t.id===sel.id);if(!t){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">TILE SOURCE</div><h3 class="inspect-title">${esc(t.name)}</h3><p class="inspect-description">X ${t.size.x} × Z ${t.size.z} × 높이 ${t.size.y}블록</p>${propField('타일 이름','name',t.name,'text','required maxlength="80"')}${propField('분류','category',t.category,'text','maxlength="40"')}<button class="button full" data-action="coordinates">좌표로 배치</button><div class="divider"></div><div class="section-title"><span>Create 설계도</span><span class="badge">${t.asset?'연결됨':'설계용'}</span></div><button class="button full" data-action="attach-asset">${t.asset?'설계도 교체':'설계도 파일 연결'} ↑</button>${t.asset?`<div class="asset-stats" style="margin-top:10px">${esc(t.asset.name)}<br>블록 ${t.asset.blockCount.toLocaleString()} · 재질 ${t.asset.paletteCount} · 문 마커 ${t.asset.markerCount}<br>포함 네임스페이스: ${esc(t.asset.namespaces.join(', '))}<br><code>SHA-256 ${esc(t.asset.sha256.slice(0,16))}…</code></div>`:'<div class="note warning">배치 설계용 타일입니다. 실제 건축물을 사용하려면 같은 크기의 .nbt 설계도를 연결하세요.</div>'}<div class="divider"></div><div class="section-title"><span>문 연결구</span><button class="subtle-button" data-action="add-port">＋ 추가</button></div>${t.ports.map(port=>`<div class="port-row"><div><strong>${esc(port.name)}</strong><small>${directionName[port.facing]} · 높이 ${port.y} · ${port.width}×${port.height} · ${port.required?'필수':'선택'}</small></div><button class="icon-button" data-edit-port="${esc(port.id)}" aria-label="${esc(port.name)} 편집">⋯</button></div>`).join('')||'<small>문 연결구가 없습니다. 추가하거나 마커가 포함된 설계도를 가져오세요.</small>'}<div class="note subtle">연결구 수정은 이 원본을 사용하는 모든 타일에 적용됩니다. 현재 GTBO 모드에는 문 마커 블록이 아직 추가되지 않았습니다.</div><button class="subtle-button" data-action="delete-library">사용하지 않는 원본 삭제</button>`;
  }else if(sel?.kind==='gimmick'){
    const g=project.gimmicks.find(g=>g.id===sel.id);if(!g){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">GIMMICK · ${esc(KINDS[g.type].label)}</div><h3 class="inspect-title">${esc(g.name)}</h3>${propField('표시 이름','name',g.name,'text','required maxlength="80"')}${propSelect('소속 타일','placementId',g.placementId,project.placements.map(p=>[p.id,(project.rooms.find(r=>r.id===p.roomId)?.code||'미지정')+' · '+(p.name||tileOf(project,p)?.name||'타일')]))}<div class="section-title">타일 내부 좌표 · 블록 단위</div><div class="field-row triple">${['x','y','z'].map(k=>propField(k.toUpperCase(),'position.'+k,g.position[k],'number','step="0.5" min="0" max="255"')).join('')}</div>${['wave','supply','spawn'].includes(g.type)?propField(g.type==='spawn'?'시작 인원':'수량','settings.count',g.settings.count??1,'number','min="1" max="999"'):''}${['terminal','alarm','extraction'].includes(g.type)?propField('지속 시간 · 초','settings.duration',g.settings.duration??10,'number','min="1" max="3600"'):''}${g.type==='wave'?propField('적 엔티티 ID','settings.entity',g.settings.entity||'minecraft:zombie','text','maxlength="120"'):''}<div class="divider"></div><div class="section-title"><span>이벤트 연결</span><button class="subtle-button" data-action="add-link">＋ 추가</button></div>${project.links.filter(l=>l.from===g.id).map(l=>`<div class="link-row"><div><strong>→ ${esc(project.gimmicks.find(q=>q.id===l.to)?.name||'없는 대상')}</strong><small>${esc(l.event)} → ${esc(l.action)}</small></div><button class="icon-button" data-delete-link="${esc(l.id)}" aria-label="연결 삭제">×</button></div>`).join('')||'<small>이 기믹에서 발생하는 이벤트를 다른 기믹에 연결할 수 있습니다.</small>'}<div class="divider"></div><button class="button danger full" data-action="delete">기믹 삭제</button><div class="note subtle">기믹 위치·설정·연결을 설계합니다. 실제 게임의 기믹 동작은 후속 연동 대상입니다.</div>`;
  }else if(sel?.kind==='room'){
    const r=project.rooms.find(r=>r.id===sel.id);if(!r){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">ROOM</div><h3 class="inspect-title">${esc(r.code)} · ${esc(r.name)}</h3>${propField('표시 번호','code',r.code,'text','required maxlength="40"')}${propField('방 이름','name',r.name,'text','required maxlength="80"')}${propSelect('소속 구역','zoneId',r.zoneId,project.zones.map(z=>[z.id,z.name]))}${propField('지도 색상','color',r.color,'color')}<div class="asset-stats">고유 ID: <code>${esc(r.id)}</code><br>이 ID는 표시 번호를 바꿔도 유지됩니다.</div><div class="divider"></div><div class="section-title">소속 타일</div>${project.placements.filter(p=>p.roomId===r.id).map(p=>`<button class="room-card" data-select-kind="placement" data-select-id="${esc(p.id)}"><div><strong>${esc(p.name||tileOf(project,p)?.name)}</strong><small>X ${p.x} · Z ${p.z} · ${floorName(p.y)}</small></div></button>`).join('')||'<small>새 타일을 배치하거나 타일 속성에서 이 방을 지정하세요.</small>'}`;
  }else if(sel?.kind==='zone'){
    const z=project.zones.find(z=>z.id===sel.id);if(!z){ui.selection=null;return renderInspector();}
    container.innerHTML=`<div class="inspect-kicker">ZONE</div><h3 class="inspect-title">${esc(z.name)}</h3>${propField('구역 이름','name',z.name,'text','required maxlength="80"')}${propField('구역 색상','color',z.color,'color')}<div class="note subtle">방은 소속 구역으로 묶입니다. 방의 세부 색상은 방 속성에서 설정합니다.</div>`;
  }else{
    const network=connections(project);container.innerHTML=`<div class="inspect-kicker">STAGE OVERVIEW</div><h3 class="inspect-title">${esc(project.name)}</h3><p class="inspect-description">${esc(project.description||'프로젝트 설정에서 임무 설명을 입력하세요.')}</p><div class="metric-grid"><div class="metric"><small>배치된 타일</small><b>${project.placements.length}<span style="font-size:10px;color:#8298a5"> 개</span></b></div><div class="metric"><small>연결된 문</small><b>${network.pairs.length}<span style="font-size:10px;color:#8298a5"> 쌍</span></b></div></div><button class="button full" data-action="project">스테이지 설정</button><div class="divider"></div><div class="section-title">임무 흐름</div>${project.gimmicks.filter(g=>['spawn','alarm','terminal','extraction'].includes(g.type)).map((g,i)=>`<button class="room-card" data-select-kind="gimmick" data-select-id="${esc(g.id)}"><span class="flow-number">${i+1}</span><div><strong>${esc(g.name)}</strong><small>${esc(KINDS[g.type].label)}</small></div></button>`).join('')||'<small>기믹 탭에서 시작점과 목표를 추가하세요.</small>'}<div class="divider"></div><div class="section-title">작업 순서</div><div class="flow-item"><span class="flow-number">1</span><div><strong>타일 배치</strong><small>라이브러리에서 고른 후 격자를 클릭</small></div></div><div class="flow-item"><span class="flow-number">2</span><div><strong>층과 문 연결 확인</strong><small>높이가 같은 연결구끼리 자동 판정</small></div></div><div class="flow-item"><span class="flow-number">3</span><div><strong>기믹과 임무 흐름 지정</strong><small>장치를 놓고 이벤트 연결</small></div></div><div class="note warning">현재 예시 타일은 공간 설계용입니다. 게임에서 실행하려면 실제 설계도와 GTBO 실행 연동이 필요합니다.</div>`;
  }
}
function placeTile(x,y,z){
  if(ui.brush?.kind!=='tile'){toast('라이브러리에서 타일을 먼저 선택하세요.');return;}
  const p={id:uid('placement'),tileId:ui.brush.id,x,y,z,rotation:ui.brush.rotation||0,roomId:ui.activeRoomId||project.rooms[0]?.id||'',name:''};
  const error=placementError(project,p);if(error){toast(error,true);return;}
  ui.selection={kind:'placement',id:p.id};commit(pj=>pj.placements.push(p));
}
function moveTile(p){const error=placementError(project,p);if(error){toast(error,true);return false;}return commit(pj=>{pj.placements[pj.placements.findIndex(q=>q.id===p.id)]=p;});}
function placeGimmick(placement,position){
  const type=ui.brush.id,g={id:uid('gimmick'),type,name:KINDS[type].label,placementId:placement.id,
    position:Object.fromEntries(Object.entries(position).map(([k,v])=>[k,Math.floor(v*2)/2])),settings:{count:type==='spawn'?4:1,duration:10,...(type==='wave'?{entity:'minecraft:zombie'}:{})}};
  ui.selection={kind:'gimmick',id:g.id};ui.mode='select';ui.brush=null;commit(pj=>pj.gimmicks.push(g));
}
function selectTarget(kind,id){ui.selection={kind,id};ui.mode='select';if(kind==='placement'){const p=project.placements.find(p=>p.id===id);if(p){ui.floor=p.y;map.focus(p);}}else if(kind==='gimmick'){const g=project.gimmicks.find(g=>g.id===id),p=project.placements.find(p=>p.id===g?.placementId),t=p&&tileOf(project,p);if(t){ui.floor=Math.floor(worldPoint(g.position,t,p).y/8);map.focus(p);}}renderAll();if(innerWidth<950)$('inspectorPanel').classList.add('visible');}
function projectDialog(){modal('스테이지 설정',`${field('스테이지 이름','name',project.name,'text','required maxlength="80"')}<label class="field">임무 설명<textarea name="description" maxlength="3000">${esc(project.description)}</textarea></label><div class="field-row">${field('최소 인원','minPlayers',project.minPlayers,'number','required min="1" max="16"')}${field('최대 인원','maxPlayers',project.maxPlayers,'number','required min="1" max="16"')}</div>`,data=>commit(p=>{p.name=data.get('name').trim();p.description=data.get('description');p.minPlayers=Number(data.get('minPlayers'));p.maxPlayers=Number(data.get('maxPlayers'));}));}
function newTileDialog(){modal('설계용 타일 만들기',`${field('타일 이름','name','새 타일','text','required maxlength="80"')}<div class="field-row triple">${field('X 칸 수','x',1,'number','required min="1" max="16" step="1"')}${field('높이 칸 수','y',1,'number','required min="1" max="32" step="1"')}${field('Z 칸 수','z',1,'number','required min="1" max="16" step="1"')}</div><div class="note subtle">1칸 = X 16 × Y 8 × Z 16블록. 건축물 없이 배치부터 설계하고 같은 크기의 Create 설계도를 나중에 연결할 수 있습니다.</div>`,data=>{const t={id:uid('tile'),name:data.get('name').trim(),category:'설계용',size:{x:Number(data.get('x'))*16,y:Number(data.get('y'))*8,z:Number(data.get('z'))*16},ports:[],asset:null};ui.selection={kind:'library',id:t.id};ui.brush={kind:'tile',id:t.id,rotation:0};ui.mode='paint';return commit(p=>p.tiles.push(t));},'타일 만들기');}
function portDialog(id=null){
  const t=project.tiles.find(t=>t.id===ui.selection?.id);if(!t)return;
  const existing=t.ports.find(p=>p.id===id),p=existing||{id:uid('port'),name:'새 연결구',facing:'east',x:t.size.x,y:1,z:8,width:2,height:3,required:true};
  modal(existing?'문 연결구 편집':'문 연결구 추가',`${field('연결구 이름','name',p.name,'text','required maxlength="80"')}${selectField('방향','facing',p.facing,FACES.map(f=>[f,directionName[f]]))}<div class="field-row triple">${field('X','x',p.x,'number','required step="0.5" min="0"')}${field('높이 Y','y',p.y,'number','required step="0.5" min="0"')}${field('Z','z',p.z,'number','required step="0.5" min="0"')}</div><div class="field-row">${field('문 폭','width',p.width,'number','required min="1" max="64" step="1"')}${field('문 높이','height',p.height,'number','required min="1" max="32" step="1"')}</div><label><input type="checkbox" name="required" ${p.required?'checked':''}> 이 문은 반드시 다른 타일과 연결</label><div class="note subtle">좌표는 타일 원점 기준 블록 단위입니다. 동쪽 X=${t.size.x}, 서쪽 X=0, 남쪽 Z=${t.size.z}, 북쪽 Z=0에 놓습니다. 가로 좌표는 문의 중심, Y는 문 아래쪽 높이입니다.</div>${existing?`<button type="button" class="button danger" data-remove-port="${esc(existing.id)}">연결구 삭제</button>`:''}`,data=>{
    const next={...p,name:data.get('name').trim(),facing:data.get('facing'),required:data.has('required')};for(const k of ['x','y','z','width','height'])next[k]=Number(data.get(k));
    const error=portError(t,next);if(error){toast(error,true);return false;}
    return commit(pj=>{const tile=pj.tiles.find(q=>q.id===t.id);if(existing)tile.ports[tile.ports.findIndex(q=>q.id===id)]=next;else tile.ports.push(next);});
  });
}
function newRoomDialog(){modal('방 만들기',`${field('방 번호','code','A-'+String(project.rooms.length+101),'text','required maxlength="40"')}${field('방 이름','name','새 방','text','required maxlength="80"')}${selectField('소속 구역','zoneId',project.zones[0]?.id||'',project.zones.map(z=>[z.id,z.name]))}${field('지도 색상','color','#819e94','color')}`,data=>{
  if(project.rooms.some(r=>r.code===data.get('code').trim())){toast('이미 사용 중인 방 번호입니다.',true);return false;}
  const room={id:uid('room'),code:data.get('code').trim(),name:data.get('name').trim(),zoneId:data.get('zoneId'),color:data.get('color')};ui.activeRoomId=room.id;ui.selection={kind:'room',id:room.id};return commit(p=>p.rooms.push(room));});}
function newZoneDialog(){modal('구역 만들기',`${field('구역 이름','name','새 구역','text','required maxlength="80"')}${field('구역 색상','color','#8398b1','color')}`,data=>{const zone={id:uid('zone'),name:data.get('name').trim(),color:data.get('color')};ui.selection={kind:'zone',id:zone.id};return commit(p=>p.zones.push(zone));});}
function addLinkDialog(){const from=ui.selection?.id,targets=project.gimmicks.filter(g=>g.id!==from);if(!targets.length){toast('연결할 기믹을 먼저 하나 더 배치하세요.');return;}
  modal('기믹 이벤트 연결',`${selectField('발생 이벤트','event','상호작용',['상호작용','범위 진입','목표 완료','방어전 종료'].map(v=>[v,v]))}${selectField('대상 기믹','to',targets[0].id,targets.map(g=>[g.id,g.name+' · '+KINDS[g.type].label]))}${selectField('실행 동작','action','활성화',['활성화','비활성화','목표 완료 처리'].map(v=>[v,v]))}`,data=>commit(p=>p.links.push({id:uid('link'),from,to:data.get('to'),event:data.get('event'),action:data.get('action')})));
}
function coordinateDialog(){const tile=project.tiles.find(t=>t.id===ui.brush?.id)||project.tiles.find(t=>t.id===ui.selection?.id);if(!tile)return;modal('좌표로 타일 배치',`<p>${esc(tile.name)}</p><div class="field-row triple">${field('X','x',0,'number','required min="-1024" max="1024" step="1"')}${field('층 높이','y',ui.floor,'number','required min="-1024" max="1024" step="1"')}${field('Z','z',0,'number','required min="-1024" max="1024" step="1"')}</div>${selectField('회전','rotation',0,[0,90,180,270].map(a=>[a,a+'°']))}${selectField('소속 방','roomId',ui.activeRoomId,project.rooms.map(r=>[r.id,r.code+' · '+r.name]))}`,data=>{
    const p={id:uid('placement'),tileId:tile.id,x:Number(data.get('x')),y:Number(data.get('y')),z:Number(data.get('z')),rotation:Number(data.get('rotation')),roomId:data.get('roomId'),name:''},error=placementError(project,p);
    if(error){toast(error,true);return false;}ui.selection={kind:'placement',id:p.id};ui.floor=p.y;return commit(pj=>pj.placements.push(p));},'배치');}
function validationDialog(){const issues=validate(project),errors=issues.filter(i=>i.severity==='error').length;modal('스테이지 검사',`<p>${errors?`수정할 항목이 ${errors}개 있습니다.`:'공간 배치와 기믹 참조를 검사했습니다.'}</p>${issues.map((i,index)=>`<button type="button" class="issue ${i.severity}" data-issue="${index}"><span>${{error:'⊗',warning:'△',info:'ⓘ'}[i.severity]}</span><span>${esc(i.message)}</span></button>`).join('')}`,null);}
function helpDialog(){modal('GTBO 제작 가이드',`<p>Create 설계도로 만든 공간을 타일로 등록하고, 방과 기믹을 조립하는 도구입니다.</p><div class="section-title">타일 제작과 가져오기</div><p>Create에서 영역을 저장하세요. 크기는 <b>X/Z 16, Y 8의 배수</b>여야 합니다. 타일 탭의 ‘설계도 가져오기’에서 .nbt를 선택합니다. 파일은 브라우저에서 읽으며 프로젝트에 원본 데이터를 보관합니다.</p><p>현재 GTBO 모드에는 문 마커가 아직 없습니다. 이 앱에서는 연결구를 수동 편집할 수 있고, 향후 <code>gtbo:door_marker</code>가 포함된 파일을 읽는 규약도 준비되어 있습니다.</p><div class="section-title">배치와 복층</div><p>타일을 고르고 격자를 클릭하세요. <span class="guide-key">V</span> 선택, <span class="guide-key">B</span> 배치, <span class="guide-key">R</span> 수평 회전, <span class="guide-key">Del</span> 삭제입니다. 휠로 확대하고 Space+드래그로 화면을 이동합니다. 속성에서 좌표를 입력할 수도 있습니다.</p><p>층 탭은 같은 입체 타일을 높이 8블록 단위로 나눠 보여줍니다. 위아래 공간이 겹치지 않으면 같은 XZ에 배치할 수 있습니다. 문은 동서남북으로만 연결되며 실제 위치와 크기가 맞아야 합니다.</p><div class="section-title">저장과 실행</div><p>프로젝트는 브라우저에 자동 저장됩니다. ‘프로젝트 저장’은 설계도 원본까지 포함하는 백업 파일이고, ‘스테이지 내보내기’는 배치·방·기믹 설정을 담은 초안 파일입니다.</p><div class="note warning">이 앱은 배치 설계 도구입니다. 블록 외형을 정확하게 렌더링하지 않으며, 현재 모드에서 스테이지 실행·기믹 동작은 아직 지원하지 않습니다. 사이트와 로컬 앱의 자동 저장 공간은 서로 다르므로 파일로 이동하세요.</div>`,null);}
const actions={
  'new':()=>confirmChange('새 프로젝트','현재 작업 대신 빈 스테이지를 엽니다.',()=>setProject(emptyProject(),'빈 프로젝트를 열었습니다.')),
  'sample':()=>confirmChange('예시 스테이지','A1 · 잠든 관측소의 예시 구성을 엽니다.',()=>setProject(demoProject(),'예시 스테이지를 열었습니다.')),
  'open':()=>$('projectInput').click(),
  'save':()=>{download(project,safeName(project.name)+'.gtboproject.json');toast('설계도 원본을 포함한 프로젝트 파일을 저장했습니다.');},
  'export':()=>{download(exportStage(project),safeName(project.name)+'.gtbostage.json');toast('스테이지 설계 초안을 내보냈습니다. 게임 실행 연동은 아직 필요합니다.');},
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
  'camera-left':()=>map.rotateCamera(-45),'camera-right':()=>map.rotateCamera(45),'camera-reset':()=>map.resetCamera(),
  'toggle-library':()=>$('libraryPanel').classList.toggle('visible'),'toggle-inspector':()=>$('inspectorPanel').classList.toggle('visible'),
  'close-library':()=>$('libraryPanel').classList.remove('visible'),'close-inspector':()=>$('inspectorPanel').classList.remove('visible')
};
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.action){actions[button.dataset.action]?.();return;}
  if(button.dataset.tab){ui.tab=button.dataset.tab;renderLibrary();return;}
  if(button.dataset.libraryTile){const id=button.dataset.libraryTile;ui.selection={kind:'library',id};ui.brush={kind:'tile',id,rotation:0};ui.mode='paint';ui.view='plan';renderAll();if(innerWidth<620)$('libraryPanel').classList.remove('visible');return;}
  if(button.dataset.mode){ui.mode=button.dataset.mode;if(ui.mode==='paint'&&ui.brush?.kind!=='tile'){ui.brush={kind:'tile',id:project.tiles[0]?.id,rotation:0};}ui.view='plan';renderAll();return;}
  if(button.dataset.view){ui.view=button.dataset.view;renderAll();return;}
  if(button.dataset.floor!==undefined){ui.floor=Number(button.dataset.floor);renderFloors();map.draw();return;}
  if(button.dataset.gimmickType){ui.brush={kind:'gimmick',id:button.dataset.gimmickType};ui.mode='gimmick';ui.view='plan';renderAll();if(innerWidth<620)$('libraryPanel').classList.remove('visible');return;}
  if(button.dataset.room){ui.activeRoomId=button.dataset.room;selectTarget('room',button.dataset.room);return;}
  if(button.dataset.selectKind){selectTarget(button.dataset.selectKind,button.dataset.selectId);return;}
  if(button.dataset.editPort){portDialog(button.dataset.editPort);return;}
  if(button.dataset.removePort){const id=button.dataset.removePort;commit(p=>{const tile=p.tiles.find(t=>t.id===ui.selection.id);tile.ports=tile.ports.filter(port=>port.id!==id);});$('dialog').close();return;}
  if(button.dataset.deleteLink){commit(p=>p.links=p.links.filter(l=>l.id!==button.dataset.deleteLink));return;}
  if(button.dataset.issue!==undefined){const issue=validate(project)[Number(button.dataset.issue)];if(issue?.target){$('dialog').close();selectTarget(issue.target.kind,issue.target.id);}return;}
});
document.addEventListener('input',event=>{if(event.target.id==='tileSearch'){ui.search=event.target.value;renderTileList();}});
$('ghostToggle').addEventListener('change',event=>{ui.ghost=event.target.checked;map.draw();});
$('inspectorContent').addEventListener('change',event=>{
  const input=event.target,key=input.dataset.property,sel=ui.selection;if(!key||!sel)return;
  if(!input.checkValidity()){input.reportValidity();renderInspector();return;}
  const numeric=input.type==='number'||key==='rotation',value=numeric?Number(input.value):input.value;
  if(sel.kind==='placement'){
    const p=project.placements.find(p=>p.id===sel.id),next={...p,[key]:value};if(moveTile(next)&&key==='y'){ui.floor=value;renderFloors();map.draw();}return;
  }
  const collection={library:'tiles',gimmick:'gimmicks',room:'rooms',zone:'zones'}[sel.kind];if(!collection)return;
  if(sel.kind==='room'&&key==='code'&&project.rooms.some(r=>r.id!==sel.id&&r.code===value)){toast('이미 사용 중인 방 번호입니다.',true);renderInspector();return;}
  const changed=commit(p=>{const item=p[collection].find(q=>q.id===sel.id),parts=key.split('.');if(parts.length===2)item[parts[0]][parts[1]]=value;else item[key]=value;});
  if(!changed)renderInspector();
});
$('nbtInput').addEventListener('change',async event=>{
  const files=[...event.target.files],target=pendingAssetTileId;pendingAssetTileId=null;
  for(const file of (target?files.slice(0,1):files)){
    try{toast(`${file.name} 읽는 중…`);const tile=await inspectStructure(await file.arrayBuffer(),file.name);
      if(target){const old=project.tiles.find(t=>t.id===target);if(!old)throw new Error('교체할 타일이 없습니다.');if(['x','y','z'].some(k=>old.size[k]!==tile.size[k]))throw new Error('기존 타일과 설계도의 크기가 다릅니다. 새 타일로 가져오세요.');
        commit(p=>{const t=p.tiles.find(t=>t.id===target);t.asset=tile.asset;if(tile.ports.length)t.ports=tile.ports;},'설계도 원본을 연결했습니다.');
      }else{ui.selection={kind:'library',id:tile.id};ui.brush={kind:'tile',id:tile.id,rotation:0};ui.tab='tiles';ui.mode='paint';commit(p=>p.tiles.push(tile),tile.asset.markerCount?'설계도와 문 마커를 가져왔습니다.':'설계도를 가져왔습니다. 문 연결구를 수동 설정할 수 있습니다.');}
    }catch(error){toast(file.name+': '+error.message,true);}
  }
  event.target.value='';
});
$('projectInput').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>64*1024*1024)throw new Error('프로젝트는 64MB 이하로 가져오세요.');const value=readProject(await file.text());setProject(value,'프로젝트를 불러왔습니다.');}catch(error){toast(error.message,true);}event.target.value='';});
window.addEventListener('keydown',event=>{
  if($('dialog').open)return;
  const editable=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(editable)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();actions.save();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();actions[event.shiftKey?'redo':'undo']();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();actions.redo();return;}
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  switch(event.key.toLowerCase()){
    case 'v':ui.mode='select';renderAll();break;
    case 'b':ui.mode='paint';if(ui.brush?.kind!=='tile')ui.brush={kind:'tile',id:project.tiles[0]?.id,rotation:0};ui.view='plan';renderAll();break;
    case 'r':event.preventDefault();if(ui.mode==='paint'&&ui.brush?.kind==='tile'){ui.brush.rotation=((ui.brush.rotation||0)+90)%360;map.draw();toast(`배치 방향 ${ui.brush.rotation}°`);}else actions.rotate();break;
    case 'd':actions.duplicate();break;
    case 'delete':case 'backspace':event.preventDefault();actions.delete();break;
    case 'escape':ui.mode='select';ui.brush=null;ui.selection=null;renderAll();break;
  }
});
renderAll();
try{const db=await openDatabase();const saved=await new Promise((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').get('current');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});if(saved){project=readProject(saved);ui.activeRoomId=project.rooms[0]?.id||'';renderAll();requestAnimationFrame(()=>map.fit());}$('saveStatus').textContent='자동 저장 준비';$('saveStatus').className='save-status saved';}catch{toast('자동 저장을 사용할 수 없습니다. 프로젝트 파일로 저장해 주세요.',true);$('saveStatus').textContent='파일 저장 사용';}
// Read-only diagnostics expose counts for local browser QA without changing editor state.
globalThis.GTBO_EDITOR=Object.freeze({summary:()=>({placements:project.placements.length,gimmicks:project.gimmicks.length,rooms:project.rooms.length,floor:ui.floor,view:ui.view,camera:map.cameraState(),issues:validate(project)}),snapshot:()=>clone(project)});
