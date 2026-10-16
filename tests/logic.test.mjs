import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject,readProject,validate} from '../dist/core.mjs';
import {alphabetCode,nextAreaCode,normalizeAreaCodes,areaTree} from '../dist/hierarchy.mjs';
import {BLOCKS,createBlock,createProgram,assertPrograms,insertBlock,moveBlock,duplicateBlock,programIssues,describeProgram} from '../dist/logic.mjs';
import {packStage,unpackStage} from '../dist/stage-file.mjs';

test('alphabet codes continue after z; explicit sibling names survive loading, deletion and another area',()=>{
  assert.deepEqual([0,25,26,51,52,701,702].map(alphabetCode),['a','z','aa','az','ba','zz','aaa']);
  const p=demoProject();p.placements=p.placements.slice(0,3);p.placements.forEach(q=>q.roomId='r1');
  p.placements[0].areaCode='c';delete p.placements[1].areaCode;p.placements[2].areaCode='a';normalizeAreaCodes(p);
  assert.deepEqual(p.placements.map(q=>q.areaCode),['c','b','a']);p.placements.splice(2,1);assert.equal(nextAreaCode(p,'r1'),'a');
  assert.equal(p.placements[1].areaCode,'b');assert.equal(nextAreaCode(p,'r2'),'a');
  assert.throws(()=>readProject({...p,placements:[p.placements[0],{...p.placements[1],areaCode:'c'}]}),/중복/);
});
test('area tree groups actual instances and gimmicks without multiplying a multi-floor tile',()=>{
  const p=demoProject();p.placements[1].roomId='r1';p.placements[1].areaCode='b';
  const tree=areaTree(p);assert.deepEqual(tree[0].children.map(q=>q.areaCode),['a','b']);
  assert.equal(tree.flatMap(r=>r.children).length,7);assert.equal(tree[0].children[0].gimmicks.length,2);
  assert.equal(tree.flatMap(r=>r.children).filter(q=>q.tileId==='atrium').length,1);
});
test('all palette blocks have valid typed defaults and legal nested slots',()=>{
  const p=demoProject();
  for(const [type,def] of Object.entries(BLOCKS)){
    const program=createProgram(p),block=createBlock(type,p);
    if(def.category==='trigger')program.trigger=block;
    else if(def.category==='condition'){const branch=createBlock('flow.if',p);branch.conditions=[block];program.actions=[branch];}
    else program.actions=[block];assert.doesNotThrow(()=>assertPrograms([program]),type);
  }
});
test('event sequences, composite triggers and nested branches round trip in the same external-tile esfile',()=>{
  const p=demoProject(),program=createProgram(p);program.name='101구역 정전';
  program.trigger=createBlock('when.all',p);program.trigger.items=[createBlock('when.area',p),createBlock('when.signal',p)];
  const branch=createBlock('flow.if',p),group=createBlock('check.any',p);group.items=[createBlock('check.players',p),createBlock('check.variable',p)];branch.conditions=[group];
  const repeat=createBlock('flow.repeat',p);repeat.body=[createBlock('do.tileLights',p),createBlock('flow.wait',p)];branch.then=[repeat];branch.else=[createBlock('do.message',p)];
  program.actions=[createBlock('do.door',p),branch,createBlock('do.mission',p)];p.programs=[program];
  const loaded=unpackStage(packStage(p));assert.deepEqual(loaded.programs,p.programs);assert.deepEqual(loaded.placements,p.placements);assert.equal(loaded.tiles[0].asset,null);
  assert.equal(validate(loaded).filter(i=>i.severity==='error').length,0);
  const text=describeProgram(program,p);assert.match(text,/모두 발생/);assert.match(text,/101구역/);assert.match(text,/아니면/);
});
test('block moves preserve configured nodes and reject cycles and incompatible slot types',()=>{
  const p=demoProject(),program=createProgram(p),repeat=createBlock('flow.repeat',p),wait=createBlock('flow.wait',p),condition=createBlock('check.players',p);
  program.actions=[repeat,wait];moveBlock(program,wait.id,repeat.id,'body');assert.equal(program.actions.length,1);assert.equal(repeat.body[0].id,wait.id);
  assert.throws(()=>moveBlock(program,repeat.id,repeat.id,'body'),/自|自己|자기/);
  assert.throws(()=>moveBlock(program,wait.id,'','trigger'),/종류/);
  assert.throws(()=>insertBlock(program,'','actions',condition),/연결/);
  assert.equal(repeat.body.length,1);const copy=duplicateBlock(repeat);assert.notEqual(copy.id,repeat.id);assert.notEqual(copy.body[0].id,wait.id);assert.deepEqual(copy.body[0].args,wait.args);
});
test('referenced objects remain stable after renaming and regrouping; deletion reports the event target',()=>{
  const p=demoProject(),program=createProgram(p),light=createBlock('do.tileLights',p);program.actions=[light];p.programs=[program];
  p.rooms[0].code='999';p.placements[0].areaCode='escape';p.placements[0].roomId='r2';assert.deepEqual(programIssues(p),[]);
  p.placements=p.placements.filter(q=>q.id!==light.args.placementId);const issues=programIssues(p);assert.equal(issues[0].target.id,program.id);assert.equal(issues[0].severity,'error');
  program.enabled=false;assert.equal(programIssues(p)[0].severity,'warning');
});
test('malformed event fields, excessive nesting, duplicate IDs and unexpected execution blocks are rejected',()=>{
  const p=demoProject(),program=createProgram(p);program.actions=[createBlock('flow.wait',p)];
  assert.throws(()=>readProject({...p,programs:null}),/이벤트 블록/);assert.throws(()=>readProject({...p,programs:false}),/이벤트 블록/);
  program.actions[0].args.seconds=NaN;assert.throws(()=>assertPrograms([program]),/値|값/);program.actions[0].args.seconds=3;
  assert.throws(()=>assertPrograms([program,structuredClone(program)]),/ID/);
  const root=createBlock('when.all',p);program.trigger=root;let cursor=root;for(let i=0;i<13;i++){const next=createBlock('when.all',p);cursor.items=[next];cursor=next;}
  assert.throws(()=>assertPrograms([program]),/12단계/);program.trigger=createBlock('when.start',p);program.actions[0].type='execute.javascript';assert.throws(()=>assertPrograms([program]),/알 수 없/);
});
test('empty composite triggers and branches are reported and signal re-entry loops are visible',()=>{
  const p=demoProject(),a=createProgram(p),b=createProgram(p);a.trigger=createBlock('when.all',p);a.actions=[createBlock('flow.if',p)];p.programs=[a];
  assert.ok(programIssues(p).some(i=>i.message.includes('블록을 넣으세요')));assert.ok(programIssues(p).some(i=>i.message.includes('조건을 넣으세요')));
  a.trigger=createBlock('when.signal',p);b.trigger=createBlock('when.signal',p);a.trigger.args.signal='A';b.trigger.args.signal='B';
  a.actions=[createBlock('do.signal',p)];a.actions[0].args.signal='B';b.actions=[createBlock('do.signal',p)];b.actions[0].args.signal='A';p.programs=[a,b];
  assert.ok(programIssues(p).some(i=>i.message.includes('순환')));
});
