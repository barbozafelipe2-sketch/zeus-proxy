import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicExecutionFailure } from '../netlify/functions/_shared/execution-error.mjs';

const base=readFileSync('netlify/database/migrations/20260930044607_create_olyhub_foundation/migration.sql','utf8');
const patch=readFileSync('netlify/database/migrations/20261013180000_add_queued_execution_state/migration.sql','utf8');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');

const match=base.match(/CREATE TYPE "execution_state" AS ENUM\(([^)]+)\)/);
assert.ok(match,'initial execution_state enum must exist');
const validStates=new Set([...match[1].matchAll(/'([A-Z_]+)'/g)].map(m=>m[1]));
assert.ok(!validStates.has('QUEUED'),'existing applied migration must remain unchanged');
assert.match(patch,/ALTER TYPE "execution_state" ADD VALUE IF NOT EXISTS 'QUEUED';/);
assert.equal((patch.split('\n').filter(line=>!/^\s*--/.test(line)).join('\n').match(/\bALTER TYPE\b/g)||[]).length,1,'one executable additive schema change only');
validStates.add('QUEUED');
for(const [,state] of chat.matchAll(/UPDATE executions SET state='([A-Z_]+)'/g)){
  assert.ok(validStates.has(state),'execution state not declared in migrations: '+state);
}
assert.ok(chat.includes("state='QUEUED'"),'Olympus background queue must remain enabled');
assert.ok(chat.includes("publicFailure=publicExecutionFailure(error)"),'unsafe DB errors must be normalized');
assert.ok(chat.includes('return errorJson(publicFailure.message'),'raw error text must not reach the client');
assert.ok(chat.includes('const safeAttempts='),'provider upstream errors must be suppressed');

const raw='Failed query: UPDATE executions SET state=\'QUEUED\' WHERE id=$1 AND owner_id=$2 params: 123e4567-e89b-12d3-a456-426614174000,zeus-personal-owner · ref 4130147d';
const detail=publicExecutionFailure(new Error(raw));
assert.equal(detail.status,503);
assert.equal(detail.code,'DATABASE_QUERY_FAILED');
assert.ok(!JSON.stringify(detail).includes('123e4567'),'no SQL params or user identifiers leak');
assert.ok(!JSON.stringify(detail).includes('UPDATE executions'),'no SQL exposed');
assert.ok(!JSON.stringify(detail).includes('zeus-personal-owner'),'no owner id exposed');

assert.equal(publicExecutionFailure({name:'DrizzleQueryError',message:'opaque'}).code,'DATABASE_QUERY_FAILED');
assert.equal(publicExecutionFailure({cause:{code:'22P02'},message:'bad enum'}).code,'DATABASE_QUERY_FAILED');
assert.equal(publicExecutionFailure({code:'AI_REQUEST_REJECTED',status:413,message:'prompt leaked here'}).code,'AI_REQUEST_REJECTED');
assert.ok(!JSON.stringify(publicExecutionFailure({code:'AI_REQUEST_REJECTED',status:413,message:'prompt leaked here'})).includes('prompt leaked'));
assert.equal(publicExecutionFailure(new Error('Bearer secret-upload-key here')).code,'AI_EXECUTION_FAILED');
console.log('Zeus queue schema migration + safe database error contract: PASS');
