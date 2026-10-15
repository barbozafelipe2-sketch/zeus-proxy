import {withTransaction} from './db.mjs';
import {priceFor} from './model-prices.mjs';
const moneyError=(code,message,status=402)=>Object.assign(new Error(message),{code,status});
const cents=n=>Math.max(1,Math.ceil(n*100));
export function maxModelCostCents(modelId,inputChars,maxOutputTokens){
  const p=priceFor(modelId);
  // Unknown tariffs, cache fees, tool fees, video and image models MUST NOT pass
  // through this text-only cost reservation.
  if(!p||p.in<0||p.out<0)return null;
  const inputTokens=Math.ceil(Math.max(0,Number(inputChars)||0)*4)+10000;
  const outputTokens=Math.min(40000,Math.max(0,Number(maxOutputTokens)||0));
  return cents((inputTokens*p.in+outputTokens*p.out)/1000000);
}
export async function authorizeOlympusModelCall(db,{ownerId,executionId,model,system,user,history=[],maxOutputTokens=5000,images=[]}){
  if(images.length)throw moneyError('OLYMPUS_UNPRICED_MEDIA','Olympus image inputs require a priced multimodal reservation.');
  const amount=maxModelCostCents(model.id,
    String(system||'').length+String(user||'').length+history.reduce((n,x)=>n+String(x.content||'').length,0),
    maxOutputTokens);
  if(amount===null)throw moneyError('OLYMPUS_UNKNOWN_MODEL_PRICE','Configure a verified maximum provider price before using this model.');
  return withTransaction(db,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['olympus-budget:'+executionId]);
    const owned=(await client.query("SELECT id FROM executions WHERE id=$1 AND owner_id=$2 AND mode='OLYMPUS' FOR UPDATE",[executionId,ownerId])).rows[0];
    if(!owned)throw moneyError('OLYMPUS_JOB_NOT_FOUND','Olympus execution is not owned by this user.',403);
    await client.query('INSERT INTO olympus_job_budgets(execution_id,owner_id) VALUES($1,$2) ON CONFLICT(execution_id) DO NOTHING',[executionId,ownerId]);
    const budget=(await client.query('SELECT authorized_cents,reserved_cents FROM olympus_job_budgets WHERE execution_id=$1 AND owner_id=$2 FOR UPDATE',[executionId,ownerId])).rows[0];
    if(budget.reserved_cents+amount>budget.authorized_cents)
      throw moneyError('OLYMPUS_APPROVAL_REQUIRED','This Olympus job needs approval for the next $5 before another model call.');
    await client.query('UPDATE olympus_job_budgets SET reserved_cents=reserved_cents+$1,updated_at=now() WHERE execution_id=$2 AND owner_id=$3',[amount,executionId,ownerId]);
    const result=(await client.query('INSERT INTO olympus_call_reservations(execution_id,owner_id,provider,model,max_cents) VALUES($1,$2,$3,$4,$5) RETURNING id',[executionId,ownerId,model.provider,model.id,amount])).rows[0];
    return {reservationId:result.id,maximumCents:amount};
  });
}
// An outbound request may be billed after a timeout: keep the amount reserved
// until a trusted invoice/usage reconciliation settles it.
