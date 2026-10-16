import {mkdir,writeFile} from 'node:fs/promises';
import {structureBytes} from '../tests/fixtures.mjs';
import {inspectStructure} from '../dist/nbt.mjs';
import {emptyProject,validate,exportStage} from '../dist/core.mjs';
import {createBlock,createProgram} from '../dist/logic.mjs';
import {packStage} from '../dist/stage-file.mjs';
export async function runtimeFixture(){
  const project=emptyProject();project.id='runtime-test';project.name='실행 연동 검증';project.tiles=[];project.placements=[];project.gimmicks=[];project.objectives=[];project.missionMode='objectives';project.rooms=[0,1,2].map(i=>({id:'r'+i,code:String(101+i),name:'검사 구역 '+i,zoneId:'z1',color:'#7ba392'}));const sources=new Map();
  for(let n=0;n<3;n++){
    const palette=[{Name:'minecraft:stone'},{Name:'minecraft:air'}],blocks=[];for(let x=0;x<8;x++)for(let z=0;z<8;z++)blocks.push({pos:[x,0,z],state:0});
    for(const facing of n===0?['east']:n===2?['west']:['west','east'])for(let col=0;col<4;col++)for(let row=0;row<4;row++){
      const top=row===3;palette.push({Name:top?'erosionsector:tile_security_door_drive':'erosionsector:tile_door_part',Properties:{facing,edge:String(col===0?1:col===3?2:0),...(top?{row_item:String(col===0)}:{sliding:'true',control:'false'})}});
      blocks.push({pos:[facing==='west'?0:7,row+1,col+2],state:palette.length-1,nbt:{id:'erosionsector:tile_door',Width:4,Height:4,HalfReady:true,LocalRow:row,door_settings:{type:'SECURITY',access:'HOLD'}}});
    }
    const bytes=structureBytes([8,8,8],palette,blocks,true),tile=await inspectStructure(bytes,`tile${n}.nbt`);tile.id='t'+n;tile.asset.reference='test/tile'+n+'.nbt';for(const port of tile.ports)port.id=port.facing;project.tiles.push(tile);project.placements.push({id:'p'+n,tileId:tile.id,roomId:'r'+n,name:'',areaCode:'a',x:n/2,y:0,z:0,rotation:0});sources.set(tile.asset.reference,bytes);
  }
  const add=(id,type,placementId,position,settings={})=>project.gimmicks.push({id,name:id,type,placementId,position,settings});
  add('entry','spawn','p0',{x:1,y:1,z:1});add('computer','terminal','p0',{x:1,y:1,z:3},{commands:['RESTORE_POWER']});add('supply','supply','p0',{x:1,y:1,z:5});add('cargo','cargo','p0',{x:3,y:1,z:5},{objectKey:'test-cargo'});add('card','keycard','p0',{x:2,y:1,z:5},{containerId:'supply',keyId:'LAB-ID'});add('exit','extraction','p2',{x:4,y:1,z:5},{mode:'scan',duration:1,requireAll:true});add('alarm','alarm','p0',{x:4,y:1,z:3},{wake:true,wakeRoomId:'r2',spawnRule:'distance',distance:2,count:1,waves:1,entity:'minecraft:zombie',finishRule:'eliminate'});add('sleep','sleeper','p2',{x:3,y:1,z:3},{entity:'minecraft:zombie',count:1});
  project.objectives=[{id:'restore',name:'전력 복구',type:'command',targetId:'computer',command:'RESTORE_POWER',required:true},{id:'card-goal',name:'키카드 회수',type:'collect',targetId:'card',command:'',required:true}];
  const rule=createProgram(project);rule.id='rule-command';rule.trigger=createBlock('when.command',project);rule.trigger.args={gimmickId:'computer',command:'RESTORE_POWER'};rule.actions=[createBlock('do.alarm',project)];rule.actions[0].args.gimmickId='alarm';project.programs=[rule];
  if(validate(project).some(i=>i.severity==='error'))throw new Error(JSON.stringify(validate(project)));
  return {project,sources,bytes:packStage(project),exported:exportStage(project)};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/runtime-fixture.mjs')){
  const target=process.argv[2]||'artifacts/runtime-workspace',data=await runtimeFixture();await mkdir(target+'/stage',{recursive:true});for(const [ref,bytes] of data.sources){await mkdir(target+'/tile/'+ref.slice(0,ref.lastIndexOf('/')),{recursive:true});await writeFile(target+'/tile/'+ref,bytes);}await writeFile(target+'/stage/verification.esfile',data.bytes);console.log('Fixture written: '+target);
}
