import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject} from '../dist/core.mjs';
import {workflowSteps,workflowMarkup} from '../dist/workflow.mjs';
test('checklist has only door, entry and escape checks; multiple entries and direct escape are accepted',()=>{const p=demoProject(),before=structuredClone(p);let steps=workflowSteps(p);assert.equal(steps.length,3);assert.equal(steps[1].done,true);assert.equal(steps[2].done,true);assert.deepEqual(p,before);p.gimmicks.push({...p.gimmicks.find(g=>g.type==='spawn'),id:'another-entry'});assert.equal(workflowSteps(p)[1].done,true);p.gimmicks=p.gimmicks.filter(g=>g.type!=='extraction');assert.equal(workflowSteps(p)[2].done,false);p.successMode='direct';p.objectives=[{id:'survive',required:true}];assert.equal(workflowSteps(p)[2].done,true);assert.ok(!workflowMarkup(workflowSteps(p),s=>s).includes('<button'));});
