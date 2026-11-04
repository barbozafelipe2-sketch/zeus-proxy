import {requireUser} from './_shared/auth.mjs';
import {json,getRequestId,errorJson,isUuid} from './_shared/http.mjs';
import {redactSecrets} from './_shared/security.mjs';

// Private, read-only history search. No model or third-party service receives the query.
export function parseHistorySearchParams(url){
 const params=new URL(url).searchParams;
 const query=String(params.get('q')||'').trim();
 if(query.length<2||query.length>300)return {error:'INVALID_QUERY'};
 const projectId=params.get('projectId')||null;
 if(projectId&&!isUuid(projectId))return {error:'INVALID_PROJECT'};
 const from=params.get('from')||null,to=params.get('to')||null;
 const validDate=s=>s.length===10&&s[4]==='-'&&s[7]==='-'&&s.slice(0,4).split('').every(c=>c>='0'&&c<='9')&&[...s.slice(5,7),...s.slice(8,10)].every(c=>c>='0'&&c<='9')&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))return {error:'INVALID_DATE'};
 const limit=Math.min(30,Math.max(1,Number.parseInt(params.get('limit')||'10',10)||10));
 const scope=params.get('scope')||'all';
 if(!['all','personal','project'].includes(scope))return {error:'INVALID_SCOPE'};
 return {query,projectId,from,to,limit,scope};
}
export async function searchOwnerHistory(db,ownerId,filters){
 const {query,projectId,from,to,limit,scope}=filters;
 // Owner check applies to BOTH messages and conversations; project scope is explicit.
 // PostgreSQL simple-language search handles Portuguese, English and Spanish without stemming.
 const rows=await db.sql`
 SELECT m.id AS message_id,m.conversation_id,c.title,c.project_id,m.role,m.created_at,
        LEFT(m.content,2000) AS excerpt,
        ts_rank_cd(to_tsvector('simple',m.content),plainto_tsquery('simple',${query})) AS rank
 FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.owner_id=${ownerId}
 WHERE m.owner_id=${ownerId}
 AND m.role IN ('user','assistant')
 AND (${projectId}::uuid IS NULL OR c.project_id=${projectId}::uuid)
 AND (${scope}='all' OR (${scope}='personal' AND c.project_id IS NULL) OR (${scope}='project' AND c.project_id IS NOT NULL))
 AND (${from}::date IS NULL OR m.created_at >= ${from}::date)
 AND (${to}::date IS NULL OR m.created_at < (${to}::date + INTERVAL '1 day'))
 AND (to_tsvector('simple',m.content) @@ plainto_tsquery('simple',${query})
      OR m.content ILIKE '%' || ${query} || '%')
 ORDER BY rank DESC,m.created_at DESC,m.id DESC
 LIMIT ${limit}`;
 return rows.map(row=>({...row,excerpt:redactSecrets(String(row.excerpt||''))}));
}
export default async function handler(req,context){
 const requestId=getRequestId(req,context,null);
 if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
 const auth=await requireUser(req,requestId);
 if(auth.error)return auth.error;
 const filters=parseHistorySearchParams(req.url);
 if(filters.error)return errorJson('Invalid history search parameters.',400,filters.error,requestId);
 try{
  const results=await searchOwnerHistory(auth.db,auth.user.id,filters);
  return json({results,count:results.length,requestId});
 }catch(error){
  console.error('History search failed',requestId,{name:error?.name,code:error?.code});
  return errorJson('History search unavailable.',500,'HISTORY_SEARCH_FAILED',requestId);
 }
}
export const config={path:'/api/history/search'};
