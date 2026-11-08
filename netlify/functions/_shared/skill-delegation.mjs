import {authorizeSkillInvocation,SKILL_LIMITS,SKILL_REGISTRY} from './skill-engine.mjs';
export async function executeSkillDelegation({sourceSkillId,targetSkillId,allowedToolIds=[],remainingCalls=0,depth=0,delegations=0,execute}={}){
 if(typeof execute!=='function')throw new TypeError('An authorized tool executor is required');
 if(!SKILL_REGISTRY[sourceSkillId]?.enabled)return {executed:false,reason:'source_unavailable'};
 if(sourceSkillId===targetSkillId)return {executed:false,reason:'self_delegation'};
 if(depth>=SKILL_LIMITS.maxDepth||delegations>=SKILL_LIMITS.maxDelegations)return {executed:false,reason:'delegation_limit'};
 const authorization=authorizeSkillInvocation({skillId:targetSkillId,allowedToolIds,remainingCalls,depth:depth+1,delegations:delegations+1});
 if(!authorization.allowed)return {executed:false,reason:authorization.reason};
 const result=await execute({toolId:authorization.toolId,skillId:targetSkillId,depth:depth+1,delegations:delegations+1});
 const trace=result?.trace||{};
 return {executed:true,skillId:targetSkillId,toolId:authorization.toolId,trace:{sourceSkillId,targetSkillId,toolId:authorization.toolId,depth:depth+1,delegations:delegations+1,modelStagesCompleted:Number(trace.completedStages)||0,externalActionConfirmed:trace.capabilityExecuted===true,modelRoles:Array.isArray(trace.roles)?trace.roles.map(({role,provider,model,status})=>({role,provider,model,status})):[]},result};
}

export function requestedSkillDelegation(message,sourceSkillId){
 const text=String(message||'').slice(0,40000);
 if(!/(?:delegue|delegar|delegate|passe para|hand off to)/i.test(text))return null;
 const researchRequest=/\b(?:pesquis\w*|research\w*|web|fontes?|sources?)\b/i.test(text);
 const documentRequest=/\b(?:document\w*|pdf|apresenta[cç][aã]o|presentation|relat[oó]rio|report)\b/i.test(text);
 const requested=Object.values(SKILL_REGISTRY).filter(skill=>skill.enabled&&!['hermes.web','atena.documents','apolo.images'].includes(skill.id)&&skill.id!==sourceSkillId&&(
  (new RegExp('\\b'+skill.god+'\\b','i').test(text)&&skill.id!=='athena.research'&&skill.id!=='athena.documents')||
  (skill.id==='athena.research'&&/\bathena\b/i.test(text)&&researchRequest&&!documentRequest)||
  (skill.id==='athena.documents'&&/\bathena\b/i.test(text)&&documentRequest)||
  (skill.id==='hefesto.code'&&/\b(?:hefesto|hephaestus)\b/i.test(text))
 ));
 return requested.length===1?requested[0]:null;
}
