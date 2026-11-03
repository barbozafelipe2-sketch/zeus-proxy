import {selectMemoryContext,formatMemoryContext} from './memory.mjs';
import {relevanceScore} from './context.mjs';
// Query-aware ranking, retaining the existing approved-memory selection policy.
export function retrieveApprovedMemory(rows,query,policy,{projectId=null}={}){
 const approved=(Array.isArray(rows)?rows:[]).filter(r=>r&&r.approved===true&&(projectId===null?r.project_id==null:r.project_id===projectId)&&r.status!=='archived'&&r.status!=='superseded');
 const ranked=approved.map(r=>({...r,_score:relevanceScore(query,r.content||''),_time:Date.parse(r.updated_at||r.created_at||0)||0}))
  .sort((a,b)=>b._score-a._score||b._time-a._time);
 const selection=selectMemoryContext(ranked,policy);
 // Existing selector orders by authority; prioritize query matches without overriding approval.
 selection.selected.sort((a,b)=>(b._score||0)-(a._score||0));
 return {selection,text:formatMemoryContext(selection)};
}
