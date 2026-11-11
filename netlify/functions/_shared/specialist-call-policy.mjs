// Call budget for specialist Realms. Selection is deterministic and only
// inspects the owner's current request, never retrieved web/GitHub content.
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().slice(0,20000);
export function specialistCallPlan({toolId=null,text='',intentAction=''}={}){
 const request=normalize(text);
 const image=intentAction==='IMAGE_CREATE'||intentAction==='IMAGE_EDIT';
 const triple=/(?:\b(?:3|three|tres)\s+(?:(?:different|independent|diferentes|independentes)\s+)?(?:models?|modelos|ias?|agents?|agentes?)\b)|(?:\b(?:models?|modelos|ias?)\s+(?:independent\s+)?(?:x\s*3|3\s+times)\b)/i.test(request);
 const independent=/(?:\b(?:independent\s+(?:review|audit|critic)|second\s+opinion|cross.check|two\s+(?:models?|agents?)|dual\s+review|audit|auditing|audita|audite|auditoria|revisao\s+independente|segunda\s+opiniao|duas\s+(?:ias|modelos))\b)/i.test(request);
 const stages=triple?3:independent?2:1;
 // Explicit owner request only; do not silently double the image cost.
 const imagePlanning=image&&/(?:\b(?:planejamento\s+visual\s+(?:antes|previo)|briefing\s+visual\s+(?:antes|previo)|visual\s+planning\s+before\s+generating|two\s+planning\s+models|dois\s+modelos\s+de\s+planejamento)\b)/i.test(request);
 const poseidonSynthesis=!image&&/(?:\bposeidon\b.{0,80}\b(?:sintetiz|sintetise|synthesi[sz]|resum|resumir|finaliz|consolidat)|\b(?:sintetiz|sintetise|synthesi[sz]|resumir|consolidat).{0,80}\bposeidon\b)/i.test(request);
 return Object.freeze({
   toolId:typeof toolId==='string'?toolId:null,
   modelStages:image?0:stages,
   imagePlanning:Boolean(imagePlanning),
   poseidonSynthesis:Boolean(poseidonSynthesis),
   reason:image?(imagePlanning?'explicit_visual_preflight':'direct_image_generator'):
     triple?'explicit_three_model_review':independent?'explicit_independent_review':'single_specialist_default'
 });
}
export function specialistMaxCalls(plan,{web=false,delegation=false,imageAttempts=1}={}){
 if(plan?.imagePlanning)return Math.max(1,Math.min(6,Math.trunc(imageAttempts)||1))+2;
 if(plan?.modelStages===0)return Math.max(1,Math.min(6,Math.trunc(imageAttempts)||1));
 const stages=Math.max(1,Math.min(3,Math.trunc(Number(plan?.modelStages)||1)));
 // Allow ONE failure recovery attempt without eagerly calling a backup model.
 // An explicit second specialist has its own call and a shared fallback reserve.
 return stages+1+Number(Boolean(web))+Number(Boolean(delegation))+Number(Boolean(plan?.poseidonSynthesis));
}
