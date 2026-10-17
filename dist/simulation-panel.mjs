import {createSimulation} from './simulation.mjs';
import {BLOCKS,targetOptions,programIssues} from './logic.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={on:'켜짐',off:'꺼짐',blink:'깜빡임',active:'진행 중',paused:'일시정지',stopped:'정지',complete:'완료'};
const inputTypes=Object.entries(BLOCKS).filter(([k,d])=>d.category==='trigger'&&!['when.start','when.all','when.any'].includes(k));
export function createSimulationPanel({getProject,modal,body,navigate}){
  let sim=null,project=null,type='when.scan',target='',value='complete';
  const options=(items,selected)=>items.map(([id,name])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(name)}</option>`).join('');
  function render(){if(!sim)return;const s=sim.snapshot(),def=BLOCKS[type],targetField=Object.values(def.fields).find(f=>!['text','choice','number'].includes(f.kind));
    const targets=targetField?targetOptions(project,targetField.kind):[];if(!targets.some(([id])=>id===target))target=targets[0]?.[0]||'';
    const stateField=def.fields.state,hasText=type==='when.signal'||type==='when.command';if(stateField&&!stateField.options.some(([id])=>id===value))value=stateField.value;
    const link=(kind,id,text)=>`<button type="button" class="subtle-button" data-sim-go="${kind}" data-sim-id="${esc(id)}">${esc(text)} ↗</button>`;
    const named=(kind,id)=>targetOptions(project,kind).find(([key])=>key===id)?.[1]||id;
    const table=(title,rows)=>`<section class="sim-card"><h3>${title}</h3>${rows.length?`<dl>${rows.map(([name,status])=>`<div><dt>${name}</dt><dd>${esc(status)}</dd></div>`).join('')}</dl>`:'<small>항목 없음</small>'}</section>`;
    body.innerHTML=`<div class="note subtle">프로젝트를 변경하지 않는 모의 실행입니다. 문·조명·목표·신호·대기·분기를 확인합니다. 플레이어 이동, 스캔 진행, 알람 종료는 직접 입력하며 몹 전투·물리·실제 랜덤 바닥 판정은 게임에서 확인하세요.</div>
      ${programIssues(project).some(i=>i.severity==='error')?'<div class="note warning">대상이 없거나 연결이 부족한 이벤트가 있습니다. 스테이지 검사도 함께 확인하세요.</div>':''}
      <div class="sim-toolbar"><strong>${(s.tick/20).toFixed(2)}초 · ${s.result==='success'?'임무 성공':s.result==='failure'?'임무 실패':s.error?'실행 중단':'진행 중'}</strong><span>대기 작업 ${s.pending}개</span><button type="button" class="button" data-sim="advance" data-seconds="1">1초 진행</button><button type="button" class="button" data-sim="advance" data-seconds="5">5초 진행</button><button type="button" class="button" data-sim="reset">처음부터</button></div>
      ${s.error?`<p class="note warning" role="alert">${esc(s.error)}</p>`:''}
      <div class="sim-input"><label class="field">발생시킬 상황<select data-sim-field="type" aria-label="모의 입력 종류">${options(inputTypes.map(([id,d])=>[id,d.label]),type)}</select></label>
      ${targetField?`<label class="field">대상<select data-sim-field="target" aria-label="모의 입력 대상">${options(targets,target)}</select></label>`:''}
      ${stateField?`<label class="field">상태<select data-sim-field="value" aria-label="모의 입력 상태">${options(stateField.options,value)}</select></label>`:hasText?`<label class="field">${type==='when.signal'?'신호 이름':'명령어'}<input data-sim-field="value" aria-label="모의 입력 값" value="${esc(value)}" maxlength="120"></label>`:''}
      <button type="button" class="button primary" data-sim="input" ${s.result||s.error||targetField&&!targets.length?'disabled':''}>상황 발생</button></div>
      <details class="sim-players"><summary>조건 검사에 사용할 구역 내 플레이어</summary>${project.rooms.map(r=>`<label><input type="checkbox" data-sim-room="${esc(r.id)}" ${s.players[r.id]?'checked':''}> ${esc(r.code)} · ${esc(r.name)}</label>`).join('')}</details>
      <div class="sim-grid">${table('문',Object.entries(s.doors).map(([id,d])=>[link('door',id,named('door',id)),`${d.open?'열림':'닫힘'} · ${d.locked?'이쪽 잠김':'이쪽 잠금 해제'}`]))}
      ${table('타일 조명',Object.entries(s.lights).map(([id,v])=>[link('placement',id,named('placement',id)),labels[v]||v]))}
      ${table('기믹',Object.entries(s.gimmicks).map(([id,g])=>[link('gimmick',id,named('gimmick',id)),`${g.enabled?'활성':'비활성'}${g.scan?' · '+labels[g.scan]+` · ${g.scanStep}/${g.scanSteps}단계`:g.alarm?' · 알람 진행 중':g.complete?' · 완료':''}`]))}
      ${table('임무 목표',Object.entries(s.objectives).map(([id,v])=>[esc(named('objective',id)),v?'완료':'미완료']))}
      ${table('변수',Object.entries(s.variables).map(([id,v])=>[esc(id),String(v)]))}</div>
      <section class="sim-card"><h3>실행 기록 · 최근 80개</h3><ol class="sim-log" aria-label="모의 실행 기록">${s.log.slice(-80).map(l=>`<li><time>${(l.tick/20).toFixed(2)}초</time> ${l.program?link('program',l.program,l.message):esc(l.message)}</li>`).join('')}</ol></section>`;
  }
  function open(){project=structuredClone(getProject());sim=createSimulation(project);type='when.scan';target='';value='complete';modal('이벤트 모의 실행','',null);render();}
  body.addEventListener('click',e=>{const b=e.target.closest('[data-sim],[data-sim-go]');if(!b)return;e.preventDefault();if(b.dataset.simGo){navigate(b.dataset.simGo,b.dataset.simId);return;}
    if(b.dataset.sim==='reset')sim=createSimulation(project);if(b.dataset.sim==='advance')sim.advance(Number(b.dataset.seconds));if(b.dataset.sim==='input')sim.input(type,type==='when.signal'?value:target,type==='when.signal'?'':value);render();
  });
  body.addEventListener('change',e=>{const input=e.target;if(input.dataset.simField){const key=input.dataset.simField;if(key==='type'){type=input.value;target='';value=type==='when.scan'?'complete':type==='when.door'?'open':'';}else if(key==='target')target=input.value;else value=input.value;render();}else if(input.dataset.simRoom){sim.setPlayers(input.dataset.simRoom,input.checked);}});
  return {open};
}
