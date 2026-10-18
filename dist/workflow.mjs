// Guidance is derived from the current project; visiting a menu never edits stage data.
export function workflowSteps(project,issues=[]){
  const linked=project.tiles.filter(t=>t.asset?.bytes).length;
  const entries=project.gimmicks.filter(g=>g.type==='spawn').length,exits=project.gimmicks.filter(g=>g.type==='extraction').length;
  const errors=issues.filter(i=>i.severity==='error').length,warnings=issues.filter(i=>i.severity==='warning').length;
  return [
    {id:'tiles',title:'타일 설계도 준비',detail:linked?`원본 ${linked}개 연결됨`:'Create 설계도가 있는 assets/tile 폴더를 연결하세요.',done:linked>0},
    {id:'layout',title:'타일 배치와 문 연결',detail:project.placements.length?`타일 ${project.placements.length}개 배치됨 · 문 연결은 검사에서 확인`:'왼쪽 타일을 배치 지도로 끌어 놓으세요.',done:project.placements.length>0},
    {id:'gimmicks',title:'시작점과 탈출 지점',detail:`시작점 ${entries}개 · 탈출 지점 ${exits}개 — 각각 하나가 필요합니다.`,done:entries===1&&exits===1},
    {id:'mission',title:'임무 목표 정하기',detail:project.missionMode==='extract'?'탈출 자체가 목표인 임무입니다.':`목표 ${project.objectives.length}개 · 완료 후 탈출을 설정하세요.`,done:project.missionMode==='extract'||project.objectives.length>0},
    {id:'validation',title:'실행 전 확인',detail:errors||warnings?`수정 필요 ${errors}개 · 확인할 사항 ${warnings}개`:'배치·목표·이벤트 참조 검사 통과',done:errors===0&&warnings===0}
  ];
}
export function workflowMarkup(steps,escape){
  return `<ol class="workflow-list">${steps.map((step,index)=>`<li><button type="button" data-guide="${step.id}" class="workflow-step ${step.done?'complete':''}"><span class="workflow-number" aria-label="${step.done?'완료':'미완료'}">${step.done?'✓':index+1}</span><span><strong>${escape(step.title)}</strong><small>${escape(step.detail)}</small></span><span aria-hidden="true">→</span></button></li>`).join('')}</ol>`;
}
