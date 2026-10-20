import {checks} from './features.mjs';
export function workflowSteps(p){return checks(p).map((s,i)=>({...s,id:['doors','entry','exit'][i],detail:s.done?'확인됨':'설정 필요'}));}
export function workflowMarkup(steps,escape){return `<ul class="workflow-list">${steps.map(s=>`<li class="workflow-step ${s.done?'complete':''}"><span>${s.done?'☑':'☐'}</span><span>${escape(s.title)}</span></li>`).join('')}</ul>`;}
