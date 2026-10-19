import test from 'node:test';
import assert from 'node:assert/strict';
import {palettePlacement,createPaletteEvaluator} from '../dist/palette-placement.mjs';
import {createSceneIndex} from '../dist/scene-index.mjs';
import {readProject,validateProjectDraft,demoProject} from '../dist/core.mjs';
import {scanFixture} from '../tools/scan-fixture.mjs';
import {packStage} from '../dist/stage-file.mjs';

test('cached palette decisions equal uncached decisions across rotations, masks, floors, edits and undo',async()=>{
  const {project:p}=await scanFixture(),edited=structuredClone(p);edited.placements[1].rotation=90;edited.placements.splice(2,1);edited.gimmicks=edited.gimmicks.filter(g=>g.placementId!=='p2');
  const evaluate=createPaletteEvaluator(),brushes=[{kind:'tile',id:'t0',rotation:0},{kind:'tile',id:'t1',rotation:90},{kind:'gimmick',id:'scan'},{kind:'gimmick',id:'supply'},{kind:'gimmick',id:'cargo'}];
  for(const project of [p,edited,p])for(let i=0;i<180;i++){
    const brush=brushes[i%brushes.length],point={x:(i*7%29-2)/16,y:i%7===0?1:0,z:(i*13%11-2)/16},before=structuredClone(project);
    assert.deepEqual(evaluate(project,brush,point,'r0'),palettePlacement(project,brush,point,'r0'));assert.deepEqual(project,before);
  }
});

test('same block reuses preview; changed room, floor, brush, rotation and final drop force a new decision',async()=>{
  const {project:p}=await scanFixture();let builds=0;const evaluate=createPaletteEvaluator(project=>{builds++;return createSceneIndex(project);}),brush={kind:'tile',id:'t0'},point={x:2,y:0,z:2};
  const first=evaluate(p,brush,point,'r0');assert.strictEqual(evaluate(p,{...brush},{...point,x:2.001},'r0'),first);assert.notStrictEqual(evaluate(p,brush,point,'r0',{fresh:true}),first);assert.equal(builds,1);
  let prev=evaluate(p,brush,point,'r0');for(const [b,at,room] of [[brush,point,'r1'],[{...brush,rotation:90},point,'r1'],[brush,{...point,y:1},'r1'],[{kind:'gimmick',id:'scan'},point,'r1']]){const next=evaluate(p,b,at,room);assert.notStrictEqual(next,prev);prev=next;}
  const changed=structuredClone(p);evaluate(changed,brush,point,'r0');evaluate(p,brush,point,'r0');assert.equal(builds,3);
});

test('owned-draft validation preserves import isolation and leaves the previous revision and archive untouched',()=>{
  const before=demoProject(),archive=packStage(before),draft=structuredClone(before);draft.name='새 이름';draft.placements[0].name='새 배치';
  assert.strictEqual(validateProjectDraft(draft),draft);assert.notEqual(before.name,draft.name);assert.deepEqual(packStage(before),archive);
  const imported=readProject(before);imported.placements[0].x=123;assert.notEqual(before.placements[0].x,123);assert.deepEqual(packStage(before),archive);
});
