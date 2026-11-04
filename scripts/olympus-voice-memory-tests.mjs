import assert from 'node:assert/strict';
import {loadVoiceMemoryContext} from '../netlify/functions/_shared/voice-memory-context.mjs';
const owner='owner-1',project='11111111-1111-4111-8111-111111111111';
const rows=[
 {id:'p1',owner_id:owner,project_id:null,approved:true,content:'Prefers Portuguese',type:'preference',created_at:new Date().toISOString()},
 {id:'p2',owner_id:owner,project_id:null,approved:false,content:'UNAPPROVED_SECRET',type:'preference'},
 {id:'pr1',owner_id:owner,project_id:project,approved:true,content:'Project uses gateway',type:'project'},
 {id:'pr2',owner_id:owner,project_id:'22222222-2222-4222-8222-222222222222',approved:true,content:'OTHER_PROJECT_SECRET',type:'project'}
];
const db={sql:async(strings,...params)=>{
 const q=strings.join('?');
 if(q.includes('FROM projects'))return [{id:project,owner_id:owner,name:'Test',status:'IN_PROGRESS'}];
 if(q.includes('FROM memories'))return rows.filter(x=>x.owner_id===params[0]&&x.approved&&(q.includes('project_id IS NULL')?x.project_id===null:x.project_id===params[1]));
 return [];
}};
const a=await loadVoiceMemoryContext(db,owner,{projectId:project});
assert.equal(a.error,undefined);
assert.match(a.memoryContext,/Prefers Portuguese/);
assert.match(a.memoryContext,/Project uses gateway/);
assert.doesNotMatch(a.memoryContext,/UNAPPROVED_SECRET|OTHER_PROJECT_SECRET/);
const b=await loadVoiceMemoryContext(db,owner,{});
assert.doesNotMatch(b.memoryContext,/Project uses gateway/);
console.log('Voice context owner/project/approval isolation: PASS');
