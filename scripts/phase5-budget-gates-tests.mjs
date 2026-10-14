import assert from 'node:assert/strict';

globalThis.Netlify={env:{get:()=>''}};
const policy=await import('../netlify/functions/_shared/execution-policy.mjs');

const limits={maxCreators:2,maxCalls:4,timeoutMs:150000,maxCreatorTokens:7500,maxDirectorTokens:10000,maxCeoTokens:12000};
const normal=policy.estimateTurboQuote({requirementCount:6,workstreamCount:3,hasFiles:true,limits});
assert.equal(normal.creatorCount,2,'Turbo = 2 specialists');
assert.equal(normal.expectedCalls,4,'2 specialists + manager + CEO, no Planner');
assert.equal(normal.hardCallCap,4);
assert.equal(normal.approvalRequired,false,'a normal 4-call Turbo run must not need approval');
assert.equal(normal.timeoutSeconds,150);

// Caps cannot be raised even if a caller passes bigger limits.
const forced=policy.estimateTurboQuote({requirementCount:30,workstreamCount:9,limits:{...limits,maxCreators:9,maxCalls:20}});
assert.equal(forced.hardCallCap,4);
assert.equal(forced.creatorCount,2);
assert.ok(forced.expectedCalls<=4);
const heavy=forced;

const a=policy.turboApprovalFingerprint({requestId:'req-1',content:'fix all',fileIds:['b','a'],quote:heavy});
const b=policy.turboApprovalFingerprint({requestId:'req-1',content:'fix all',fileIds:['a','b'],quote:heavy});
const c=policy.turboApprovalFingerprint({requestId:'req-1',content:'different',fileIds:['a','b'],quote:heavy});
assert.equal(a,b);
assert.notEqual(a,c);

const ext=policy.externalMutationPolicy('Commit this ZIP to GitHub and deploy it.');
assert.deepEqual(ext.requested.sort(),['deploy','github_commit']);
assert.equal(ext.chatExecutionAllowed,false);

console.log('Zeus v3 phase-5 budget and external-action gate tests: PASS');
