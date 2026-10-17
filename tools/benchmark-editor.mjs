import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]||'dist',mod=await import(pathToFileURL(resolve(root,'palette-placement.mjs'))),core=await import(pathToFileURL(resolve(root,'core.mjs')));
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
for(const count of [100,500,1000]){
  const project=core.demoProject();project.tiles=Array.from({length:200},(_,i)=>({id:'tile'+i,name:'Tile '+i,size:{x:16,y:8,z:16},ports:[],asset:null}));project.placements=Array.from({length:count},(_,i)=>({id:'p'+i,tileId:'tile'+i%200,roomId:'r1',x:i%32,y:0,z:Math.floor(i/32),rotation:0,name:''}));project.gimmicks=Array.from({length:count*3},(_,i)=>({id:'g'+i,placementId:'p'+i%count,type:'supply',position:{x:2+(i%3)*3,y:1,z:2},settings:{}}));
  const evaluate=mod.createPaletteEvaluator?.()||mod.palettePlacement,points=Array.from({length:30},(_,i)=>({x:40+i/16,y:0,z:40}));
  const result={placements:count,tileTypes:200,containers:project.gimmicks.length};
  for(const [label,brush] of [['tile',{kind:'tile',id:'tile199'}],['container',{kind:'gimmick',id:'cargo'}]]){
    const positions=label==='tile'?points:points.map((_,i)=>({x:(count-1)%32+((i%6)+6)/16,y:0,z:Math.floor((count-1)/32)+8/16}));const times=[];
    for(let n=0;n<4;n++){const start=performance.now();for(const point of positions)evaluate(project,brush,point,'r1');times.push(performance.now()-start);}result[label+'BatchMedianMs']=Number(median(times).toFixed(3));
  }
  const warm=points[0];evaluate(project,{kind:'tile',id:'tile199'},warm,'r1');const same=[];for(let n=0;n<4;n++){const start=performance.now();for(let i=0;i<100;i++)evaluate(project,{kind:'tile',id:'tile199'},{...warm,x:warm.x+(i%10)*.001},'r1');same.push(performance.now()-start);}result.sameCell100MedianMs=Number(median(same).toFixed(3));console.log(JSON.stringify(result));
}
