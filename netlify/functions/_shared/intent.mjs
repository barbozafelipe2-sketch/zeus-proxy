const normalize = (value = '') => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ANALYZE = /\b(analy[sz]e|analysis|review|inspect|explain|summari[sz]e|read|check|audit|what(?:'s| is)|tell me what|analise|analisar|analisa|analisa-lo|revise|revisar|inspecione|inspecionar|explique|explicar|resuma|resumir|leia|ler|verifique|verificar|audite|auditar|o que tem|o que ha|analiza|analizar|revisa|revisar|inspecciona|inspeccionar|explica|explicar|resume|resumir|lee|leer|verifica|verificar|audita|auditar|que contiene|que hay)\b/i;
const CREATE = /\b(create|generate|make|build|produce|prepare|export|save|draw|design|crie|criar|cria|gere|gerar|gera|faca|fazer|faça|produza|produzir|prepare|preparar|exporte|exportar|salve|salvar|desenhe|desenhar|monte|montar|crea|crear|genera|generar|haz|hacer|construye|construir|produce|producir|prepara|preparar|exporta|exportar|guarda|guardar|dibuja|dibujar|diseña|diseñar)\b/i;
const EDIT = /\b(edit|change|remove|replace|improve|enhance|transform|restyle|erase|add|crop|retouch|edite|editar|mude|mudar|remova|remover|substitua|substituir|melhore|melhorar|aprimore|aprimorar|transforme|transformar|adicione|adicionar|recorte|retocar|edita|cambia|cambiar|elimina|eliminar|reemplaza|reemplazar|mejora|mejorar|transforma|transformar|agrega|agregar|recorta|recortar|retoca)\b/i;
const IMAGE = /\b(image|picture|photo|logo|illustration|poster|graphic|artwork|screenshot|imagem|foto|logotipo|ilustracao|poster|grafico|arte|captura de tela|imagen|foto|logotipo|ilustracion|grafico|captura de pantalla)\b/i;

const ARTIFACTS = [
  ['pdf', /\bpdf\b/i],
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

  // Explicit image modification requires both an attached image and an actual edit verb.
  if (hasImage && edit && (imageMention || /\b(this|that|attached|essa|esta|imagem|foto)\b/i.test(t))) {
    return { action: 'IMAGE_EDIT', artifactType: null, reason: 'explicit_image_edit' };
  }

  // Analysis wins over a mere file-type noun. "Analyze this ZIP" must never create a ZIP.
  if (analysis && !create) {
    return { action: 'ANALYZE', artifactType: null, reason: hasFiles ? 'analyze_attached_material' : 'analysis_request' };
  }

  if (create && imageMention && !artifactType) {
    return { action: 'IMAGE_CREATE', artifactType: null, reason: 'explicit_image_create' };
  }

  // Artifact creation requires a creation/export verb and an explicit output type.
  if (create && artifactType) {
    return { action: 'ARTIFACT_CREATE', artifactType, artifactTypes, reason: `explicit_${artifactType}_create` };
  }

  // Mixed request such as "analyze this ZIP and create a PDF report" should analyze, then produce the requested artifact.
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

// Top-level mode is an owner choice. The router never spends tokens deciding
// whether Zeus or Olympus should be used.
export function decideExecutionMode(text = '', { requestedMode = 'ZEUS' } = {}) {
  const value=normalize(String(text||''));
  const mode=normalizeRequestedMode(requestedMode)||'ZEUS';
  return {
    mode,
    reason:mode==='OLYMPUS'?'manual_olympus':'manual_zeus',
    workstreams:workstreamsIn(value),
    router:'deterministic_zero_token',
  };
}

// Sublevel routing is deliberately synchronous and rule based: no model call,
// no provider call, no hidden classification tokens.
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
  const reasons=[];
  const requirements=Math.max(0,Number(requirementCount)||0);

  if(selectedMode==='ZEUS'){
    if(action==='IMAGE_CREATE'||action==='IMAGE_EDIT'){
      return {mode:selectedMode,level:'SIMPLE',reason:'single_model_media_operation',reasons:['single_model_media_operation'],workstreams,router:'deterministic_zero_token'};
    }
    if(requiresVerification){reasons.push('verification_required');}
    if(action==='ARTIFACT_CREATE'){reasons.push('deliverable');}
    if(route==='coding'||route==='hard'||route==='research'){reasons.push(route);}
    if(hasFiles&&!hasImage){reasons.push('document_context');}
    if(requirements>=2){reasons.push('multiple_requirements');}
    if(DEEP_ANALYSIS.test(value)){reasons.push('deep_analysis');}
    if(TURBO_EXECUTION.test(value)&&route!=='fast'){reasons.push('execution_work');}
    if(value.length>1200&&requirements>0){reasons.push('long_structured_request');}
    if(FORCE_SIMPLE.test(value)&&!requiresVerification&&action==='CHAT'&&!hasFiles&&!reasons.length){
      return {mode:selectedMode,level:'SIMPLE',reason:'explicitly_brief',reasons:['explicitly_brief'],workstreams,router:'deterministic_zero_token'};
    }
    return reasons.length
      ?{mode:selectedMode,level:'COMPOUND',reason:reasons[0],reasons:[...new Set(reasons)],workstreams,router:'deterministic_zero_token'}
      :{mode:selectedMode,level:'SIMPLE',reason:'ordinary_turn',reasons:['ordinary_turn'],workstreams,router:'deterministic_zero_token'};
  }

  // Olympus is manual. Inside Olympus, audit/investigation defaults to
  // Compound Plus; execution/integration requests escalate to Complex Turbo.
  const artifactExecution=action==='ARTIFACT_CREATE'&&['zip','docx','pptx','xlsx','pdf','csv'].includes(String(artifactType||'').toLowerCase());
  const explicitTurbo=STRONG_TURBO.test(value);
  const executionVerb=TURBO_EXECUTION.test(value);
  const multiPart=requirements>=2||workstreams.length>=2||hasFiles;
  if(explicitTurbo||artifactExecution||(executionVerb&&(multiPart||route==='coding'||route==='hard'))){
    if(explicitTurbo)reasons.push('explicit_full_execution');
    if(artifactExecution)reasons.push('artifact_delivery');
    if(executionVerb)reasons.push('execution_request');
    if(multiPart)reasons.push('multi_part_work');
    return {mode:selectedMode,level:'COMPLEX_TURBO',reason:reasons[0]||'execution_request',reasons:[...new Set(reasons)],workstreams,router:'deterministic_zero_token'};
  }
  if(DEEP_ANALYSIS.test(value))reasons.push('audit_or_investigation');
  if(requiresVerification)reasons.push('high_confidence_review');
  if(requirements>=2)reasons.push('multiple_requirements');
  return {mode:selectedMode,level:'COMPOUND_PLUS',reason:reasons[0]||'olympus_review',reasons:[...new Set(reasons.length?reasons:['olympus_review'])],workstreams,router:'deterministic_zero_token'};
}

export function explainExecutionMode(decision = {}) {
  return decision.mode==='OLYMPUS'
    ?'Olympus selected manually. The deterministic router chooses Compound Plus or Complex Turbo.'
    :'Zeus selected. The deterministic router chooses Simple or Compound.';
}

export function explainExecutionLevel(decision={}){
  if(decision.mode==='OLYMPUS'&&decision.level==='COMPLEX_TURBO')return 'Olympus · Complex Turbo selected by the zero-token router.';
  if(decision.mode==='OLYMPUS')return 'Olympus · Compound Plus selected by the zero-token router.';
  if(decision.level==='COMPOUND')return 'Zeus · Compound selected by the zero-token router.';
  return 'Zeus · Simple selected by the zero-token router.';
}
