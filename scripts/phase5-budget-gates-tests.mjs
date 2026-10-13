import assert from 'node:assert/strict';

globalThis.Netlify={env:{get:()=>''}};
const policy=await import('../netlify/functions/_shared/execution-policy.mjs');

const limits={maxCreators:3,maxCalls:10,timeoutMs:150000,maxPlanTokens:3200,maxCreatorTokens:7500,maxDirectorTokens:10000,maxCeoTokens:12000};
const small=policy.estimateTurboQuote({requirementCount:1,workstreamCount:1,limits});
assert.equal(small.creatorCount,1);
assert.equal(small.expectedCalls,4);
assert.equal(small.hardCallCap,10);
assert.equal(small.approvalRequired,false);

const heavy=policy.estimateTurboQuote({requirementCount:6,workstreamCount:3,hasFiles:true,artifactType:'zip',limits});
assert.equal(heavy.creatorCount,3);
assert.equal(heavy.expectedCalls,6);
assert.equal(heavy.approvalRequired,true);
assert.equal(heavy.timeoutSeconds,150);
assert.ok(heavy.maxOutputTokens>=45000);

const a=policy.turboApprovalFingerprint({requestId:'req-1',content:'fix all',fileIds:['b','a'],quote:heavy});
const b=policy.turboApprovalFingerprint({requestId:'req-1',content:'fix all',fileIds:['a','b'],quote:heavy});
const c=policy.turboApprovalFingerprint({requestId:'req-1',content:'different',fileIds:['a','b'],quote:heavy});
assert.equal(a,b);
assert.notEqual(a,c);

const ext=policy.externalMutationPolicy('Commit this ZIP to GitHub and deploy it.');
assert.deepEqual(ext.requested.sort(),['deploy','github_commit']);
assert.equal(ext.chatExecutionAllowed,false);

console.log('Zeus v3 phase-5 budget and external-action gate tests: PASS');
