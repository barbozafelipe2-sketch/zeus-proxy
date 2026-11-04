import {MEMORY_POLICY} from './memory.mjs';
import {retrieveConversationMemory} from './olympus-memory-retrieval.mjs';
import {resolveOwnedScope} from './relations.mjs';
export async function loadVoiceMemoryContext(db,ownerId,{projectId=null,conversationId=null}={}){
 const scope=await resolveOwnedScope(db,ownerId,{projectId,conversationId});
 if(scope.error)return {error:scope.error};
 const personalRows=await db.sql`SELECT id,project_id,type,content,source,confidence,approved,created_at FROM memories WHERE owner_id=${ownerId} AND project_id IS NULL AND approved=true ORDER BY created_at DESC LIMIT ${MEMORY_POLICY.candidateLimit}`;
 let projectRows=[];
 if(scope.projectId)projectRows=await db.sql`SELECT id,project_id,type,content,source,confidence,approved,created_at FROM memories WHERE owner_id=${ownerId} AND project_id=${scope.projectId} AND approved=true ORDER BY created_at DESC LIMIT ${MEMORY_POLICY.candidateLimit}`;
 const selected=retrieveConversationMemory({personalRows,projectRows,query:'',projectId:scope.projectId,personalPolicy:{...MEMORY_POLICY,maxItems:12,maxChars:4000,perItemChars:600},projectPolicy:{...MEMORY_POLICY,maxItems:12,maxChars:4000,perItemChars:600}});
 const sections=[];
 if(selected.personalText)sections.push('PERSONAL MEMORY (approved):\n'+selected.personalText);
 if(selected.projectText)sections.push('PROJECT MEMORY (approved; scoped to active project):\n'+selected.projectText);
 return {memoryContext:sections.join('\n\n').slice(0,8000),projectId:scope.projectId,conversationId:scope.conversationId};
}
