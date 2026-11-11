// Skill Engine foundation. Existing executors remain authoritative.
import { TOOL_WORKFLOWS } from './tool-workflows.mjs';
import { getRealmName } from './realm-blueprint.mjs';
import { classifyIntent } from './intent.mjs';

const skill=(id,god,toolId=null,{internal=false}={})=>Object.freeze({id,god,toolId,enabled:Boolean(toolId),internal});
export const SKILL_REGISTRY=Object.freeze({
 'athena.research':skill('athena.research','Athena','web'),
 'athena.documents':skill('athena.documents','Athena','documents'),
 'hefesto.code':skill('hefesto.code','Hefesto','code'),
 'apollo.images':skill('apollo.images','Apollo','images'),
 'hestia.review':skill('hestia.review','Héstia','analysis',{internal:true}),
 'mnemosine.memory':skill('mnemosine.memory','Mnemosine',null,{internal:true}),
 'dionisio.media':skill('dionisio.media',getRealmName('dionisio')),
 'peitho.marketing':skill('peitho.marketing',getRealmName('peitho')),
 'demeter.business':skill('demeter.business',getRealmName('demeter')),
 'hermes.communication':skill('hermes.communication',getRealmName('hermes')),
 'hades.security':skill('hades.security',getRealmName('hades')),
 // Persisted IDs from earlier builds remain accepted, but resolve to current owners.
 'hermes.web':skill('hermes.web','Athena','web'),
 'atena.documents':skill('atena.documents','Athena','documents'),
 'apolo.images':skill('apolo.images','Apollo','images'),
 'ares.defense':skill('ares.defense','Ares'),
 'hades.health':skill('hades.health',getRealmName('hades')),
 'dionisio.video':skill('dionisio.video',getRealmName('dionisio'))
});
export const SKILL_LIMITS=Object.freeze({maxDelegations:2,maxDepth:2});

// Only classify the direct user message, never untrusted source text.
export function selectSkill({message='',activeSkillId=null,hasImage=false,hasFiles=false}={}){
 const intent=classifyIntent(message,{hasImage,hasFiles});
 let id=null;
 if(intent.action==='IMAGE_CREATE'||intent.action==='IMAGE_EDIT')id='apollo.images';
 else if(intent.action==='ARTIFACT_CREATE')id='athena.documents';
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
 return skill?.enabled?'Especialista: '+skill.god:null;
}

/**
 * Conservative automatic specialist selection. This returns a proposal only:
 * the caller must still authorize the workflow and its execution budget.
 * Never infer a specialist from external content or from a weak keyword.
 */
export function proposeAutomaticSkill({message='',hasImage=false,hasFiles=false}={}){
 const text=String(message||'').trim();
 if(!text||text.length>40000)return null;
 const intent=classifyIntent(text,{hasImage,hasFiles});
 // Image/artifact operations are handled by their existing guarded routes.
 if(intent.action==='IMAGE_CREATE'||intent.action==='IMAGE_EDIT'||intent.action==='ARTIFACT_CREATE')return null;
 const request=text.replace(/^(?:please[, ]*|por favor[, ]*|can you[, ]*|could you[, ]*|would you[, ]*|pode(?:ria)?(?:\s+(?:voce|vc))?[, ]*|voce pode[, ]*|vc pode[, ]*)/i,'');
 const coding=/^(?:corrig[ae]|implement[ae]|refator[ae]|debug|fix|implement|refactor|arregla|implementa|audit|audite|audita|review|revis[ae]|inspect|inspecione|inspeciona|analy[sz]e|analise|analisa|build|create|crie|criar|update|atualize|atualiza|test|teste)\b/i.test(request)
  &&/\b(c[oó]digo|code|bug|fun[cç][aã]o|function|repository|reposit[oó]rio|repo|codebase|script|typescript|javascript|github|branch|netlify|software|application|app)\b/i.test(request);
 const research=/^(?:pesquis[ae]|busqu[ae]|procure|search|look up|investig[ae]|compare|compar[ae]|verify|verifique|verifica)\b/i.test(request)
  &&/\b(web|internet|site|sites|online|fonte|sources|not[ií]cias|news)\b/i.test(text);
 const skillId=coding?'hefesto.code':research?'athena.research':null;
 return skillId?{skillId,toolId:SKILL_REGISTRY[skillId].toolId,reason:'explicit_user_request'}:null;
}
