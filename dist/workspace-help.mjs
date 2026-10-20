const topics={
 tiles:['타일 배치','타일은 Create 설계도 NBT로 만든 공간입니다.\n타일 폴더를 연결하고 라이브러리에서 지도로 끌어 놓으세요. R로 회전하고 Delete로 삭제합니다. Space와 드래그로 지도를 이동합니다.\n미리보기를 켜면 오른쪽에서 선택한 타일의 블록을 확인합니다. 외부 모드 재질은 리소스 파일을 연결해야 표시됩니다.'],
 events:['이벤트 관리','이벤트는 발생 조건과 실행 동작을 연결하는 규칙입니다.\n조건 블록 아래에 실행할 동작을 연결하세요. 문 열기, 스캔 시작, 목표 완료 등을 조합할 수 있습니다.\n예: 키카드를 획득하면 지정한 보안문을 잠금 해제합니다.'],
 resources:['자원 및 목표 배치','자원 규칙은 타일 내부 컨테이너에 배정할 보급품과 수량을 정합니다. 고정 요소에서는 시작점·스캔·화물 등을 배치합니다.\n원하는 타일을 선택하고 규칙이나 요소를 추가하세요. 컨테이너 용량을 넘는 배정은 검사에서 확인할 수 있습니다.'],
 variables:['변수','변수는 이벤트가 읽고 변경하는 임무 내 값입니다.\n이름과 초기값을 정한 뒤 조건에서 비교하거나 동작으로 값을 바꿉니다.\n예: 수집 수량이 3 이상이면 목표를 완료합니다.'],
 enemies:['적','적 그룹은 생성할 적과 위치·수량을 묶은 설정입니다.\n그룹을 만들고 이벤트의 적 생성 동작에서 선택하세요. 실제 적 종류는 게임에 등록된 ID를 사용합니다.'],
 goals:['목표','목표는 임무 진행 조건입니다. 메인 목표와 서브 목표를 나누어 구성합니다.\n이벤트나 수량 조건으로 완료하고, 완료 결과로 임무 성공을 지정할 수 있습니다. 탈출 스캔이 필요하면 별도로 배치해 연결하세요.'],
 properties:['속성','지도나 목록에서 선택한 항목의 설정입니다.\n값을 바꾸면 현재 프로젝트에 반영됩니다. 이름·위치·연결 대상은 선택한 항목마다 다릅니다. 잘못된 값은 배치 검사에서 확인하세요.'],
 files:['파일과 저장','스테이지 저장은 .esfile 파일 다운로드입니다. 브라우저 자동 저장은 이 기기의 복원본입니다.\n다른 기기로 옮길 때는 .esfile과 외부 타일 NBT를 함께 보관하세요. 타일 폴더 연결과 리소스 연결은 파일을 서버에 업로드하지 않습니다.']
};
export function installHelp(){
 const dialog=document.createElement('dialog');dialog.className='help-dialog';dialog.innerHTML='<header><h2></h2><button type="button" class="icon-button" aria-label="도움말 닫기">×</button></header><p></p>';document.body.append(dialog);
 const open=(title,text)=>{dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=text;dialog.showModal();};
 dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-help]');if(b){e.preventDefault();e.stopPropagation();const topic=topics[b.dataset.help];open(...(topic||[b.dataset.helpTitle||'설명',b.dataset.helpText]));}},true);
 const button=(title,text)=>{const b=document.createElement('button');b.type='button';b.className='help-button';b.textContent='ⓘ';b.dataset.help='custom';b.dataset.helpTitle=title;b.dataset.helpText=text;b.setAttribute('aria-label',title+' 도움말');return b;};
 document.querySelectorAll('button[data-section]').forEach(b=>{const h=button(b.textContent,topics[b.dataset.section][1]);h.dataset.help=b.dataset.section;b.after(h);});
 document.querySelector('#saveStatus')?.after(button(...topics.files));
 const fields={
 '이름':'목록과 게임 화면에서 항목을 구분하는 표시 이름입니다. 같은 종류 안에서 알아보기 쉬운 이름을 사용하세요.',
 '초기값':'임무 시작 시 변수에 넣을 숫자입니다. 이후 이벤트의 변수 변경 동작으로 값을 바꿀 수 있습니다.',
 '임무 방식':'탈출 자체가 목표이면 메인 목표 없이 탈출 스캔으로 성공합니다. 메인 목표 달성 후 탈출이면 목표 완료가 먼저 필요합니다.',
 '메인 목표 완료 결과':'탈출구 활성화는 탈출 스캔을 진행하도록 합니다. 즉시 탈출은 메인 목표 완료로 임무를 성공 처리합니다.',
 '진입 타일':'임무 참가자가 도착할 시작 위치를 이 타일에 만듭니다. 여러 진입 타일을 지정하면 참가자를 나누어 배치합니다.',
 '탈출 타일':'임무를 마칠 탈출 스캔을 이 타일에 만듭니다. 스캔의 위치와 시간은 요소 속성에서 조절합니다.',
 '한 번만 실행':'켜면 이벤트가 임무 중 한 번만 실행됩니다. 끄면 발생 조건이 다시 충족될 때 실행할 수 있습니다.',
 '이벤트 사용':'끄면 이벤트 설정을 보관하면서 임무 실행 대상에서 제외합니다.',
 '필요 수량 / 생존 시간(초)':'수량 목표는 필요한 개수, 생존 목표는 유지할 초 수입니다. 선택한 목표 종류에 맞춰 입력하세요.',
 '생성 횟수 · 0은 무한':'이 그룹을 생성할 수 있는 횟수입니다. 0이면 횟수 제한 없이 반복 생성합니다.',
 '표시 높이':'미리보기에서 보일 블록 높이를 제한합니다. 설계도 원본과 게임의 건축물은 바뀌지 않습니다.',
 '다른 층 흐리게':'켜면 현재 표시 층 밖의 타일을 흐리게 그려 위아래 공간을 함께 확인합니다.',
 '챕터 ID':'챕터를 구분하는 저장용 식별자입니다. 표시 이름과 별도로 유지되며 스테이지를 분류할 때 사용합니다.'
 };
 const rewrite=text=>text.trim().replaceAll('모의 실행으로','게임에서').replaceAll('B 배치 · ','').replaceAll('기믹 라이브러리','자원 및 목표 배치').replaceAll('이벤트 편집','이벤트 관리').replaceAll('기믹 탭','자원 및 목표 배치').replaceAll('클릭해서 타일 배치','타일을 드래그해서 배치');
 const clean=()=>{
  document.querySelectorAll('.management-description,.note:not(.warning):not(.error):not([role=alert]),.slot-hint>span,.runtime-note,.logic-runtime-note,.event-step-heading p,.event-template-library>p,.scan-map-tools p,.asset-stats,.workflow-note,.preview-empty,.preview-bottom>span,label>small').forEach(el=>{if(el.closest('.help-dialog')||el.querySelector('input,button,select,textarea,a,[role=alert]')||el.dataset.helpMoved)return;const text=rewrite(el.textContent);if(!text)return;const b=button(el.closest('section')?.querySelector('h2,h3')?.textContent||'설정 설명',text);if(el.id==='previewEmpty'){el.dataset.helpMoved='true';el.textContent='';document.querySelector('.preview-toolbar strong').after(b);return;}if(el.id)b.id=el.id;el.replaceWith(b);});
  document.querySelectorAll('label').forEach(el=>{if(el.querySelector('.help-button'))return;const label=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();if(fields[label]){el.querySelectorAll('input,select,textarea').forEach(c=>{if(!c.hasAttribute('aria-label'))c.setAttribute('aria-label',label);});el.append(button(label,fields[label]));}});
  document.querySelectorAll('label[title],.section-title[title],h2[title],h3[title]').forEach(el=>{if(el.dataset.helpMoved)return;el.dataset.helpMoved='true';el.append(button(el.firstChild?.textContent?.trim()||'설정',rewrite(el.title)));el.removeAttribute('title');});
 };
 let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;clean();});}}).observe(document.body,{childList:true,subtree:true});clean();
}
