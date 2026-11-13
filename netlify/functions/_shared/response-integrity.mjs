// Ground the model-identity answer in the model actually recorded by the backend,
// not in an LLM's self-description or in a preferred-model setting.
export function isModelIdentityQuestion(text=''){
 const value=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 return /^(?:oi[, ]*)?(?:qual|que)\s+(?:e\s+o\s+)?modelo\b.{0,100}(?:usando|usa\b|utiliza|usou|respondeu|resposta|rodando|ativo)/.test(value)
  || /^(?:which|what)\s+model\b.{0,100}(?:using|used|answered|running|is this)/.test(value)
  || /^(?:que|cual)\s+modelo\b.{0,100}(?:usas|usando|respondi[oó]|utiliza)/.test(value);
}
export function actualModelAnswer(leadModel){
 const value=String(leadModel||'').trim();
 const parsed=/^([a-z][a-z0-9_-]{0,32}):([a-zA-Z0-9_./-]{2,100})$/.exec(value);
 if(!parsed)return null;
 const provider=parsed[1]==='openrouter'?'OpenRouter':parsed[1];
 return `O modelo que gerou **esta resposta** foi **${parsed[2]}**, via **${provider}**. Essa identificação vem da execução registrada pelo servidor, não da autodescrição do modelo.`;
}
export function addUnverifiedWebNotice(answer,{needsCurrentEvidence=false,hasSources=false}={}){
 const body=String(answer||'');
 if(!needsCurrentEvidence||hasSources||!body.trim())return body;
 return body+'\n\n**Verificação pendente:** não foram recebidas fontes verificáveis nesta execução. Informações atuais não devem ser tratadas como confirmadas.';
}
