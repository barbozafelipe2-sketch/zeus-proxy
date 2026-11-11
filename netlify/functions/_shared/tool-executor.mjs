import {getToolWorkflow} from './tool-workflows.mjs';
import {verifiedCapabilityReceipt} from './tool-execution-evidence.mjs';
export class ToolExecutionError extends Error{constructor(message,code='TOOL_PIPELINE_INCOMPLETE',details={}){super(message);this.name='ToolExecutionError';this.code=code;this.status=503;this.details=details;}}
function isPoseidonCoordinatorModel(model){return String(model?.family||'').toLowerCase()==='xai'||(String(model?.provider||'').toLowerCase()==='openrouter'&&/^x-ai\//i.test(String(model?.id||'')));}
export async function executeThreeModelTool({toolId,input,context='',budget,models,invoke,capability=null,onStage=null}){
 const tool=getToolWorkflow(toolId);
 if(!tool)throw new ToolExecutionError('Unknown tool.','TOOL_UNKNOWN');
 if(typeof models!=='function'||typeof invoke!=='function')throw new TypeError('Missing model selection or invocation.');
 const completed=[],attempts=[],usedFamilies=new Set(),usedModels=new Set();
 let output=String(input||'');
 for(const role of ['CREATOR','DIRECTOR','CEO']){
  const choices=await models({tool,role,input,usedFamilies:[...usedFamilies],usedModels:[...usedModels]});
  const eligible=(Array.isArray(choices)?choices:[]).filter(m=>m?.provider&&m?.id&&m?.family&&!isPoseidonCoordinatorModel(m)&&!usedFamilies.has(m.family)&&!usedModels.has(m.provider+':'+m.id));
  if(!eligible.length)throw new ToolExecutionError('Independent model unavailable for '+role,'TOOL_MODEL_UNAVAILABLE',{completed,attempts});
  let success=false;
  for(const model of eligible){
   if(budget?.canCall&&!budget.canCall())break;
   const started=Date.now();
   try{
    const result=await invoke({tool,role,model,input,context,previous:output,budget});
    const value=typeof result==='string'?result:result?.content;
    if(typeof value!=='string'||!value.trim())throw Error('Empty model result');
    output=value;
    const entry={role,provider:model.provider,model:model.id,family:model.family,status:'completed',durationMs:Date.now()-started};
    completed.push(entry);attempts.push(entry);usedFamilies.add(model.family);usedModels.add(model.provider+':'+model.id);
    success=true;
    // Reporting failures must not turn a completed paid model call into a retry.
    // Keep the completed trace intact and fail explicitly if the observer fails.
    if(onStage){
     try{await onStage({...entry,content:output});}
     catch(error){throw new ToolExecutionError('Stage reporting failed: '+role,'TOOL_STAGE_REPORT_FAILED',{completed,attempts,causeCode:String(error?.code||'STAGE_REPORT_FAILED').slice(0,80)});}
    }
    break;
   }catch(error){
    if(error instanceof ToolExecutionError&&error.code==='TOOL_STAGE_REPORT_FAILED')throw error;
    attempts.push({role,provider:model.provider,model:model.id,family:model.family,status:'failed',durationMs:Date.now()-started,code:String(error?.code||'MODEL_CALL_FAILED').slice(0,80)});
   }
  }
  if(!success)throw new ToolExecutionError('Stage failed: '+role,'TOOL_PIPELINE_INCOMPLETE',{completed,attempts});
 }
 const capabilityResult=capability?await capability({tool,input,context,brief:output,roles:completed,budget}):null;
 // A callback being supplied is NOT evidence. Artifact persistence can only
 // be confirmed later by finalizeTurn after the DB insert succeeds.
 const candidate=verifiedCapabilityReceipt(toolId,capabilityResult?.receipt);
 const receipt=candidate?.kind==='artifact_saved'?null:candidate;
 const artifact=capabilityResult&&typeof capabilityResult==='object'&&Object.hasOwn(capabilityResult,'artifact')
  ?capabilityResult.artifact:capabilityResult;
 return {content:output,artifact,leadModel:completed[2].provider+':'+completed[2].model,effectiveMode:'ZEUS',pipelineLabel:tool.god+' · three model analysis stages',
  trace:{strategy:'tool_three_model_executor',toolId,roles:completed,attempts,completedStages:3,independentFamilies:true,
   capabilityAttempted:Boolean(capability),capabilityExecuted:Boolean(receipt),capabilityReceipt:receipt}};
}
