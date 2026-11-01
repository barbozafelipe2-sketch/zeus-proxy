import { requireUser } from './_shared/auth.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';
import { getToolWorkflow, TOOL_WORKFLOWS } from './_shared/tool-workflows.mjs';
import { fixedImageModelCatalog, toolModelCandidates } from './_shared/models.mjs';
import { modelFamily } from './_shared/provider-routing.mjs';

function toolRoster(tool,preferences={}){
  if(tool.id==='images')return fixedImageModelCatalog();
  const roster=toolModelCandidates(tool.id,`${tool.title} ${tool.route}`,{toolId:tool.id,toolPreferences:preferences,includeUnavailable:true});
  const availableFamilies=new Set(toolModelCandidates(tool.id,`${tool.title} ${tool.route}`,{toolId:tool.id,toolPreferences:preferences}).map(modelFamily));
  return roster.map(model=>({...model,family:modelFamily(model),available:availableFamilies.has(modelFamily(model))}));
}
function toolNotice(tool,models){
  const active=models.filter(model=>model.available).length;
  if(active===6)return null;
  if(!active)return 'Nenhum modelo está ativo no Netlify AI Gateway. Ative as famílias de provedores no Gateway; o app não usa chaves diretas.';
  return `${active} de 6 modelos fixos estão ativos no Netlify AI Gateway.`;
}

export default async function(req,context){
  const requestId=getRequestId(req,context,null);
  if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
  const id=new URL(req.url).searchParams.get('tool');
  if(id){
    const tool=getToolWorkflow(id);if(!tool)return errorJson('Unknown tool.',404,'TOOL_NOT_FOUND',requestId);
    const models=toolRoster(tool);
    const available=models.filter(model=>model.available).length;
    return json({tool:{id:tool.id,god:tool.god,title:tool.title,route:tool.route},models,available,requested:6,notice:toolNotice(tool,models),requestId});
  }
  const preferences={};
  const tools=Object.values(TOOL_WORKFLOWS).map(tool=>{
    const models=toolRoster(tool,preferences);
    return {id:tool.id,god:tool.god,title:tool.title,route:tool.route,models,available:models.filter(model=>model.available).length,requested:6,notice:toolNotice(tool,models)};
  });
  return json({tools,requestId});
}
export const config={path:'/api/tool-models'};
