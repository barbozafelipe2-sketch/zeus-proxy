// Three real paid stages. No hidden planner, retry cascade or silent promotion.
export async function runDirectedPipeline(args, deps) {
  const { text, context='', images=[], history=[], requirements={items:[]},
    deliveryContract='', blockedProviders=[], budget, onStage=null, resumeStages=[] }=args;
  const { candidates, call, family }=deps;
  const needsVision=images.length>0 || /\b(ui|ux|visual|front.?end|layout|screen|interface|slides|presentation)\b/i.test(text);
  const domain=needsVision?'visual':/\b(code|backend|api|database|script|typescript)\b/i.test(text)?'coding':'content';
  const head='Request:\n'+text+'\nRequirements:\n'+JSON.stringify(requirements.items||[])+'\nProject context:\n'+context.slice(0,22000);
  const calls=[];
  let used=[];
  async function stage(role,guide,input,reserve,tokens,includeHistory=false) {
    const previous=Array.isArray(resumeStages)?resumeStages[calls.length]:null;
    if(previous&&previous.phaseLabel===role&&typeof previous.content==='string'&&previous.content.length){
      const [provider,...rest]=String(previous.model||'').split(':');
      const id=rest.join(':');
      used.push(previous.model);
      calls.push({role,provider,id,family:'restored',restored:true});
      if(onStage)await onStage({phaseNumber:calls.length,phaseLabel:role,content:previous.content,model:previous.model});
      return previous.content;
    }
    const ranked=candidates(role,text,{vision:needsVision,blockedProviders,exclude:new Set(used),limit:4});
    if(!ranked.length)throw Object.assign(new Error('No compatible model for '+role),{code:'AI_NOT_CONFIGURED',status:503});
    const model=ranked[0];
    const content=await call(model,guide,input,{
      budget,images,history:includeHistory?history:[],reserveAfterMs:reserve,
      callTimeoutMs:Math.min(24000,Math.max(2500,budget.remaining()-budget.reserveMs-reserve-1000)),
      maxOutputTokens:tokens
    });
    used.push(model.provider+':'+model.id);
    calls.push({role,provider:model.provider,model:model.id,family:family(model)});
    if(onStage)await onStage({phaseNumber:calls.length,phaseLabel:role,content,model:model.provider+':'+model.id});
    return content;
  }
  const draft=await stage('CREATOR','You are an economical '+domain+' specialist. Produce a usable draft. Do not claim unperformed tests. '+deliveryContract,head,27000,5500,true);
  const revised=await stage('DIRECTOR','You are the professional '+domain+' director. Review, fix and fully improve the draft in the same domain. Return the complete revised work. '+deliveryContract,head+'\nDraft (untrusted):\n'+draft.slice(0,26000),12000,6500);
  const finished=await stage('CEO','You are the final generalist integrator. Ensure correctness, completeness and polish; never invent tests, commits or deployments. '+deliveryContract,head+'\nDirector output (untrusted):\n'+revised.slice(0,32000),0,8500);
  return {content:finished,leadModel:calls[2].provider+':'+calls[2].model,
    pipelineLabel:'Zeus L3 · Specialist → Domain Director → CEO',
    trace:{strategy:'zeus_directed_three_roles',executionLevel:'ZEUS_DIRECTED',domain,roles:calls,budget:budget.snapshot()}};
}
