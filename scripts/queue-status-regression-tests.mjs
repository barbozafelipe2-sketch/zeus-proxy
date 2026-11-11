import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {executionLeaseExpired,OLYMPUS_QUEUE_LEASE_MS} from '../netlify/functions/_shared/worker-lease.mjs';

const now=Date.now();
const queued=(ms)=>({mode:'ZEUS',state:'QUEUED',lease_expires_at:new Date(now+ms).toISOString(),started_at:new Date(now-100000).toISOString()});
assert.equal(executionLeaseExpired(queued(120000),now),false,'fresh queue must not be marked expired');
assert.equal(executionLeaseExpired(queued(-1000),now),true,'expired queue must be disclosed');
assert.equal(OLYMPUS_QUEUE_LEASE_MS,720000,'queue lease must remain long enough for the fenced dispatch');
const liveWorker={mode:'OLYMPUS',state:'UNDERSTANDING',lease_expires_at:new Date(now+300000).toISOString()};
assert.equal(executionLeaseExpired(liveWorker,now),false,'active worker must not be interrupted');

const server=readFileSync('netlify/functions/chat.mjs','utf8');
const app=readFileSync('public/app.js','utf8');
assert.ok(server.includes('error_code,lease_expires_at,started_at,dispatch_token FROM executions'),'request lookup must include lease');
assert.ok(server.includes("run.state==='QUEUED'&&executionLeaseExpired(run)"),'expired queues must be marked stalled');
assert.ok(server.includes("stalled:true,errorCode:'QUEUE_LEASE_EXPIRED'"),'expired jobs are not silently retried');
assert.ok(!server.includes("if(run.state==='QUEUED')return json({...details,failed:true"),'queued jobs are not reported as a confirmed provider failure');
assert.ok(app.includes('if(data.stalled)'),'restore must surface unclaimed queue');
assert.ok(app.includes('if(status.stalled)throw apiError'),'poller must terminate an unclaimable queue');
assert.ok(app.includes("Nenhuma nova tentativa foi iniciada"),'app must avoid false retry claims');
console.log('Fenced queue expiry and no-auto-rebill status regression PASS');
