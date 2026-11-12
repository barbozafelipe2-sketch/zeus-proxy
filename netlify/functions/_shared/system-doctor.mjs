// Evidence-only summary. Never invokes providers, restarts workers or changes policy.
export function systemDoctor(health={}, now=new Date().toISOString()) {
  const checks=[];
  const add=(id,label,status,detail)=>checks.push({id,label,status,detail});
  add('database','Banco de dados',health.goLive?.database===true?'observed':'unknown','Conexão do workspace; não comprova todos os fluxos de escrita.');
  const storage=health.storageMaintenance;
  add('storage','Armazenamento',storage?.failed?'failed':!storage||storage.skipped?'unknown':'observed','Manutenção de blobs; upload e download exigem teste separado.');
  const configured=Object.values(health.providerReadiness||{}).filter(p=>p.configured);
  const routes=Object.values(health.transportReadiness||{}).filter(p=>p.configured);
  const states=[...configured,...routes].map(p=>p.status);
  add('providers','Provedores de IA',states.includes('observed_healthy')?'observed':states.includes('configured_unverified')?'unverified':states.length?'failed':'unavailable','Evidência das últimas 24 horas; configuração não valida todos os IDs do catálogo.');
  const q=health.queueDiagnostics;
  add('queue','Fila de tarefas',!q?'unknown':q.expired>0?'failed':q.inspected>0?'observed':'unverified',!q?'Consulta indisponível.':`${q.active} ativas; ${q.expired} com prazo expirado; ${q.inspected} registros recentes examinados${q.truncated?' (amostra limitada)':''}. Nenhuma tarefa reiniciada.`);
  const budget=health.monthlyBudget;
  add('costs','Cobertura de custos',!budget?.available?'unknown':!budget.executionCount?'unverified':budget.unpricedExecutionCount>0||budget.unknownCostExecutionCount>0?'partial':'observed','Estimativas de texto; mídia, taxas e fatura final não estão conciliadas.');
  add('deployment','Produção e controle de acesso','unverified','Confirmar destino, proteção do Netlify e smoke real; este diagnóstico não homologa produção.');
  for(const warning of health.warnings||[]) {
    const id=({providerReadiness:'providers',monthlyBudget:'costs',queueDiagnostics:'queue'})[warning.section];
    const check=checks.find(c=>c.id===id);
    if(check)check.status='unknown';
  }
  return {version:1,checkedAt:now,status:checks.some(c=>['failed','unavailable'].includes(c.status))?'blocked':'attention',providerRequests:0,checks};
}
