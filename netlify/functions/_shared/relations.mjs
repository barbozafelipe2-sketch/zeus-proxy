import { isUuid } from './http.mjs';

export async function resolveOwnedScope(db, ownerId, { projectId = null, conversationId = null } = {}) {
  let project = null;
  let conversation = null;

  if (projectId) {
    if (!isUuid(projectId)) return { error: { status: 400, code: 'INVALID_PROJECT_ID', message: 'Invalid project id.' } };
    const rows = await db.sql`SELECT id,owner_id,name,status FROM projects WHERE id=${projectId} AND owner_id=${ownerId}`;
    if (!rows.length) return { error: { status: 404, code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } };
    project = rows[0];
  }

  if (conversationId) {
    if (!isUuid(conversationId)) return { error: { status: 400, code: 'INVALID_CONVERSATION_ID', message: 'Invalid conversation id.' } };
    const rows = await db.sql`SELECT id,owner_id,project_id,title FROM conversations WHERE id=${conversationId} AND owner_id=${ownerId}`;
    if (!rows.length) return { error: { status: 404, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.' } };
    conversation = rows[0];
    if (projectId && String(conversation.project_id || '') !== String(projectId)) {
      return { error: { status: 409, code: 'PROJECT_CONVERSATION_MISMATCH', message: 'Conversation does not belong to this project.' } };
    }
    if (!projectId && conversation.project_id) {
      projectId = conversation.project_id;
      const rows2 = await db.sql`SELECT id,owner_id,name,status FROM projects WHERE id=${projectId} AND owner_id=${ownerId}`;
      if (!rows2.length) return { error: { status: 409, code: 'ORPHANED_CONVERSATION', message: 'Conversation project is no longer available.' } };
      project = rows2[0];
    }
  }

  return { projectId: projectId || null, conversationId: conversationId || null, project, conversation };
}
