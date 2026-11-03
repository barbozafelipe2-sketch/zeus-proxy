// Skill Engine foundation. Existing executors remain authoritative.
import { TOOL_WORKFLOWS } from './tool-workflows.mjs';
import { classifyIntent } from './intent.mjs';

const skill=(id,god,toolId=null)=>Object.freeze({id,god,toolId,enabled:Boolean(toolId)});
export const SKILL_REGISTRY=Object.freeze({
 'hermes.web':skill('hermes.web','Hermes','web'),
 'hefesto.code':skill('hefesto.code','Hephaestus','code'),
 'apolo.images':skill('apolo.images','Apollo','images'),
 'atena.documents':skill('atena.documents','Athena','documents'),
 'hestia.review':skill('hestia.review','Hestia','analysis'),
 'ares.defense':skill('ares.defense','Ares'),
 'mnemosine.memory':skill('mnemosine.memory','Mnemosine'),
 'hades.health':skill('hades.health','Hades'),
 'dionisio.video':skill('dionisio.video','Dionysus')
});
export const SKILL_LIMITS=Object.freeze({maxDelegations:2,maxDepth:2});

// Only classify the direct user message, never untrusted source text.
export function selectSkill({message='',activeSkillId=null,hasImage=false,hasFiles=false}={}){
 const intent=classifyIntent(message,{hasImage,hasFiles});
 let id=null;
 if(intent.action==='IMAGE_CREATE'||intent.action==='IMAGE_EDIT')id='apolo.images';
 else if(intent.action==='ARTIFACT_CREATE')id='atena.documents';
 else if(activeSkillId&&Object.hasOwn(SKILL_REGISTRY,activeSkillId))id=activeSkillId;
 const skill=id?SKILL_REGISTRY[id]:null;
 return {intent,skillId:id,toolId:skill?.enabled?skill.toolId:null,
  executorGod:skill?.enabled?skill.god:null,
  status:skill?(skill.enabled?'available':'not_implemented'):'existing_router',
  delegated:Boolean(id&&activeSkillId&&id!==activeSkillId)};
}

// Permission and budget are provided by the already-authorized execution.
// No skill can grant itself access or inherit the opened skill's privileges.
export function authorizeSkillInvocation({skillId,allowedToolIds=[],remainingCalls=0,depth=0,delegations=0}={}){
 const skill=SKILL_REGISTRY[skillId];
 if(!skill?.enabled||!skill.toolId||!TOOL_WORKFLOWS[skill.toolId])return {allowed:false,reason:'skill_unavailable'};
 if(!Array.isArray(allowedToolIds)||!allowedToolIds.includes(skill.toolId))return {allowed:false,reason:'permission_denied'};
 if(!Number.isSafeInteger(remainingCalls)||remainingCalls<=0)return {allowed:false,reason:'budget_exhausted'};
 if(!Number.isSafeInteger(depth)||depth<0||depth>SKILL_LIMITS.maxDepth||!Number.isSafeInteger(delegations)||delegations<0||delegations>SKILL_LIMITS.maxDelegations)return {allowed:false,reason:'delegation_limit'};
 return {allowed:true,reason:'authorized',toolId:skill.toolId,executorGod:skill.god};
}
export function skillExecutionLabel(skillId){
 const skill=SKILL_REGISTRY[skillId];
 return skill?.enabled?'Executado por '+skill.god:null;
}
