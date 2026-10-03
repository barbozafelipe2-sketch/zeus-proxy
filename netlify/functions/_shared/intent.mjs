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
