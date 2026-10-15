// Server-only checkpoint writes. The caller must already own this execution.
export async function savePhaseCheckpoint(db,{ownerId,executionId,projectId=null,conversationId,phaseNumber,phaseLabel,content,model}){
  if(!ownerId||!executionId||!conversationId||![1,2,3].includes(phaseNumber))throw Error('Invalid phase checkpoint');
  const manifest={content:String(content||'').slice(0,40000),model:String(model||'').slice(0,200),recordedAt:new Date().toISOString()};
  const [row]=await db.sql`INSERT INTO production_checkpoints(owner_id,project_id,conversation_id,execution_id,phase_number,phase_label,state,manifest)
    SELECT ${ownerId},${projectId},${conversationId},id,${phaseNumber},${phaseLabel},'COMPLETED',${manifest}
    FROM executions WHERE id=${executionId} AND owner_id=${ownerId} AND conversation_id=${conversationId}
    ON CONFLICT (owner_id,execution_id,phase_number) WHERE execution_id IS NOT NULL
    DO UPDATE SET phase_label=EXCLUDED.phase_label,state='COMPLETED',manifest=EXCLUDED.manifest,updated_at=now()
    RETURNING id,phase_number,state`;
  if(!row)throw Error('Checkpoint owner validation failed');
  return row;
}
