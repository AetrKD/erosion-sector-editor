// Help is an explicit allowlist of rules whose consequences are not clear from a label.
const fields={
 '임무 방식':'탈출 자체가 목표이면 메인 목표 없이 탈출 스캔으로 성공합니다. 메인 목표 달성 후 탈출이면 필수 목표를 먼저 완료해야 합니다.',
 '메인 목표 완료 결과':'탈출구 활성화는 탈출 스캔을 진행하도록 합니다. 즉시 탈출은 메인 목표 완료로 임무를 성공 처리합니다.',
 '문을 건너는 횟수 · 최단 거리':'블록 수가 아니라 문 연결을 건너는 횟수입니다. 연결 두 번은 거리 2입니다. 기준은 알람을 발생시킨 이벤트의 타일이며, 없으면 알람이 속한 타일입니다.',
 '스캔 위치 방식':'랜덤 위치는 원 전체가 들어가는 연결된 바닥에서 선택합니다. 웹의 후보는 단순 블록 점유 기준이며 실제 모드 블록 충돌은 게임에서 판정합니다.',
 '나눌 묶음 수':'총 사용량을 이 수만큼 나누어 후보 컨테이너에 추첨 배치합니다. 보급 팩 하나는 최대 5회분이며 수납 한 칸을 차지합니다.',
 '챕터 ID':'화면에 표시하는 챕터 이름과 별도로 챕터를 구분해 저장하는 식별자입니다.'
};
export function installHelp(){
 const dialog=document.createElement('dialog');dialog.className='help-dialog';dialog.innerHTML='<header><h2></h2><button type="button" class="icon-button" aria-label="도움말 닫기">×</button></header><p></p>';document.body.append(dialog);
 const open=(title,text)=>{dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=text;dialog.showModal();};
 dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 document.addEventListener('show-editor-help',()=>open('파일과 저장','.esfile에는 스테이지 설정을 저장하며 타일 NBT는 별도 파일로 보관합니다. 브라우저 자동 저장은 이 기기의 복원본입니다. 다른 기기로 옮길 때는 두 파일을 함께 보관하세요.'));
 document.addEventListener('click',e=>{const b=e.target.closest('[data-help]');if(!b)return;e.preventDefault();e.stopPropagation();open(b.dataset.helpTitle,b.dataset.helpText);},true);
 const button=(title,text)=>{const b=document.createElement('button');b.type='button';b.className='help-button';b.textContent='ⓘ';b.dataset.help='rule';b.dataset.helpTitle=title;b.dataset.helpText=text;b.setAttribute('aria-label',title+' 도움말');return b;};
 const clean=()=>{
  // Remove routine explanations rather than turning each paragraph into another icon.
  document.querySelectorAll('.management-description,.note:not(.warning):not(.error):not([role=alert]),.slot-hint>span,.runtime-note,.logic-runtime-note,.event-step-heading p,.event-template-library>p,.asset-stats,.workflow-note,.preview-bottom>span,label>small').forEach(el=>{if(el.closest('.help-dialog')||el.querySelector('input,button,select,textarea,a,[role=alert]'))return;el.remove();});
  const empty=document.getElementById('previewEmpty');if(empty&&!empty.dataset.helpMoved){empty.textContent='';empty.hidden=true;empty.dataset.helpMoved='true';}
  document.querySelectorAll('.scan-map-tools p').forEach(el=>{if(/배치 후보 \d/.test(el.textContent)){if(!el.dataset.compact){el.dataset.compact='true';el.textContent=el.textContent.match(/배치 후보 \d+곳/)?.[0]||'';}}else el.remove();});
  document.querySelectorAll('label').forEach(el=>{if(el.querySelector('.help-button'))return;const label=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();if(!fields[label])return;el.querySelectorAll('input,select,textarea').forEach(c=>{if(!c.hasAttribute('aria-label'))c.setAttribute('aria-label',label);});el.append(button(label,fields[label]));});
  const resources=document.querySelector('[data-preview-resource-open]');if(resources&&!resources.parentElement.querySelector('[data-help-title="블록 리소스 연결"]'))resources.after(button('블록 리소스 연결','설치 목록의 기본 블록·모드 리소스는 미리보기에 필요한 경우 공식 배포처에서 자동으로 가져와 이 브라우저에 저장합니다. 처음에는 다운로드 시간이 걸립니다. 추가 리소스 연결은 별도 .esresources 묶음을 사용할 때만 필요합니다.'));
  document.querySelectorAll('[data-node]').forEach(el=>{if(el.querySelector('[data-block-type]')||!el.querySelector('.block-title strong')||el.querySelector('.help-button'))return;const title=el.querySelector('.block-title strong');if(title.textContent.trim()==='다음 조건을 만족할 때까지 반복')el.querySelector('.block-buttons')?.prepend(button('조건을 만족할 때까지 반복','조건이 참이면 반복을 끝냅니다. 거짓인 동안 내부 동작을 실행합니다. 반복이 끝날 조건을 반드시 구성하세요.'));});
 };
 let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;clean();});}}).observe(document.body,{childList:true,subtree:true});clean();
}
