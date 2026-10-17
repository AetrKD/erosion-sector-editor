import {runtimeFixture} from './runtime-fixture.mjs';
import {scanDefaults} from '../dist/scan.mjs';
import {packStage} from '../dist/stage-file.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createProgram,createBlock} from '../dist/logic.mjs';
export async function scanFixture(){
  const {project:p,sources}=await runtimeFixture();
  p.gimmicks=p.gimmicks.filter(g=>!['terminal','sleeper','alarm'].includes(g.type));p.objectives=[];p.programs=[];p.missionMode='objectives';
  p.gimmicks.push({id:'security-scan',name:'보안 스캔',type:'scan',placementId:'p0',position:{x:3,y:1,z:3},settings:{...scanDefaults(),radius:1,duration:2,requiredPlayers:1,steps:[{placementId:'p1',position:{x:3,y:1,z:3},radius:1.5,duration:3,requiredPlayers:'all',positionMode:'random'}]}});
  p.objectives=[{id:'secure',name:'보안 스캔 완료',type:'scan',targetId:'security-scan',command:'',required:true}];
  const lock=createProgram(p);lock.trigger=createBlock('when.start',p);lock.actions=[createBlock('do.door',p)];lock.actions[0].args={doorId:'p0:east',action:'lock'};
  const unlock=createProgram(p);unlock.trigger=createBlock('when.scan',p);unlock.trigger.args={gimmickId:'security-scan',state:'complete'};unlock.actions=[createBlock('do.door',p)];unlock.actions[0].args={doorId:'p0:east',action:'unlock'};p.programs=[lock,unlock];
  return {project:p,sources};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/scan-fixture.mjs')){
  const target=process.argv[2]||'artifacts/scan-workspace',{project,sources}=await scanFixture();await mkdir(target+'/stage',{recursive:true});
  for(const [ref,bytes] of sources){await mkdir(target+'/assets/tile/'+ref.slice(0,ref.lastIndexOf('/')),{recursive:true});await writeFile(target+'/assets/tile/'+ref,bytes);}
  await writeFile(target+'/stage/scans.esfile',packStage(project));console.log('Scan fixture written: '+target);
}
