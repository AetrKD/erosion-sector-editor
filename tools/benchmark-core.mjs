import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=process.argv[2]?pathToFileURL(resolve(process.argv[2])):new URL('../dist/core.mjs',import.meta.url);
const {connections,validate,demoProject}=await import(source);
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(const count of [100,500,1000]){
  const project=demoProject();
  project.tiles=[{id:'corridor',name:'Benchmark',category:'test',size:{x:16,y:8,z:16},ports:[
    {id:'west',x:0,y:1,z:8,facing:'west',width:6,height:4,required:false},
    {id:'east',x:16,y:1,z:8,facing:'east',width:6,height:4,required:false}
  ]}];
  project.placements=Array.from({length:count},(_,i)=>({id:`p${i}`,name:'',tileId:'corridor',roomId:project.rooms[0].id,x:i,y:0,z:0,rotation:0}));
  project.gimmicks=[];project.links=[];
  const result={placements:count};
  for(const [name,fn] of Object.entries({connections,validate})){
    fn(project);const times=[];
    for(let i=0;i<7;i++){const start=performance.now();fn(project);times.push(performance.now()-start);}
    result[`${name}MedianMs`]=Number(median(times).toFixed(3));
  }
  console.log(JSON.stringify(result));
}
