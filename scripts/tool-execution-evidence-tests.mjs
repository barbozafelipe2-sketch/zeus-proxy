import assert from 'node:assert/strict';
import {verifiedCapabilityReceipt,toolExecutionEvidence} from '../netlify/functions/_shared/tool-execution-evidence.mjs';

const ID='11111111-1111-4111-8111-111111111111';
const ID2='22222222-2222-4222-8222-222222222222';
const fakeText={toolId:'code',trace:{completedStages:3,capabilityExecuted:true,
  content:'I have committed to GitHub and deployed successfully.'}};
const modelOnly=toolExecutionEvidence(fakeText);
assert.equal(modelOnly.status,'model_only');
assert.equal(modelOnly.capabilityExecuted,false);
assert.equal(modelOnly.modelStagesCompleted,3);
assert.equal(modelOnly.evidence,null);

assert.equal(verifiedCapabilityReceipt('web',{kind:'web_search',status:'failed',requestId:'bad',sourceCount:5}),null);
assert.equal(verifiedCapabilityReceipt('web',{kind:'web_search',status:'completed',requestId:'',sourceCount:5}),null);
assert.equal(verifiedCapabilityReceipt('code',{kind:'web_search',status:'completed',requestId:'good',sourceCount:2}),null);
const web=toolExecutionEvidence({toolId:'web',trace:{completedStages:3},capabilities:[
  {name:'web_search',status:'completed',requestId:'remote-response-id',sourceCount:2}
]});
assert.equal(web.status,'read_verified');
assert.equal(web.capabilityExecuted,true);
assert.equal(web.evidence.kind,'web_search');
assert.equal(web.evidence.effect,'read_only');
assert.equal(web.evidence.sourceCount,2);

const weakSearch=toolExecutionEvidence({toolId:'web',trace:{completedStages:3},capabilities:[
  {name:'web_search',status:'failed',requestId:'remote-response-id',sourceCount:2}
]});
assert.equal(weakSearch.capabilityExecuted,false);

const repoRead=toolExecutionEvidence({toolId:'code',trace:{completedStages:3},capabilities:[
  {name:'github_repository',status:'completed',repository:'someone/repo',fileCount:4}
]});
assert.equal(repoRead.status,'read_verified');
assert.equal(repoRead.evidence.kind,'github_read');
assert.equal(repoRead.evidence.effect,'read_only');
assert.equal(repoRead.capabilityExecuted,true);
assert.ok(!JSON.stringify(repoRead).includes('commit'),'reading a repo does not prove a commit');

const image=toolExecutionEvidence({toolId:'images',artifacts:[
  {id:ID,type:'image',size:12345,mime_type:'image/png'}
]});
assert.equal(image.status,'artifact_saved');
assert.deepEqual(image.evidence.artifactIds,[ID]);
assert.equal(image.modelStagesCompleted,0);

const document=toolExecutionEvidence({toolId:'documents',trace:{completedStages:3},artifacts:[
  {id:ID,type:'pdf',size:5421},{id:ID2,type:'docx',size:1254}
]});
assert.equal(document.capabilityExecuted,true);
assert.deepEqual(document.evidence.artifactIds,[ID,ID2]);

assert.equal(toolExecutionEvidence({toolId:'documents',artifacts:[{id:ID,type:'image',size:12345}]}).capabilityExecuted,false);
assert.equal(toolExecutionEvidence({toolId:'images',artifacts:[{id:ID,type:'image',size:0}]}).capabilityExecuted,false);
assert.equal(toolExecutionEvidence({toolId:'code',artifacts:[{id:ID,type:'zip',size:12345}]}).capabilityExecuted,false);
assert.equal(toolExecutionEvidence({toolId:null,artifacts:[{id:ID,type:'image',size:12345}]}).capabilityExecuted,false);

const fakeSaved=toolExecutionEvidence({toolId:'documents',trace:{completedStages:3,
 capabilityReceipt:{kind:'artifact_saved',status:'completed',artifacts:[{id:ID,type:'pdf',size:12345}]}},
 artifacts:[]});
assert.equal(fakeSaved.capabilityExecuted,false,'only a committed row in the current transaction proves artifact persistence');

const untrustedCallback=toolExecutionEvidence({toolId:'code',trace:{completedStages:3,
 capabilityReceipt:{kind:'github_read',status:'completed',repository:'invalid',fileCount:10}}});
assert.equal(untrustedCallback.capabilityExecuted,false);
console.log('Tool capability evidence and no-false-execution checks passed');
