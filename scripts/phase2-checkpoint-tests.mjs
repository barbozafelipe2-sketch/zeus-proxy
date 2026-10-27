import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runDirectedPipeline} from '../netlify/functions/_shared/zeus-directed.mjs';
const calls=[],saved=[];
const b={reserveMs:6500,remaining:()=>51000,snapshot:()=>({calls:calls.length,maxCalls:3})};
const deps={candidates:role=>[{provider:`mock-${role.toLowerCase()}`,id:role}],call:async model=>{calls.push(model.id);return model.id+' response';},family:model=>model.provider};
const done=await runDirectedPipeline({text:'Build the frontend',budget:b,onStage:s=>saved.push(s)},deps);
assert.deepEqual(calls,['CREATOR','DIRECTOR','CEO']);
assert.deepEqual(saved.map(x=>x.phaseNumber),[1,2,3]);
assert.equal(done.trace.roles.length,3);
const partial=[];let attempts=0;
await assert.rejects(()=>runDirectedPipeline({text:'Build backend',budget:b,onStage:s=>partial.push(s)},{
 ...deps,call:async model=>{attempts++;if(attempts===2)throw Error('provider failed');return model.id+' response'}
}),/provider failed/);
assert.equal(attempts,2,'failed provider must not trigger paid loop');
assert.deepEqual(partial.map(s=>s.phaseNumber),[1],'first completed phase must be checkpointed');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const ui=readFileSync('public/app.js','utf8');
const sql=readFileSync('netlify/database/migrations/20261015003000_project_sources_checkpoints/migration.sql','utf8');
const checkpoint=readFileSync('netlify/functions/_shared/phase-checkpoint.mjs','utf8');
assert.match(chat,/savePhaseCheckpoint/);
assert.match(sql,/production_checkpoints_per_execution_phase_idx/);
assert.match(checkpoint,/ON CONFLICT/);
assert.match(chat,/phases:Array\.isArray\(result\.trace\?\.roles\)/);
assert.match(ui,/const phaseNote=phases\.length\?`Stages:/);
console.log('Zeus Level 3 checkpoints and failure containment: PASS');
