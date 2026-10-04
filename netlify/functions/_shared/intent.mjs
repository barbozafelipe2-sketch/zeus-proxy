const normalize = (value = '') => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ANALYZE = /\b(analy[sz]e|analysis|review|inspect|explain|summari[sz]e|read|check|audit|what(?:'s| is)|tell me what|analise|analisar|analisa|analisa-lo|revise|revisar|inspecione|inspecionar|explique|explicar|resuma|resumir|leia|ler|verifique|verificar|audite|auditar|o que tem|o que ha)\b/i;
const CREATE = /\b(create|generate|make|build|produce|prepare|export|save|draw|design|crie|criar|cria|gere|gerar|gera|faca|fazer|faça|produza|produzir|prepare|preparar|exporte|exportar|salve|salvar|desenhe|desenhar|monte|montar)\b/i;
const EDIT = /\b(edit|change|remove|replace|improve|enhance|transform|restyle|erase|add|crop|retouch|edite|editar|mude|mudar|remova|remover|substitua|substituir|melhore|melhorar|aprimore|aprimorar|transforme|transformar|adicione|adicionar|recorte|retocar)\b/i;
const IMAGE = /\b(image|picture|photo|logo|illustration|poster|graphic|artwork|screenshot|imagem|foto|logotipo|ilustracao|ilustracao|poster|grafico|arte|captura de tela)\b/i;

const ARTIFACTS = [
  ['pdf', /\bpdf\b/i],
  ['docx', /\b(docx|word document|documento word)\b/i],
  ['pptx', /\b(pptx|powerpoint|pitch deck|slide deck|presentation|apresentacao|apresentacao de slides)\b/i],
  ['xlsx', /\b(xlsx|excel|spreadsheet|planilha)\b/i],
  ['csv', /\bcsv\b/i],
  ['zip', /\b(zip|arquivo zip|pacote de codigo|code project|source package|source code package|projeto em zip)\b/i],
];

export function artifactTypeFromText(text = '') {
  const t = normalize(text);
  for (const [type, re] of ARTIFACTS) if (re.test(t)) return type;
  return null;
}

export function classifyIntent(text = '', { hasImage = false, hasFiles = false } = {}) {
  const t = normalize(text);
  const analysis = ANALYZE.test(t);
  const create = CREATE.test(t);
  const edit = EDIT.test(t);
  const imageMention = IMAGE.test(t);
  const artifactType = artifactTypeFromText(t);

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
    return { action: 'ARTIFACT_CREATE', artifactType, reason: `explicit_${artifactType}_create` };
  }

  // Mixed request such as "analyze this ZIP and create a PDF report" should analyze, then produce the requested artifact.
  if (analysis && create && artifactType) {
    return { action: 'ARTIFACT_CREATE', artifactType, reason: `analysis_plus_${artifactType}_output` };
  }

  if (analysis || (hasImage && /\b(background|fundo|what do you see|o que voce ve|o que vc ve)\b/i.test(t))) {
    return { action: 'ANALYZE', artifactType: null, reason: 'analysis_request' };
  }

  return { action: 'CHAT', artifactType: null, reason: 'default_chat' };
}

const WORKSTREAMS = [
  ['security', /\b(security|secure|auth(?:entication)?|oauth|privacy|gdpr|encryption|vulnerabilit|seguranca|autenticacao|privacidade|criptografia)\b/i],
  ['architecture', /\b(architecture|architect|system design|schema|data model|arquitetura|modelo de dados)\b/i],
  ['implementation', /\b(implement|code|coding|api|database|backend|refactor|debug|bug|codigo|banco de dados|implementar|depurar)\b/i],
  ['interface', /\b(ui|ux|user interface|frontend|front-end|layout|screens?|wireframe|tela|telas|interface)\b/i],
  ['research', /\b(research|compare|comparison|market|competitors|benchmark|pesquisa|comparar|mercado|concorrentes)\b/i],
  ['writing', /\b(write|rewrite|essay|email|copywriting|story|book|blog|escreva|reescreva|historia|e-?mail)\b/i],
];

const FORCE_FAST = /\b(quick|quickly|briefly|short answer|just answer|one model|zeus only|be brief|rapido|resposta curta|so responde|sem time|direto ao ponto)\b/i;
const FORCE_TEAM = /\b(olympus|specialist team|use the team|full team|think harder|go deep|vai fundo|time de especialistas|modo olympus|usa o time)\b/i;
const BUILD = /\b(build|design|architect|plan|audit|ship|create|develop|construir|projetar|auditar|planejar|planeje)\b/i;

function workstreamsIn(text = '') {
  const found = [];
  for (const [name, re] of WORKSTREAMS) if (re.test(text)) found.push(name);
  return found;
}

// Zeus is the default. Olympus is only for a request that really crosses kinds of work,
// or when you explicitly ask for the team. Length alone never promotes a turn.
export function decideExecutionMode(text = '', { action = 'CHAT' } = {}) {
  const value = normalize(String(text || ''));
  const streams = workstreamsIn(value);
  if (action === 'IMAGE_CREATE' || action === 'IMAGE_EDIT') {
    return { mode: 'ZEUS', reason: 'image_is_one_model', workstreams: streams };
  }
  if (FORCE_FAST.test(value)) return { mode: 'ZEUS', reason: 'you_asked_for_a_direct_answer', workstreams: streams };
  if (FORCE_TEAM.test(value)) return { mode: 'OLYMPUS', reason: 'you_asked_for_the_team', workstreams: streams };
  const broadBuild = streams.length >= 3 && (value.length > 80 || BUILD.test(value));
  const longCross = streams.length >= 2 && value.length > 360;
  if (broadBuild || longCross) return { mode: 'OLYMPUS', reason: `spans_${streams.slice(0, 3).join('_')}`, workstreams: streams };
  return { mode: 'ZEUS', reason: streams.length ? 'one_kind_of_work' : 'ordinary_turn', workstreams: streams };
}

export function explainExecutionMode(decision = {}) {
  if (decision.mode !== 'OLYMPUS') {
    if (decision.reason === 'you_asked_for_a_direct_answer') return 'Direct answer, one model.';
    if (decision.reason === 'image_is_one_model') return 'Image work, one model.';
    return 'One model is enough for this.';
  }
  if (decision.reason === 'you_asked_for_the_team') return 'You asked for the team. Olympus drafts, then one answer.';
  const names = (decision.workstreams || []).slice(0, 3).join(', ');
  return names
    ? `This spans ${names}. Olympus drafts those parts, then one answer.`
    : 'This is broad. Olympus drafts it, then one answer.';
}
