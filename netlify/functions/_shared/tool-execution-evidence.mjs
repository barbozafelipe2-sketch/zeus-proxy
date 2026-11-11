// Server-owned proof of real capability use. Do not infer this from model prose,
// a completed LLM stage, a requested tool, or legacy capabilityExecuted booleans.
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ARTIFACT_TYPES=new Set(['pdf','docx','pptx','xlsx','csv','html','zip']);
const safeInt=(n)=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;
function safeArt(a){return Boolean(a&&typeof a==='object'&&ID.test(String(a.id||''))&&safeInt(a.size)>0);}
export function verifiedCapabilityReceipt(toolId,receipt){
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return null;
 if(receipt.kind==='web_search'&&toolId==='web'&&receipt.status==='completed'&&typeof receipt.requestId==='string'
   &&receipt.requestId.length>0&&receipt.requestId.length<=160&&safeInt(receipt.sourceCount)>0){
   return {kind:'web_search',effect:'read_only',requestId:receipt.requestId,sourceCount:Math.min(12,safeInt(receipt.sourceCount))};
 }
 if(receipt.kind==='github_read'&&['code','analysis'].includes(toolId)&&receipt.status==='completed'
   &&/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(String(receipt.repository||''))&&safeInt(receipt.fileCount)>0){
   return {kind:'github_read',effect:'read_only',repository:String(receipt.repository).slice(0,200),fileCount:Math.min(260,safeInt(receipt.fileCount))};
 }
 if(receipt.kind==='artifact_saved'&&['images','documents'].includes(toolId)
   &&Array.isArray(receipt.artifacts)&&receipt.artifacts.length>0&&receipt.artifacts.length<=12){
   const all=receipt.artifacts;
   if(!all.every(a=>safeArt(a)&&(toolId==='images'?a.type==='image':ARTIFACT_TYPES.has(a.type))))return null;
   return {kind:'artifact_saved',effect:'artifact_persisted',artifactIds:all.map(a=>a.id),count:all.length};
 }
 return null;
}
export function toolExecutionEvidence({toolId=null,trace=null,capabilities=[],artifacts=[]}={}){
 const stageCount=Math.max(0,Math.min(3,safeInt(trace?.completedStages)));
 const out={toolId:typeof toolId==='string'?toolId:null,modelStagesCompleted:stageCount,
   status:stageCount>0?'model_only':'not_executed',capabilityExecuted:false,evidence:null};
 if(!toolId)return out;
 const caps=Array.isArray(capabilities)?capabilities:[];
 const saved=Array.isArray(artifacts)?artifacts.filter(a=>safeArt(a)):[];
 // Persisted records in this same DB transaction are stronger than a model's
 // claim that an artifact was generated. A staged blob alone does not count.
 const artifactEvidence=verifiedCapabilityReceipt(toolId,{kind:'artifact_saved',artifacts:saved,status:'completed'});
 if(artifactEvidence){return {...out,status:'artifact_saved',capabilityExecuted:true,evidence:artifactEvidence};}
 if(toolId==='web'){
   const search=caps.find(c=>c?.name==='web_search'&&c?.status==='completed'&&safeInt(c.sourceCount)>0);
   const proof=verifiedCapabilityReceipt(toolId,{kind:'web_search',status:'completed',
     requestId:search?.requestId,sourceCount:search?.sourceCount});
   if(proof)return {...out,status:'read_verified',capabilityExecuted:true,evidence:proof};
 }
 if(['code','analysis'].includes(toolId)){
   const github=caps.find(c=>c?.name==='github_repository'&&c?.status==='completed'&&safeInt(c.fileCount)>0);
   const proof=verifiedCapabilityReceipt(toolId,{kind:'github_read',status:'completed',
     repository:github?.repository,fileCount:github?.fileCount});
   if(proof)return {...out,status:'read_verified',capabilityExecuted:true,evidence:proof};
 }
 // A callback is trusted only through a constrained, server-validated receipt;
 // neither a truthy callback nor arbitrary user/model-supplied JSON is proof.
 const callbackProof=verifiedCapabilityReceipt(toolId,trace?.capabilityReceipt);
 // Callback receipts may attest a verified *read*. Artifact persistence is
 // accepted only from committed artifact rows above, never from a callback.
 if(callbackProof&&callbackProof.effect==='read_only')return {...out,status:'read_verified',
   capabilityExecuted:true,evidence:callbackProof};
 return out;
}
