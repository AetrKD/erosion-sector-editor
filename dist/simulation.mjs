import {BLOCKS,blockDescription} from './logic.mjs';
import {connections} from './core.mjs';
import {isScan,scanSteps} from './scan.mjs';

const normalize=value=>String(value||'').trim().replace(/\s+/g,' ').toUpperCase();
/** Bounded, deterministic editor model of StageLogic. No world, network, or project writes. */
export function createSimulation(source){
  const project=structuredClone(source),events=[],jobs=[],fired=new Set(),active=new Set(),seen=new Map();
  const state={tick:0,result:'',error:'',doors:{},lights:{},gimmicks:{},objectives:{},variables:{},players:{},log:[]};
  const scans=new Map(),securityDoors=new Set(),net=connections(project);let operations=0,previousTile='';
  const log=(message,program='')=>{state.log.push({tick:state.tick,message,program});if(state.log.length>300)state.log.shift();};
  const fault=message=>{state.error=message;events.length=0;jobs.length=0;active.clear();log(message);};
  function emit(type,target='',value='',placement=''){
    if(state.result||state.error)return;
    if(events.length>=1024){fault('신호가 너무 많습니다. 순환 연결을 확인하세요.');return;}
    events.push({type,target,value,placement});
    const legacy={'when.interact':'상호작용','when.area':'범위 진입','when.tile':'범위 진입','when.complete':'목표 완료','when.alarm':'방어전 종료'}[type];
    if(legacy)for(const l of project.links)if(l.from===target&&l.event===legacy)action('do.gimmick',{gimmickId:l.to,action:l.action==='비활성화'?'deactivate':l.action==='목표 완료 처리'?'complete':'activate'},{placement});
  }
  const gimmick=id=>project.gimmicks.find(g=>g.id===id);
  function complete(id){const s=state.gimmicks[id];if(s&&!s.complete){s.complete=true;emit('when.complete',id,'',gimmick(id).placementId);}}
  function objective(id){if(!(id in state.objectives)||state.objectives[id])return;state.objectives[id]=true;log('목표 완료 · '+project.objectives.find(o=>o.id===id).name);emit('when.objective',id);
    const o=project.objectives.find(o=>o.id===id);if(['command','collect'].includes(o.type))complete(o.targetId);
    if(project.objectives.filter(o=>o.required).every(o=>state.objectives[o.id]))for(const g of project.gimmicks)if(g.type==='extraction'&&g.settings.unlockOnObjectives!==false){state.gimmicks[g.id].enabled=true;const s=scans.get(g.id);if(s&&!s.active&&!s.complete){s.active=true;s.index=0;s.paused=false;state.gimmicks[g.id].scan='active';state.gimmicks[g.id].scanStep=1;}}
  }
  function matching(type,target,value=''){for(const o of project.objectives)if(o.type===type&&o.targetId===target&&(type!=='command'||normalize(o.command)===normalize(value)))objective(o.id);}
  function control(id,mode){const s=scans.get(id);if(!s)return;if(mode==='start'&&s.active)return;
    if(mode==='start'||mode==='reset'){s.index=0;s.complete=false;s.active=true;s.paused=false;state.gimmicks[id].enabled=true;state.gimmicks[id].complete=false;emit('when.scan',id,'start',gimmick(id).placementId);}
    else if(mode==='pause')s.paused=true;else if(mode==='resume')s.paused=false;else if(mode==='stop'){s.active=false;state.gimmicks[id].enabled=false;}
    state.gimmicks[id].scanStep=s.index+1;state.gimmicks[id].scan=s.complete?'complete':!s.active?'stopped':s.paused?'paused':'active';
  }
  function trigger(b,e,history){
    if(b.type==='when.all'||b.type==='when.any'){let any=false;for(const child of b.items)if(trigger(child,e,history)){history.add(child.id);any=true;}if(b.type==='when.any')return any;if(!b.items.length||!b.items.every(c=>history.has(c.id)))return false;b.items.forEach(c=>history.delete(c.id));return true;}
    if(b.type!==e.type)return false;const a=b.args,key={'when.area':'roomId','when.tile':'placementId','when.signal':'signal','when.door':'doorId','when.doorAttempt':'doorId','when.objective':'objectiveId'}[b.type]||'gimmickId';
    if(b.type!=='when.start'&&a[key]!==e.target)return false;
    return b.type==='when.command'?normalize(a.command)===normalize(e.value):['when.door','when.scan'].includes(b.type)?a.state===e.value:true;
  }
  function condition(b){const a=b.args,items=b.items||[];switch(b.type){
    case 'check.all':return !!items.length&&items.every(condition);case 'check.any':return items.some(condition);case 'check.not':return items.length===1&&!condition(items[0]);
    case 'check.players':return !!state.players[a.roomId];case 'check.objective':return !!state.objectives[a.objectiveId];case 'check.complete':return !!state.gimmicks[a.gimmickId]?.complete;
    case 'check.alarm':return a.state==='active'?!!state.gimmicks[a.gimmickId]?.alarm:!!state.gimmicks[a.gimmickId]?.complete;
    case 'check.door':return a.state==='locked'?state.doors[a.doorId]?.locked===true:state.doors[a.doorId]?.open===(a.state==='open');
    case 'check.variable':{const x=state.variables[a.variable]||0,y=a.value;return {eq:x===y,ne:x!==y,gt:x>y,gte:x>=y,lt:x<y,lte:x<=y}[a.operator]||false;}
    default:fault('지원하지 않는 조건 · '+b.type);return false;
  }}
  function action(type,a,e={}){switch(type){
    case 'do.variable':state.variables[a.variable]=Math.max(-1e9,Math.min(1e9,(a.operation==='add'?(state.variables[a.variable]||0):0)+a.value));break;
    case 'do.signal':emit('when.signal',a.signal,'',e.placement);break;
    case 'do.objective':objective(a.objectiveId);break;
    case 'do.scan':control(a.gimmickId,a.action);break;
    case 'do.gimmick':{const s=state.gimmicks[a.gimmickId];if(!s)break;if(a.action==='complete')complete(a.gimmickId);else if(scans.has(a.gimmickId))control(a.gimmickId,a.action==='deactivate'?'stop':'start');else {s.enabled=a.action!=='deactivate';if(s.enabled&&gimmick(a.gimmickId).type==='alarm')s.alarm=true;}break;}
    case 'do.alarm':{const s=state.gimmicks[a.gimmickId];if(s?.enabled)s.alarm=true;break;}
    case 'do.wave':if(state.gimmicks[a.gimmickId])state.gimmicks[a.gimmickId].enabled=true;break;
    case 'do.door':{const s=state.doors[a.doorId];if(!s)break;if(a.action==='lock')s.locked=securityDoors.has(a.doorId);else if(a.action==='unlock')s.locked=false;else {const open=a.action==='open';const ids=[a.doorId,...(net.pairs.filter(pair=>pair.a.key===a.doorId||pair.b.key===a.doorId).flatMap(pair=>[pair.a.key,pair.b.key]))];for(const id of new Set(ids)){const d=state.doors[id];if(d&&d.open!==open){d.open=open;emit('when.door',id,open?'open':'closed',id.slice(0,id.lastIndexOf(':')));}}}break;}
    case 'do.areaLights':for(const p of project.placements)if(p.roomId===a.roomId)state.lights[p.id]=a.mode;break;
    case 'do.tileLights':state.lights[a.placementId]=a.mode;break;
    case 'do.message':log(a.message);break;
    case 'do.mission':state.result=a.result;log(a.result==='success'?'임무 성공':'임무 실패');events.length=0;jobs.length=0;break;
    default:fault('지원하지 않는 동작 · '+type);
  }}
  function tick(){if(state.error||state.result)return;state.tick++;let budget=512;
    while(events.length&&budget-->0){const e=events.shift();for(const p of project.programs){if(!p.enabled||fired.has(p.id)||active.has(p.id))continue;if(!seen.has(p.id))seen.set(p.id,new Set());if(trigger(p.trigger,e,seen.get(p.id))){if(jobs.length>=128){fault('동시 이벤트가 128개를 넘었습니다.');return;}jobs.push({rule:p.id,event:e,due:0,stack:[{blocks:p.actions,index:0,remaining:1}]});active.add(p.id);if(p.once)fired.add(p.id);log('이벤트 시작 · '+p.name,p.id);}}}
    for(const job of [...jobs]){if(state.error||state.result)return;if(job.due>state.tick)continue;let slice=128;while(job.stack.length&&slice-->0&&budget-->0){if(++operations>100000){fault('모의 실행 한도에 도달했습니다. 초기화 후 순환 이벤트를 확인하세요.');return;}const c=job.stack.at(-1);if(c.index>=c.blocks.length){if(--c.remaining>0)c.index=0;else job.stack.pop();continue;}const b=c.blocks[c.index++],a=b.args;log(blockDescription(b,project),job.rule);
      if(b.type==='flow.wait'){job.due=state.tick+Math.max(1,Math.ceil(a.seconds*20));break;}
      else if(b.type==='flow.repeat')job.stack.push({blocks:b.body,index:0,remaining:a.count});
      else if(b.type==='flow.if')job.stack.push({blocks:b.conditions.every(condition)?b.then:b.else,index:0,remaining:1});
      else action(b.type,a,job.event);if(state.error||state.result)return;
    }if(!job.stack.length){jobs.splice(jobs.indexOf(job),1);active.delete(job.rule);seen.delete(job.rule);}if(budget<=0)break;}
  }
  function input(type,target='',value=''){
    log('입력 · '+(BLOCKS[type]?.label||type)+' · '+(target||value));
    if(type==='when.scan'){const s=scans.get(target);if(!s?.active||s.paused||!state.gimmicks[target]?.enabled){log('이 스캔은 진행 중이 아닙니다. 시작 또는 다시 진행한 뒤 완료하세요.');return;}
      if(value==='start'){log('스캔 시작은 스캔 제어로 설정하세요.');return;}
      if(value==='step'){if(s.index+1>=scanSteps(gimmick(target)).length){log('마지막 단계입니다. 전체 완료를 선택하세요.');return;}s.index++;state.gimmicks[target].scanStep=s.index+1;}
      if(value==='complete'){s.active=false;s.complete=true;s.index=scanSteps(gimmick(target)).length-1;state.gimmicks[target].scanStep=s.index+1;state.gimmicks[target].scan='complete';complete(target);matching('scan',target);}
    }
    if(type==='when.area')state.players[target]=true;
    if(type==='when.tile'){
      const p=project.placements.find(p=>p.id===target);if(!p)return;
      if(target===previousTile){log('같은 타일에 머무르고 있습니다. 다른 타일에 방문한 후 다시 진입하세요.');return;}
      const oldRoom=project.placements.find(p=>p.id===previousTile)?.roomId;previousTile=target;state.players[p.roomId]=true;
      emit(type,target,value,target);matching('visit',target);if(oldRoom!==p.roomId)emit('when.area',p.roomId,'',target);
      for(const g of project.gimmicks)if(g.type==='trigger'&&g.placementId===target&&state.gimmicks[g.id].enabled)emit('when.interact',g.id,'',target);
      tick();return;
    }
    if(type==='when.objective'){objective(target);tick();return;}
    if(type==='when.complete'){complete(target);tick();return;}
    if(type==='when.alarm'){if(state.gimmicks[target])state.gimmicks[target].alarm=false;complete(target);}
    if(type==='when.collect'||type==='when.pickup'||type==='when.command'){
      emit(type,target,value,gimmick(target)?.placementId||'');matching({'when.collect':'collect','when.pickup':'pickup','when.command':'command'}[type],target,value);if(type==='when.collect')complete(target);tick();return;
    }
    if(type==='when.door'&&state.doors[target]){action('do.door',{doorId:target,action:value==='open'?'open':'close'});tick();return;}
    emit(type,target,value);if(type==='when.scan'&&value==='complete'&&gimmick(target)?.type==='extraction'){state.result='success';log('탈출 스캔 완료 · 임무 성공');events.length=0;jobs.length=0;}else tick();
  }
  for(const p of project.placements){state.lights[p.id]='on';for(const port of project.tiles.find(t=>t.id===p.tileId)?.ports||[]){if(port.doorSettings?.type==='SECURITY')securityDoors.add(p.id+':'+port.id);state.doors[p.id+':'+port.id]={open:false,locked:port.doorSettings?.type==='SECURITY'&&!!port.doorSettings.access&&port.doorSettings.access!=='HOLD'};}}
  for(const o of project.objectives)state.objectives[o.id]=false;
  for(const g of project.gimmicks){const enabled=g.settings.enabled??(g.type!=='extraction'||project.missionMode==='extract');state.gimmicks[g.id]={enabled,complete:false,alarm:false};if(isScan(g.type)){scans.set(g.id,{active:enabled,paused:false,complete:false,index:0});state.gimmicks[g.id].scan=enabled?'active':'stopped';state.gimmicks[g.id].scanStep=1;state.gimmicks[g.id].scanSteps=scanSteps(g).length;}}
  for(const [id,s] of scans)if(s.active)emit('when.scan',id,'start',gimmick(id).placementId);emit('when.start');tick();
  return {state,input,advance(seconds){if(!Number.isFinite(seconds)||seconds<0||seconds>60)throw new Error('한 번에 0~60초까지 진행할 수 있습니다.');for(let i=0;i<Math.ceil(seconds*20)&&!state.result&&!state.error;i++)tick();},setPlayers(room,present){state.players[room]=!!present;},snapshot:()=>structuredClone({...state,pending:events.length+jobs.length})};
}
