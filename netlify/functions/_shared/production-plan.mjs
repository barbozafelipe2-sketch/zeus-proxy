// Pure planning policy. It must never contact an AI or paid provider.
// This policy is deliberately independent from the current runtime router:
// wiring it into chat/worker execution requires subsequent audited changes.
const ZEUS_ROLES=Object.freeze({
  L1:['specialist'],
  L2:['domain_specialist','domain_director'],
  L3:['domain_specialist','domain_director','generalist_ceo']
});
export const OLYMPUS_JOB_BUDGET=Object.freeze({
  optimizationTargetCents:650,
  initialAuthorizedCents:800,
  extensionCents:500,
  monthlyAdvisoryCents:6000
});
const allowedModes=new Set(['ZEUS','OLYMPUS']);
const allowedOperations=new Set(['discuss','preview','create','edit','assemble','audit']);
const clamp=(x,min,max)=>Math.max(min,Math.min(max,Math.floor(Number(x)||0)));
function uniqueDomains(input){
  return [...new Set((Array.isArray(input)?input:[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean))].slice(0,12);
}
function subjectIsSimple(op,requirements,domains,existing){
  return op==='discuss'&&requirements<=1&&domains.length<=1&&existing===0;
}
// The user's selected mode is authoritative. Multi-domain scope does not force
// Olympus; manual Zeus can work through domains as checkpoints.
export function planProduction({
  mode='ZEUS',operation='discuss',domains=[],requirementCount=0,
  estimatedSeconds=0,estimatedOutputTokens=0,existingArtifacts=0,
  userPhasePreference='adaptive',userLevelPreference='adaptive',
  hasFiles=false
}={}){
  const selectedMode=allowedModes.has(String(mode).toUpperCase())?String(mode).toUpperCase():'ZEUS';
  const op=allowedOperations.has(operation)?operation:'discuss';
  const fields=uniqueDomains(domains);
  const requirements=clamp(requirementCount,0,10000);
  const seconds=clamp(estimatedSeconds,0,86400);
  const outputTokens=clamp(estimatedOutputTokens,0,1000000);
  const existing=clamp(existingArtifacts,0,10000);
  const isWork=op!=='discuss';
  const isPreview=op==='preview';
  let level='L1';
  if(selectedMode==='OLYMPUS')level='OLYMPUS';
  else if(isPreview||op==='create'||op==='edit')level='L2';
  if(selectedMode==='ZEUS'&&(op==='assemble'||op==='audit'||requirements>=5&&isWork||isWork&&seconds>=40||isWork&&outputTokens>=7000||isWork&&fields.length>=2))level='L3';
  if(selectedMode==='ZEUS'&&subjectIsSimple(op,requirements,fields,existing))level='L1';
  // Explicit owner control is respected even for tasks that look larger.
  if(selectedMode==='ZEUS'&&['L1','L2','L3'].includes(userLevelPreference))level=userLevelPreference;
  let phaseCount=0;
  if(isWork){
    phaseCount=1;
    // Phase splitting is about bounded work/timeout risk, not "use the whole budget".
    if(seconds>=45||outputTokens>=7000||requirements>=6||fields.length>=2&&op!=='preview')phaseCount=2;
    if(seconds>=105||outputTokens>=15000||requirements>=12||fields.length>=3&&requirements>=7)phaseCount=3;
    if(seconds>=180||outputTokens>=30000||requirements>=25)phaseCount=4;
    if(isPreview)phaseCount=1;
  }
  if(userPhasePreference==='single'&&isWork)phaseCount=1;
  else if(Number.isInteger(userPhasePreference)&&userPhasePreference>=1&&userPhasePreference<=8&&isWork)phaseCount=userPhasePreference;
  const roles=selectedMode==='OLYMPUS'
    ?fields.length>=2?['domain_specialist_a','domain_specialist_b','generalist_director','generalist_ceo']:['domain_specialist','generalist_director','generalist_ceo']
    :ZEUS_ROLES[level];
  const reasons=[];
  if(selectedMode==='OLYMPUS')reasons.push('owner_selected_olympus');
  if(fields.length>1)reasons.push('multi_domain');
  if(existing>0)reasons.push('reuse_existing_artifacts');
  if(hasFiles)reasons.push('has_user_files');
  if(phaseCount>1)reasons.push('checkpoint_to_avoid_timeouts');
  if(userLevelPreference!=='adaptive'||userPhasePreference!=='adaptive')reasons.push('owner_override');
  return Object.freeze({
    selectedMode,level,roles:[...roles],operation:op,domains:fields,
    phaseCount,requiresPersistentWorkspace:existing>0||phaseCount>1||isWork,
    preserveConversation:true,modelCallsForRouting:0,
    canReuseArtifacts:existing>0,
    reasons,planner:'deterministic_zero_token',
    note:'Planning only. No paid calls or runtime execution are started by this decision.'
  });
}
// This is a PURE quote/admission decision. The future server-side accounting
// layer must apply it inside a serialized transaction tied to user/job identity.
export function evaluateOlympusAuthorization({
  authorizedCents=800,spentCents=0,reservedCents=0,
  nextUpperBoundCents=0,uncertainUsageCents=0
}={}){
  const authorized=clamp(authorizedCents,0,1000000);
  const spent=clamp(spentCents,0,1000000);
  const reserved=clamp(reservedCents,0,1000000);
  const uncertain=clamp(uncertainUsageCents,0,1000000);
  const next=clamp(nextUpperBoundCents,0,1000000);
  const remaining=Math.max(0,authorized-spent-reserved-uncertain);
  return Object.freeze({
    allowed:next<=remaining,
    authorizedCents:authorized,
    estimatedCommittedCents:spent+reserved+uncertain,
    remainingCents:remaining,
    nextUpperBoundCents:next,
    nextIncrementCents:OLYMPUS_JOB_BUDGET.extensionCents,
    requiresExplicitAdditionalApproval:next>remaining,
    // One $5 approval only. Never loop or preauthorize a second increment.
    potentialNextCeilingCents:authorized+OLYMPUS_JOB_BUDGET.extensionCents
  });
}
