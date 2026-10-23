const fail=(code,message,status=422)=>Object.assign(new Error(message),{code,status});

// Generate two complete artifacts independently. Each variant receives only the
// owner's request and project context; neither model sees the other's draft.
export async function runIndependentArtifactPair({text,context='',type,contract,images=[],budget},deps){
  const {candidates,call,family,parse}=deps;
  const ranked=candidates(text,{vision:images.length>0});
  const chosen=[];const families=new Set();
  for(const model of ranked){
    const key=family(model);
    if(!key||families.has(key))continue;
    chosen.push(model);families.add(key);
    if(chosen.length===2)break;
  }
  if(chosen.length<2)throw fail('COMPARE_FAMILIES_UNAVAILABLE','Compare & Evolve needs two configured, independent model families. No artifact was created.',409);
  const variants=[];
  for(let i=0;i<chosen.length;i++){
    const model=chosen[i],label=i===0?'A':'B';
    const system=`You are creating alternative ${label} for Compare & Evolve. This is an independent production run. Do not refer to another version or claim a comparison. Create one complete, polished ${type.toUpperCase()} deliverable for the user's goal. Do not ask questions or promise later work. Follow the server artifact contract exactly.`;
    const prompt=`OWNER GOAL:\n${String(text||'').slice(0,14000)}\n\nAPPROVED PROJECT CONTEXT:\n${String(context||'').slice(0,14000)}\n\nDELIVERABLE TYPE: ${type.toUpperCase()}\n\n${contract}`;
    const raw=await call(model,system,prompt,{budget,images,history:[],callTimeoutMs:18000,maxOutputTokens:6000});
    let parsed;
    try{parsed=parse(raw,[type],{requestText:text});}
    catch(error){throw fail(error?.code||'ARTIFACT_INCOMPLETE',`Version ${label} was not complete and validated. No partial pair was delivered.`);}
    variants.push({label,model,artifact:parsed.artifacts[0]});
  }
  return {variants,families:chosen.map(family)};
}
