import {readFileSync,existsSync} from 'node:fs';
const must=(ok,message)=>{if(!ok)throw new Error('RELEASE BLOCKED: '+message)};
const src=path=>readFileSync(path,'utf8');
const conversation=src('netlify/functions/conversations.mjs');
const models=src('netlify/functions/_shared/models.mjs');
const code=src('netlify/functions/_shared/zeus-directed.mjs');
const chat=src('netlify/functions/chat.mjs');
const aliases=src('netlify/functions/artifact-aliases.mjs');
const attached=src('netlify/functions/artifact-attach.mjs');
const ui=src('public/app.js');
const planner=src('netlify/functions/_shared/production-plan.mjs');
must(conversation.includes('conversations_owner_project_canonical_idx') || (conversation.includes('merged:true')&&conversation.includes('DELETE FROM conversations')), 'project conversation transfer must use canonical merge');
must(conversation.includes('UPDATE production_checkpoints SET conversation_id='), 'conversation move must preserve checkpoints');
must(aliases.includes('project_id IS NOT DISTINCT FROM'), 'artifact aliases must stay isolated');
must(attached.includes('ARTIFACT_SCOPE_MISMATCH'), 'saved artifacts must not cross projects automatically');
must(ui.includes('sandbox="allow-scripts"')&&ui.includes("connect-src 'none'"), 'HTML preview must remain sandboxed');
must(code.includes('onStage')&&models.includes('runDirectedPipeline'), 'Zeus level 3 needs durable stage hooks');
must(chat.includes('savePhaseCheckpoint'), 'stage checkpoint writes must be connected');
must(planner.includes('initialAuthorizedCents:800')&&planner.includes('extensionCents:500'), 'Olympus budget policy must preserve owner decision');
// These are launch blockers, not placeholders: no money or paid job is approved
// by this static check. A release requires independently verified server gates.
const budgetApi=existsSync('netlify/functions/olympus-budget.mjs')
  ?src('netlify/functions/olympus-budget.mjs'):'';
const modelCallGate=models.includes('await budget.authorizeProviderCall(');
must(budgetApi.includes('withTransaction')&&budgetApi.includes('requireUser'),
 'Olympus $5 approval needs authenticated transactional server action');
must(modelCallGate, 'every Olympus paid model call must check a durable budget reservation');
must(chat.includes('body.resumeExecutionId')&&chat.includes('FROM production_checkpoints')&&code.includes('resumeStages'),
 'durable resumable phases must be integrated into server execution');
console.log('Release safety gates passed. Run npm test and validate live DB and Netlify before updating main.');
