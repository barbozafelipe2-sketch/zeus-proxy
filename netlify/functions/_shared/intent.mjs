const normalize = (value = '') => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ANALYZE = /\b(analy[sz]e|analysis|review|inspect|explain|summari[sz]e|read|check|audit|what(?:'s| is)|tell me what|analise|analisar|analisa|analisa-lo|revise|revisar|inspecione|inspecionar|explique|explicar|resuma|resumir|leia|ler|verifique|verificar|audite|auditar|o que tem|o que ha|analiza|analizar|revisa|revisar|inspecciona|inspeccionar|explica|explicar|resume|resumir|lee|leer|verifica|verificar|audita|auditar|que contiene|que hay)\b/i;
const CREATE = /\b(create|generate|make|build|produce|prepare|export|save|draw|design|crie|criar|cria|gere|gerar|gera|faca|fazer|fa\u00e7a|produza|produzir|prepare|preparar|exporte|exportar|salve|salvar|desenhe|desenhar|monte|montar|crea|crear|genera|generar|haz|hacer|construye|construir|produce|producir|prepara|preparar|exporta|exportar|guarda|guardar|dibuja|dibujar|dise\u00f1a|dise\u00f1ar)\b/i;
const EDIT = /\b(edit|change|remove|replace|improve|enhance|transform|restyle|erase|add|crop|retouch|edite|editar|mude|mudar|remova|remover|substitua|substituir|melhore|melhorar|aprimore|aprimorar|transforme|transformar|adicione|adicionar|recorte|retocar|edita|cambia|cambiar|elimina|eliminar|reemplaza|reemplazar|mejora|mejorar|transforma|transformar|agrega|agregar|recorta|recortar|retoca)\b/i;
const IMAGE = /\b(image|picture|photo|logo|illustration|poster|graphic|artwork|screenshot|imagem|foto|logotipo|ilustracao|poster|grafico|arte|captura de tela|imagen|foto|logotipo|ilustracion|grafico|captura de pantalla)\b/i;

const ARTIFACTS = [
  ['pdf', /\bpdf\b/i],
  ['html', /\b(?:html|single.page web app|pagina html)\b/i],
  ['docx', /\b(docx|word document|documento word|documento de word)\b/i],
  ['pptx', /\b(pptx|powerpoint|pitch deck|slide deck|presentation|apresentacao|apresentacao de slides|presentacion|presentacion de diapositivas)\b/i],
  ['xlsx', /\b(xlsx|excel|spreadsheet|planilha|hoja de calculo)\b/i],
  ['csv', /\bcsv\b/i],
  ['zip', /\b(zip|arquivo zip|pacote de codigo|code project|source package|source code package|projeto em zip|archivo zip|paquete de codigo|proyecto en zip)\b/i],
];

export function artifactTypesFromText(text = '') {
  const t=normalize(text);
  return ARTIFACTS.filter(([,pattern])=>pattern.test(t)).map(([type])=>type);
}
export function artifactTypeFromText(text = '') {
  return artifactTypesFromText(text)[0]||null;
}

export function classifyIntent(text = '', { hasImage = false, hasFiles = false } = {}) {
  const t = normalize(text);
  const analysis = ANALYZE.test(t);
  const create = CREATE.test(t);
  const edit = EDIT.test(t);
  const imageMention = IMAGE.test(t);
  const artifactTypes = artifactTypesFromText(t);
  const artifactType = artifactTypes[0]||null;

  if (hasImage && edit && (imageMention || /\b(this|that|attached|essa|esta|imagem|foto)\b/i.test(t))) {
    return { action: 'IMAGE_EDIT', artifactType: null, reason: 'explicit_image_edit' };
  }

  if (analysis && !create) {
    return { action: 'ANALYZE', artifactType: null, reason: hasFiles ? 'analyze_attached_material' : 'analysis_request' };
  }

  if (create && imageMention && !artifactType) {
    return { action: 'IMAGE_CREATE', artifactType: null, reason: 'explicit_image_create' };
  }

  if (create && artifactType) {
    return { action: 'ARTIFACT_CREATE', artifactType, artifactTypes, reason: `explicit_${artifactType}_create` };
  }

  if (analysis && create && artifactType) {
    return { action: 'ARTIFACT_CREATE', artifactType, artifactTypes, reason: `analysis_plus_${artifactType}_output` };
  }

  if (analysis || (hasImage && /\b(background|fundo|what do you see|o que voce ve|o que vc ve)\b/i.test(t))) {
    return { action: 'ANALYZE', artifactType: null, reason: 'analysis_request' };
  }

  return { action: 'CHAT', artifactType: null, reason: 'default_chat' };
}

const WORKSTREAMS = [
  ['security', /\b(security|secure|auth(?:entication)?|oauth|privacy|gdpr|encryption|vulnerabilit|seguranca|autenticacao|privacidade|criptografia|seguridad|autenticacion|privacidad|cifrado|vulnerabilidad)\b/i],
  ['architecture', /\b(architecture|architect|system design|schema|data model|arquitetura|modelo de dados|arquitectura|modelo de datos)\b/i],
  ['implementation', /\b(implement|code|coding|api|database|backend|refactor|debug|bug|codigo|banco de dados|implementar|depurar|base de datos|refactorizar|arreglar)\b/i],
  ['interface', /\b(ui|ux|user interface|frontend|front-end|layout|screens?|wireframe|tela|telas|interface|pantalla|pantallas|interfaz)\b/i],
  ['research', /\b(research|compare|comparison|market|competitors|benchmark|pesquisa|comparar|mercado|concorrentes|investigar|comparacion|competidores)\b/i],
  ['writing', /\b(write|rewrite|essay|email|copywriting|story|book|blog|escreva|reescreva|historia|e-?mail|escribe|reescribe|ensayo|correo|libro)\b/i],
];

const FORCE_SIMPLE = /\b(quick|quickly|briefly|short answer|just answer|one model|be brief|rapido|resposta curta|so responde|direto ao ponto|breve|respuesta corta|solo responde|directo al punto)\b/i;
const DEEP_ANALYSIS = /\b(audit|review|reverse engineer|engineering reverse|architecture review|security review|deep analysis|line by line|complete analysis|auditoria|revisao|engenharia reversa|linha por linha|analise completa|auditoria completa|revisar|ingenieria inversa|linea por linea|analisis completo|auditoria completa)\b/i;
const TURBO_EXECUTION = /\b(fix|fix all|implement|apply(?: all)?(?: findings)?|repair|correct|refactor|finish|finalize|ship|assemble|integrate|compile|build|package|commit|deploy|execute|corrigir|corrija|implementar|aplicar|reparar|refatorar|finalizar|entregar|montar|integrar|compilar|empacotar|commit|publicar|executar|arreglar|corregir|implementar|aplicar|reparar|refactorizar|finalizar|entregar|ensamblar|integrar|compilar|empaquetar|desplegar|ejecutar)\b/i;
const STRONG_TURBO = /\b(fix all|apply all|apply findings|apply all findings|finish the project|finalize the project|make it deployable|make it production ready|corrija tudo|aplique tudo|aplique os achados|finalize o projeto|deixe pronto para deploy|deixe pronto para producao|arregla todo|aplica todo|aplica los hallazgos|finaliza el proyecto|dejalo listo para produccion)\b/i;

function workstreamsIn(text = '') {
  const found = [];
  for (const [name, re] of WORKSTREAMS) if (re.test(text)) found.push(name);
  return found;
}

export function normalizeRequestedMode(value='ZEUS'){
  const mode=String(value||'ZEUS').trim().toUpperCase();
  return mode==='ZEUS'||mode==='OLYMPUS'?mode:null;
}

export function decideExecutionMode(text = '', { requestedMode = 'ZEUS', olympusAuto = false, ...context } = {}) {
  const value=normalize(String(text||''));
  const requested=normalizeRequestedMode(requestedMode)||'ZEUS';
  const candidate=olympusAuto===true&&requested==='ZEUS'?decideExecutionLevel(text,{...context,mode:'OLYMPUS'}):null;
  const automatic=candidate?.mode==='OLYMPUS'&&!candidate.reasons.includes('default_economical_olympus');
  const mode=automatic?'OLYMPUS':requested;
  return {
    mode,
    reason:automatic?'automatic_complexity':mode==='OLYMPUS'?'manual_olympus':'manual_zeus',
    workstreams:workstreamsIn(value),
    router:'deterministic_zero_token',
  };
}

// Levels: L1 = SIMPLE (1 call), L2 = COMPOUND (2 calls), L3 = ZEUS_DIRECTED (3 calls).
// Olympus remains a single multi-specialist mode.
export const GEAR_CALL_CAPS=Object.freeze({SIMPLE:1,COMPOUND:2,ZEUS_DIRECTED:3,COMPOUND_PLUS:3,COMPLEX_TURBO:4});
const TURBO_AREAS=[
  ['frontend',/\b(frontend|front-end|ui|ux|interface|tela|telas|pantalla|layout|css|react)\b/i],
  ['backend',/\b(backend|back-end|api|server|servidor|endpoint|functions?|funcoes)\b/i],
  ['database',/\b(database|db|banco de dados|base de datos|schema|migration|migracao|postgres|sql)\b/i],
  ['infra',/\b(deploy|netlify|infra|infraestrutura|ci|pipeline)\b/i],
];
const LAUNCH_PACKAGE=/\b(full app|complete app|app completo|aplicativo completo|sistema completo|launch package|pacote de lancamento|kit de lancamento|paquete de lanzamiento)\b/i;
const COMPOUND_PLUS_SIGNAL=/\b(investor report|relatorio (?:para|de) investidores|investidores|due diligence|legal analysis|analise juridica|juridic[oa]|financial analysis|analise financeira|modelo financeiro|valuation|system design|desenho de sistema|arquitetura do sistema|multi-section|varias secoes|capitulos|chapters|relatorio completo|full report|multi-file|varios arquivos|multiplos arquivos)\b/i;
const BOOK_CHAPTER_WORK=/\b(?:write|draft|rewrite|compose|create|generate|escreva?|escrever|redija?|redigir|reescreva?|crie|criar|redacta?|escribe|escribir|crear|crea|generar|genera)\b[\s\S]{0,100}\b(?:chapter|chapters|capitulo|capitulos|capitula|capitulas|cap[i\u00ed]tulo|cap[i\u00ed]tulos)\b|\b(?:chapter|capitulo|capitulos|cap[i\u00ed]tulo|cap[i\u00ed]tulos)\s*\d{0,3}\b[\s\S]{0,80}\b(?:write|draft|rewrite|escrever|escreva|redija|escribe|escribir)\b/i;
const PROFESSIONAL_DOMAIN=/\b(frontend|front.end|ui design|design system|backend|back.end|api service|presentation|powerpoint|pitch deck|apresentacao|projeto de codigo|aplicativo web)\b/i;
const ZEUS_COMPOUND_WORK=/\b(fix|bug|debug|corrigir|corrija|corrige|conserta|consertar|arreglar|implement|implementar|refactor|refatorar|script|business plan|plano de negocios?|contrato|contract|planilha|spreadsheet|deck|apresentacao|video|imagem|image)\b/i;

export function turboAreasIn(text=''){const v=normalize(String(text||''));return TURBO_AREAS.filter(([,re])=>re.test(v)).map(([n])=>n);}

export function decideExecutionLevel(text='', {
  mode='ZEUS',
  action='CHAT',
  route='fast',
  hasFiles=false,
  hasImage=false,
  requirementCount=0,
  artifactType=null,
  requiresVerification=false,
}={}){
  const value=normalize(String(text||''));
  const selectedMode=normalizeRequestedMode(mode)||'ZEUS';
  const workstreams=workstreamsIn(value);
  const requirements=Math.max(0,Number(requirementCount)||0);
  const out=(m,level,reasons)=>({mode:m,requestedMode:selectedMode,level,reason:reasons[0],reasons:[...new Set(reasons)],workstreams,maxCalls:GEAR_CALL_CAPS[level],router:'deterministic_zero_token'});

  const zeusGear=()=>{
    // Image generation/editing always Level 2
    if(action==='IMAGE_CREATE'||action==='IMAGE_EDIT')return out('ZEUS','COMPOUND',['image_level_2']);
    const reasons=[];
    if(PROFESSIONAL_DOMAIN.test(value)&&CREATE.test(value)&&['ARTIFACT_CREATE','CHAT'].includes(action))return out('ZEUS','ZEUS_DIRECTED',['professional_domain_artifact']);
    if(action==='ARTIFACT_CREATE')reasons.push('deliverable');
    if(requiresVerification)reasons.push('verification_required');
    if(DEEP_ANALYSIS.test(value))reasons.push('deep_analysis');
    if(BOOK_CHAPTER_WORK.test(value))reasons.push('long_form_chapter_writing');
    if(TURBO_EXECUTION.test(value)&&(route==='coding'||route==='hard'))reasons.push('execution_work');
    if(ZEUS_COMPOUND_WORK.test(value)&&CREATE.test(value))reasons.push('create_and_review');
    if(value.length>1200&&requirements>0)reasons.push('long_structured_request');
    if(FORCE_SIMPLE.test(value)&&action==='CHAT'&&!requiresVerification)return out('ZEUS','SIMPLE',['explicitly_brief']);
    return reasons.length?out('ZEUS','COMPOUND',reasons):out('ZEUS','SIMPLE',['ordinary_turn']);
  };
  if(selectedMode==='ZEUS'||action==='IMAGE_CREATE'||action==='IMAGE_EDIT')return zeusGear();

  if(action==='CHAT'&&requirements===0&&!requiresVerification&&workstreams.length===0&&!TURBO_EXECUTION.test(value)&&!COMPOUND_PLUS_SIGNAL.test(value)&&!DEEP_ANALYSIS.test(value))return out('ZEUS','SIMPLE',['simple_turn_no_team_needed']);
  if(action==='ARTIFACT_CREATE'&&artifactType==='pdf'&&!DEEP_ANALYSIS.test(value)&&!COMPOUND_PLUS_SIGNAL.test(value)&&turboAreasIn(value).length===0)
    return out('ZEUS','COMPOUND',['single_document_review']);
  const areas=turboAreasIn(value);
  const executionVerb=TURBO_EXECUTION.test(value);
  const zip=String(artifactType||'').toLowerCase()==='zip';
  const candidate=STRONG_TURBO.test(value)||LAUNCH_PACKAGE.test(value)||(areas.length>=2&&(executionVerb||zip));
  const substantiveScope=areas.length>=2 && (executionVerb||zip||LAUNCH_PACKAGE.test(value));
  const documentedScope=requirements>=3 || (hasFiles && requirements>=2);
  const explicitMultiArea=areas.length>=3&&executionVerb&&/\b(commit|deploy|release|production|build|implementar|implement)\b/i.test(value);
  const explicitAuditRepair=STRONG_TURBO.test(value)&&hasFiles&&/\b(audit|auditoria|findings|achados|relatorio de auditoria)\b/i.test(value);
  const turboEligible=candidate && ((substantiveScope && (documentedScope||explicitMultiArea))||explicitAuditRepair)
    && action!=='IMAGE_CREATE' && action!=='IMAGE_EDIT';
  if(turboEligible){
    const reasons=[];
    if(STRONG_TURBO.test(value))reasons.push('explicit_full_execution');
    if(LAUNCH_PACKAGE.test(value))reasons.push('launch_package');
    if(areas.length>=2)reasons.push('multi_area_execution');
    return out('OLYMPUS','COMPLEX_TURBO',reasons);
  }
  const plusReasons=[];
  if(COMPOUND_PLUS_SIGNAL.test(value))plusReasons.push('high_stakes_or_long_document');
  if(DEEP_ANALYSIS.test(value))plusReasons.push('audit_or_investigation');
  if(requiresVerification)plusReasons.push('high_confidence_review');
  if(executionVerb&&(zip||areas.length===1)&&(requirements>=2||hasFiles))plusReasons.push('multi_file_single_area');
  if(value.length>2500&&requirements>=3)plusReasons.push('long_structured_request');
  if(candidate&&!turboEligible)plusReasons.push('turbo_eligibility_not_met');
  if(plusReasons.length)return out('OLYMPUS','COMPOUND_PLUS',plusReasons);
  return out('OLYMPUS','COMPOUND_PLUS',['default_economical_olympus']);
}

export function explainExecutionMode(decision = {}) {
  return decision.mode==='OLYMPUS'
    ?'Olympus selected. Multi-specialist mode.'
    :'Zeus selected. Levels 1/2/3 available.';
}

export function explainExecutionLevel(decision={}){
  if(decision.mode==='OLYMPUS')return 'Olympus · multi-specialist team.';
  if(decision.level==='ZEUS_DIRECTED')return 'Zeus · Level 3 · Specialist → Director → CEO.';
  if(decision.level==='COMPOUND')return 'Zeus · Level 2 · Specialist + Director.';
  return 'Zeus · Level 1 · economical specialist.';
}
