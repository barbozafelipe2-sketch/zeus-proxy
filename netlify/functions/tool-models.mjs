import { requireUser } from './_shared/auth.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';
import { getToolWorkflow, TOOL_WORKFLOWS } from './_shared/tool-workflows.mjs';
import { imageGeneratorCandidates, toolModelCandidates } from './_shared/models.mjs';
import { modelFamily } from './_shared/provider-routing.mjs';

export default async function(req,context){
  const requestId=getRequestId(req,context,null);
  if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
  const id=new URL(req.url).searchParams.get('tool');
  if(id){const tool=getToolWorkflow(id);if(!tool)return errorJson('Unknown tool.',404,'TOOL_NOT_FOUND',requestId);
    const source=id==='images'?await imageGeneratorCandidates({limit:6}):toolModelCandidates(id,`${tool.title} ${tool.route}`,{toolId:id,toolPreferences:{}});
    const models=source.map(m=>({id:m.id,provider:m.provider,family:m.family||modelFamily(m),name:m.name||m.id}));
    return json({tool:{id:tool.id,god:tool.god,title:tool.title,route:tool.route},models,available:models.length,requested:6,requestId});
  }
  const tools=await Promise.all(Object.values(TOOL_WORKFLOWS).map(async tool=>({id:tool.id,god:tool.god,title:tool.title,route:tool.route,
    models:(tool.id==='images'?await imageGeneratorCandidates({limit:6}):toolModelCandidates(tool.id,`${tool.title} ${tool.route}`,{toolId:tool.id})).map(m=>({id:m.id,provider:m.provider,family:m.family||modelFamily(m),name:m.name||m.id}))})));
  return json({tools,requestId});
}
export const config={path:'/api/tool-models'};
