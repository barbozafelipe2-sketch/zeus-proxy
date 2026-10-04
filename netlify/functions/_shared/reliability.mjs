const normalize = (value = '') => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const RISK = /\b(auth(?:entication)?|oauth|billing|payment|payments|database|sql|migration|production|prod|delete|remove|drop|security|permission|permissions|secret|secrets|deploy|release|account|users?|dados|banco de dados|migracao|producao|apagar|excluir|remover|seguranca|permissao|segredos?|usuarios?)\b/i;
const CODE_DELIVERY = /\b(fix|implement|refactor|build|write|create|generate|code|debug|patch|function|class|api|endpoint|typescript|javascript|python|sql|deploy|corrigir|implementar|refatorar|construir|escrever|criar|gerar|codigo|depurar|funcao)\b/i;
const RESEARCH = /\b(research|latest|today|current|news|sources?|benchmark|pesquisa|mais recente|hoje|noticias?|fontes?)\b/i;
const REQUIREMENT_SIGNAL = /\b(must|need|needs|ensure|make sure|keep|preserve|remove|delete|add|fix|create|build|implement|export|generate|return|show|include|audit|review|do not|don't|never|precisa|preciso|garanta|assegure|mantenha|preserve|remova|apague|delete|adicione|corrija|crie|construa|implemente|exporte|gere|retorne|mostre|inclua|audite|revise|nao|não|nunca|quero)\b/i;
const CENTRAL = /\b(must|need|ensure|make sure|do not|don't|never|required|precisa|garanta|assegure|nao|não|nunca|obrigatorio|obrigatório)\b/i;
const WORKSTREAMS = [
  ['security', /\b(security|secure|auth(?:entication)?|oauth|privacy|permission|encryption|seguranca|autenticacao|privacidade|permissao|criptografia)\b/i],
  ['implementation', /\b(implement|code|coding|api|database|backend|refactor|debug|bug|typescript|javascript|python|sql|codigo|banco de dados|implementar|depurar)\b/i],
  ['interface', /\b(ui|ux|user interface|frontend|front-end|layout|screen|screens|wireframe|tela|telas|interface)\b/i],
  ['research', /\b(research|compare|comparison|market|competitor|benchmark|sources?|latest|pesquisa|comparar|mercado|concorrente|fontes?|mais recente)\b/i],
  ['writing', /\b(write|rewrite|essay|email|copywriting|story|book|blog|document|report|escreva|reescreva|historia|livro|documento|relatorio)\b/i],
  ['architecture', /\b(architecture|architect|system design|schema|data model|infrastructure|arquitetura|modelo de dados|infraestrutura)\b/i],
];
function compact(value,max=360){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);}
function add(items,seen,text,evidence,{kind='request',central=false}={}){
  const ev=String(evidence||'').trim(),label=compact(text);
  if(!ev||!label)return;
  const key=`${label.toLowerCase()}|${ev.toLowerCase()}`;
  if(seen.has(key))return;
  seen.add(key);items.push({id:`R${items.length+1}`,text:label,evidence:ev.slice(0,420),kind,central:Boolean(central)});
}
export function extractRequirementChecklist(text='', {action='CHAT',artifactType=null,hasFiles=false,hasImage=false}={}){
  const raw=String(text||'').trim(),items=[],seen=new Set();
  const chunks=raw.split(/\n+|(?<=[.!?;])\s+/).map(x=>x.trim()).filter(Boolean);
  for(const chunk of chunks)if(REQUIREMENT_SIGNAL.test(chunk)||/^[*-]\s+/.test(chunk)||/^\d+[.)]\s+/.test(chunk))add(items,seen,compact(chunk),chunk.slice(0,420),{central:CENTRAL.test(chunk)});
  for(const [name,re] of WORKSTREAMS){const m=raw.match(re);if(m)add(items,seen,`Requested scope: ${name} (${m[0]}).`,m[0],{kind:'scope',central:CENTRAL.test(raw.slice(Math.max(0,m.index-60),m.index+m[0].length+60))});}
  const fileMatches=raw.match(/(?:^|[\s"'(])([\w./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|sql|json|toml|ya?ml|md|css|html|pdf|docx|pptx|xlsx|csv|zip))(?:$|[\s"',)])/gi)||[];
  for(const token of fileMatches.slice(0,6)){const evidence=token.trim().replace(/^[\s"'(]+|[\s"',)]+$/g,'');add(items,seen,`Use or preserve requested file: ${evidence}.`,evidence,{kind:'file'});}
  const testMatches=raw.match(/\b(?:tsc|typecheck|type-check|lint|test(?:s|ing)?|build)\b/gi)||[];
  for(const evidence of [...new Set(testMatches.map(x=>x.toLowerCase()))].slice(0,5))add(items,seen,`Requested verification step: ${evidence}.`,evidence,{kind:'check',central:true});
  if(action==='ARTIFACT_CREATE'&&artifactType){
    const pattern=artifactType==='pptx'?'pptx|powerpoint|presentation':artifactType==='docx'?'docx|word':artifactType==='xlsx'?'xlsx|excel|spreadsheet':artifactType;
    const evidence=(raw.match(new RegExp(`\\b(?:${pattern})\\b`,'i'))||[])[0]||artifactType;
    add(items,seen,`Produce the requested ${artifactType.toUpperCase()} deliverable.`,evidence,{kind:'format',central:true});
  }
  if(action==='IMAGE_CREATE')add(items,seen,'Create the requested image.',(raw.match(/\b(image|picture|photo|logo|illustration|poster|graphic|imagem|foto|logotipo|ilustracao|arte)\b/i)||[])[0]||raw.slice(0,80),{kind:'format',central:true});
  if(action==='IMAGE_EDIT')add(items,seen,'Edit the attached image as requested.',(raw.match(/\b(edit|change|remove|replace|improve|edite|mude|remova|substitua|melhore)\b/i)||[])[0]||raw.slice(0,80),{kind:'format',central:true});
  const limited=items.slice(0,12).map((x,i)=>({...x,id:`R${i+1}`}));
  return {items:limited,ambiguous:raw.length>0&&limited.length<2&&(RISK.test(raw)||CODE_DELIVERY.test(raw)||RESEARCH.test(raw)||action==='ARTIFACT_CREATE'),hasFiles:Boolean(hasFiles),hasImage:Boolean(hasImage)};
}
export function shouldVerifyDelivery(text='', {action='CHAT',route='fast',hasFiles=false}={}){
  const t=normalize(text);
  if(action==='IMAGE_CREATE'||action==='IMAGE_EDIT')return false;
  if(RISK.test(t)||action==='ARTIFACT_CREATE'||route==='research'||RESEARCH.test(t))return true;
  if(route==='coding'&&CODE_DELIVERY.test(t))return true;
  if(route==='hard')return true;
  if(action==='ANALYZE'&&(hasFiles||/\b(audit|review|security|auditar|revisar|seguranca)\b/i.test(t)))return true;
  return false;
}
export function isWhatMissingIntent(text=''){return /\b(what(?:'s| is) missing|what did (?:you|we) miss|anything missing|what else is missing|o que falta|faltou algo|o que ficou faltando|tem algo faltando)\b/i.test(String(text||''));}
export function formatChecklist(items=[]){return (Array.isArray(items)?items:[]).map(x=>`${x.id}: ${x.text}`).join('\n');}
function parseJsonArray(raw=''){
  const text=String(raw||'').trim(),unfenced=text.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
  try{const v=JSON.parse(unfenced);return Array.isArray(v)?v:[];}catch{}
  const a=unfenced.indexOf('['),b=unfenced.lastIndexOf(']');if(a>=0&&b>a){try{const v=JSON.parse(unfenced.slice(a,b+1));return Array.isArray(v)?v:[];}catch{}}
  return [];
}
export function mergeClarifiedRequirements(base=[],raw='',requestText=''){
  const items=(Array.isArray(base)?base:[]).map(x=>({...x})),seen=new Set(items.map(x=>`${String(x.text).toLowerCase()}|${String(x.evidence).toLowerCase()}`));
  for(const row of parseJsonArray(raw)){const evidence=String(row?.evidence||'').trim(),text=compact(row?.text,360);if(!evidence||!text||!String(requestText).includes(evidence))continue;add(items,seen,text,evidence,{kind:'clarified',central:CENTRAL.test(evidence)});if(items.length>=12)break;}
  return items.map((x,i)=>({...x,id:`R${i+1}`}));
}
const BREAK_KINDS=new Set(['missing_requirement','broken_reference','empty_error_path','contradiction','unsupported_claim','unverified_claim']);
export function validateAdversaryFindings(raw='', {answer='',checklist=[],evidenceContext=''}={}){
  const source=String(answer||''),context=String(evidenceContext||''),ids=new Set((Array.isArray(checklist)?checklist:[]).map(x=>x.id)),accepted=[];
  for(const row of parseJsonArray(raw)){
    const kind=String(row?.kind||'').trim(),evidence=String(row?.evidence||'').trim(),evidenceB=String(row?.evidence_b||'').trim(),sourceEvidence=String(row?.source_evidence||'').trim(),requirementId=row?.requirement_id==null?'':String(row.requirement_id).trim(),defect=compact(row?.defect,700),suggestedFix=compact(row?.suggested_fix,700),location=compact(row?.location,240)||null;
    if(!BREAK_KINDS.has(kind)||evidence.length<2||evidence.length>700||!source.includes(evidence)||defect.length<8)continue;
    if(kind==='missing_requirement'&&(!requirementId||!ids.has(requirementId)))continue;
    if((kind==='broken_reference'||kind==='empty_error_path')&&!location)continue;
    if(kind==='contradiction'&&(!evidenceB||evidenceB===evidence||!source.includes(evidenceB)))continue;
    if((kind==='unsupported_claim'||kind==='unverified_claim')&&sourceEvidence&&!context.includes(sourceEvidence))continue;
    if(requirementId&&!ids.has(requirementId))continue;
    accepted.push({kind,requirement_id:requirementId||null,location,evidence,evidence_b:evidenceB||null,source_evidence:sourceEvidence||null,defect,suggested_fix:suggestedFix||null});
    if(accepted.length>=8)break;
  }
  return accepted;
}
export function structuralRewriteAllowed(findings=[],checklist=[]){
  const byId=new Map((Array.isArray(checklist)?checklist:[]).map(x=>[x.id,x]));
  return (Array.isArray(findings)?findings:[]).some(f=>(f.kind==='contradiction'&&f.evidence&&f.evidence_b)||(f.kind==='missing_requirement'&&f.requirement_id&&byId.get(f.requirement_id)?.central));
}
export function splitRequirementScopes(items=[]){const list=(Array.isArray(items)?items:[]).slice(0,12),a=[],b=[];list.forEach((item,i)=>(i%2===0?a:b).push(item));return [a,b];}
