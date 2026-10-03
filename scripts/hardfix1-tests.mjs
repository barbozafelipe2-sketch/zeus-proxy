import assert from 'node:assert/strict';
import { withTransaction } from '../netlify/functions/_shared/db.mjs';
import { resolveOwnedScope } from '../netlify/functions/_shared/relations.mjs';
import { getRequestId, isUuid } from '../netlify/functions/_shared/http.mjs';

function fakeDb({ projects = [], conversations = [] } = {}) {
  return {
    sql(strings, ...values) {
      const query = strings.join('?');
      if (query.includes('FROM projects')) {
        const [id, owner] = values;
        return Promise.resolve(projects.filter((p) => String(p.id) === String(id) && p.owner_id === owner));
      }
      if (query.includes('FROM conversations')) {
        const [id, owner] = values;
        return Promise.resolve(conversations.filter((c) => String(c.id) === String(id) && c.owner_id === owner));
      }
      throw new Error(`Unexpected fake query: ${query}`);
    },
  };
}

const uid = 'user-1';
const projectA = '11111111-1111-4111-8111-111111111111';
const projectB = '22222222-2222-4222-8222-222222222222';
const convA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const convB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

assert.equal(isUuid(projectA), true);
assert.equal(isUuid('not-a-uuid'), false);

{
  const req = new Request('https://example.test/api', { headers: { 'X-OlyHub-Request-ID': projectA } });
  assert.equal(getRequestId(req, {}, null), projectA, 'request id header should be reused');
}

{
  const db = fakeDb({
    projects: [{ id: projectA, owner_id: uid, name: 'A', status: 'IN_PROGRESS' }],
    conversations: [{ id: convA, owner_id: uid, project_id: projectA, title: 'A workspace' }],
  });
  const scope = await resolveOwnedScope(db, uid, { projectId: projectA, conversationId: convA });
  assert.equal(scope.projectId, projectA);
  assert.equal(scope.conversationId, convA);
  assert.equal(scope.error, undefined);
}

{
  const db = fakeDb({
    projects: [
      { id: projectA, owner_id: uid, name: 'A', status: 'IN_PROGRESS' },
      { id: projectB, owner_id: uid, name: 'B', status: 'IN_PROGRESS' },
    ],
    conversations: [{ id: convB, owner_id: uid, project_id: projectB, title: 'B workspace' }],
  });
  const scope = await resolveOwnedScope(db, uid, { projectId: projectA, conversationId: convB });
  assert.equal(scope.error?.code, 'PROJECT_CONVERSATION_MISMATCH');
}

{
  const calls = [];
  const client = { query: async (q) => { calls.push(q); return { rows: [] }; }, release: () => calls.push('RELEASE') };
  const db = { pool: { connect: async () => client } };
  const result = await withTransaction(db, async () => 'ok');
  assert.equal(result, 'ok');
  assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'RELEASE']);
}

{
  const calls = [];
  const client = { query: async (q) => { calls.push(q); return { rows: [] }; }, release: () => calls.push('RELEASE') };
  const db = { pool: { connect: async () => client } };
  await assert.rejects(() => withTransaction(db, async () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
}

console.log('Hard Fix 1 unit tests: PASS');
