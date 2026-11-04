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
