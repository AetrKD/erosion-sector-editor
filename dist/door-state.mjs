import {connections} from './core.mjs';
import {walkBlocks} from './logic.mjs';
export function doorState(p,id){
 const port=connections(p).ports.find(q=>q.key===id);if(!port)return null;
 const placement=p.placements.find(q=>q.id===port.placementId),s=placement.doorStates?.[port.id]||{},security=port.doorSettings?.type==='SECURITY';
 const open=s.open??!security,locked=security&&(s.locked??(port.doorSettings?.access!=='HOLD'&&!!port.doorSettings?.access||!!port.doorSettings?.key_id));let release=false;
 for(const program of p.programs||[])if(program.enabled!==false)walkBlocks(program,b=>{if(b.type==='do.door'&&b.args.doorId===id&&b.args.action==='unlock')release=true;});
 return {port,open,locked,security,emergency:locked&&!release};
}
export function setDoorState(p,id,key,value){
 const state=doorState(p,id);if(!state||!['open','locked'].includes(key)||typeof value!=='boolean'||key==='locked'&&!state.security)throw Error('문 초기 상태가 올바르지 않습니다.');
 const put=(port,k,v)=>{const q=p.placements.find(q=>q.id===port.placementId);q.doorStates??={};q.doorStates[port.id]??={};q.doorStates[port.id][k]=v;};
 put(state.port,key,value);
 if(key==='open'){const pair=connections(p).pairs.find(q=>q.a.key===id||q.b.key===id);if(pair)put(pair.a.key===id?pair.b:pair.a,key,value);}
}
