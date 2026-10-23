// Presentation-only localization. API enums, selectors and stored user content
// retain their original values; only interface text and labels are translated.
const translations = new Map(Object.entries({
  'Home':'Início', 'Projects':'Agentes', 'Agents':'Agentes', 'Manager':'Gestor', 'Tools':'Ferramentas', 'Files':'Arquivos', 'Settings':'Configurações',
  'New agent':'Novo agente', '＋ New agent':'＋ Novo agente', 'All agents':'Todos os agentes', 'All Agents':'Todos os agentes', 'WORKSPACE MANAGER':'GESTÃO DO ESPAÇO', 'AGENT WORKSPACES':'ESPAÇOS DOS AGENTES',
  'Choose an agent to continue its dedicated work.':'Escolha um agente para continuar o trabalho dedicado.',
  'No agents yet. Create one to give a workstream its own chat, memory and files.':'Ainda não há agentes. Crie um para ter conversa, memória e arquivos próprios.',
  'No agents yet':'Ainda não há agentes', 'Create your first dedicated workspace.':'Crie seu primeiro espaço de trabalho dedicado.',
  'Each agent has a dedicated conversation, tasks, files, artifacts and memory.':'Cada agente tem conversa, tarefas, arquivos, resultados e memória próprios.',
  'Each agent keeps its own permanent chat, tasks, files, artifacts and memory.':'Cada agente mantém sua conversa, tarefas, arquivos, resultados e memória permanentes.',
  'Your agents':'Seus agentes', 'All agents ›':'Todos os agentes ›', 'Workspace Manager':'Gestor do espaço',
  'New chat':'Nova conversa', 'Start a clean execution':'Comece uma nova conversa', 'Search chats':'Buscar conversas',
  'Recent chats':'Conversas recentes', 'Conversation':'Conversa', 'WORKSPACE':'ESPAÇO DE TRABALHO', 'PROJECT':'PROJETO',
  'Workspace navigation':'Navegação', 'Primary':'Principal', 'Current workspace':'Espaço atual', 'Open navigation':'Abrir navegação',
  'Navigation':'Navegação', 'Close menu':'Fechar menu', 'Open account settings':'Abrir configurações da conta',
  'Lock':'Bloquear', 'Lock Zeus on this device':'Bloquear Zeus neste dispositivo', 'Memory & persistence connected':'Seu trabalho salvo neste espaço',
  'Home chats appear here. Project chats stay inside each project.':'As conversas aparecem aqui. As conversas de projetos ficam em cada projeto.',
  'No chats match your search.':'Nenhuma conversa encontrada.', 'Conversation history available · no Project memory':'Histórico desta conversa · sem memória de projeto',
  'PERSONAL · ZEUS':'PESSOAL · ZEUS', 'OLYMPUS HUB · PERSONAL':'OLYMPUS HUB · PESSOAL',
  'Start Live Talk':'Iniciar conversa por voz', 'Finish this turn and stop Live Talk':'Finalizar esta fala e parar a conversa por voz',
  'Zeus is your private AI workspace.':'Seu espaço privado de inteligência artificial.',
  'Projects, permanent memory, files, artifacts and Olympus orchestration stay together. Provider keys stay behind Netlify.':'Converse, organize projetos e crie arquivos em um só lugar. Suas credenciais ficam protegidas no servidor.',
  'Projects + dedicated memory':'Projetos com memória própria', 'Files, images and outputs':'Arquivos, imagens e resultados',
  'PRIVATE ACCESS':'ACESSO PRIVADO', 'Unlock Zeus':'Desbloquear Zeus', 'Private key':'Chave de acesso',
  'Use the same private access key configured in Netlify.':'Entre com a chave de acesso do seu espaço Zeus.',
  'This key stays on this device until Lock or 14 days without use. On a shared device, Lock before you leave.':'A chave fica salva neste dispositivo até você bloquear o acesso ou passar 14 dias sem usar. Em dispositivos compartilhados, bloqueie ao sair.',
  'Zeus capabilities':'Recursos do Zeus', 'Intelligence mode':'Modo de inteligência',
  'STANDARD':'COTIDIANO', 'ADVANCED':'AVANÇADO',
  'Automatic level: Simple or Compound':'Perguntas e tarefas do dia a dia',
  'Automatic level: Compound Plus or Complex Turbo':'Análises e trabalhos complexos',
  'You choose the mode. The zero-token router chooses the level.':'Escolha o modo. Zeus ajusta a profundidade conforme o pedido.',
  'ONE AI ENVIRONMENT. REAL RESULTS.':'SUAS IDEIAS, TRANSFORMADAS EM RESULTADOS.',
  'Turn the request into a result.':'O que vamos fazer hoje?',
  'Tell Zeus what you need. Your work stays saved in this conversation.':'Conte ao Zeus o que você precisa. Seu trabalho fica salvo nesta conversa.',
  'Review a source':'Analisar arquivo', 'Create a deliverable':'Criar documento', 'Build with tests':'Criar código', 'Plan a project':'Planejar projeto',
  'Message Zeus…':'Mensagem…', 'Message Olympus…':'Mensagem…', 'Message Zeus':'Mensagem para Zeus', 'Message Olympus':'Mensagem para Olympus',
  'Send message':'Enviar mensagem', 'Send (Ctrl/⌘+Enter)':'Enviar (Ctrl/⌘+Enter)', 'Enter adds a new line · use the arrow to send':'Enter cria uma nova linha · use a seta para enviar',
  'Add photo, video or file':'Adicionar foto, vídeo ou arquivo', 'Add attachment':'Adicionar anexo', 'Photo / Video':'Foto / Vídeo', 'Camera':'Câmera', 'File':'Arquivo',
  'Voice input':'Entrada por voz', 'Stop recording':'Parar gravação', 'Transcribing…':'Transcrevendo…', 'Transcribing voice':'Transcrevendo áudio', 'Remove attachment':'Remover anexo',
  'YOU':'VOCÊ', 'Sources':'Fontes', 'Execution details':'Detalhes da execução', 'Load older messages':'Ver mensagens anteriores',
  'Live execution status — no simulated timings.':'Acompanhamento da execução em tempo real.', 'Zeus is working':'Zeus está trabalhando',
  'Retry':'Tentar novamente', 'Dismiss message':'Fechar mensagem', 'Open':'Abrir', 'Download':'Baixar', 'Commit':'Enviar ao GitHub',
  'Tools & Capabilities':'Ferramentas', 'REAL CAPABILITIES. REAL OUTPUTS.':'ESCOLHA O QUE VOCÊ QUER FAZER.', 'Explore All >':'Ver arquivos →',
  'Web Search':'Pesquisa na web', 'Current web retrieval with sources':'Pesquise informações atuais com fontes',
  'Code':'Código', 'Build and review code with explicit test status':'Crie e revise código com indicação dos testes',
  'Images':'Imagens', 'Generate and edit with AI':'Crie e edite imagens com IA',
  'Documents':'Documentos', 'Create retained PDF, DOCX, PPTX and XLSX deliverables':'Crie arquivos PDF, Word, apresentações e planilhas',
  'Source Review':'Análise de arquivos', 'Ground analysis in uploaded files and project context':'Analise seus arquivos com base no conteúdo enviado',
  'Files & Library':'Arquivos e resultados', 'Files & outputs':'Arquivos e resultados', 'Upload files':'Enviar arquivos', 'Upload':'Enviar', 'All outputs':'Todos os arquivos', 'Load older':'Ver anteriores',
  'Upload, analyze, and keep everything in context across all your projects and conversations.':'Envie e organize arquivos dos seus projetos e conversas.',
  'Upload, analyze, and keep files and generated artifacts connected to your conversations and projects.':'Organize arquivos enviados e resultados gerados em suas conversas e projetos.',
  'Your library starts with the first source or deliverable.':'Seus arquivos aparecerão aqui.',
  'Upload a source for analysis, or ask Zeus/Olympus to create a document, image, spreadsheet, presentation or ZIP.':'Envie um arquivo para análise ou peça um documento, imagem, planilha, apresentação ou ZIP.',
  'Workspace settings':'Configurações', 'Account and advanced runtime diagnostics.':'Sua conta e o estado dos serviços.', 'Account':'Conta',
  'The private key stays in localStorage on this device until Lock or 14 days without use.':'A chave fica salva neste dispositivo até o bloqueio ou 14 dias sem uso.',
  'Finishing recording…':'Finalizando a gravação…', 'Listening… tap the mic when finished':'Ouvindo… toque no microfone para terminar',
  'Live Talk is unavailable because this browser has no speech recognition and server transcription is not configured.':'Este navegador não oferece reconhecimento de voz e a transcrição no servidor não está configurada para o Live Talk.',
  'Go-live checklist':'Disponibilidade dos serviços', 'Private access token':'Acesso privado', 'Database':'Banco de dados', 'Blob maintenance':'Armazenamento', 'Provider configured':'IA configurada', 'Chat callable':'Conversa disponível',
  'Go-live gate is ready for this owner.':'Seu espaço está configurado para uso.', 'Go-live gate is blocked until token, a configured provider and a callable chat state are all present.':'Alguns serviços precisam de configuração. Confira os itens acima.',
  'AI provider diagnostics':'Diagnóstico da IA', 'Capabilities':'Recursos',
  'Diagnostics are runtime-local evidence. CONFIGURED UNVERIFIED means credentials/models were detected but this warm Function runtime has not observed a successful call yet. DEGRADED means the temporary circuit breaker is open.':'Configurado significa que as credenciais foram detectadas, mas o funcionamento ainda não foi confirmado. Instável indica falhas recentes ou uma pausa temporária nas chamadas.',
  'READY':'Disponível', 'CONFIGURED':'Configurado', 'CONFIGURED UNVERIFIED':'Ainda não verificado', 'OBSERVED HEALTHY':'Funcionamento confirmado',
  'DEGRADED':'Instável', 'RECENT FAILURE':'Falha recente', 'UNAVAILABLE':'Indisponível', 'NOT CONFIGURED':'Não configurado', 'BLOCKED':'Pendente', 'OFFLINE':'Sem conexão', 'LIMITED':'Limitado', 'SYNCING':'Carregando',
  'New project':'Novo projeto', 'Create project':'Criar projeto', 'Edit project':'Editar projeto', 'Delete project':'Excluir projeto', 'Save changes':'Salvar alterações',
  'Name':'Nome', 'Goal':'Objetivo', 'Description':'Descrição', 'Status':'Estado', 'In progress':'Em andamento', 'Paused':'Pausado', 'Completed':'Concluído', 'All projects':'Todos os projetos', '← All projects':'← Todos os projetos',
  'PROJECT WORKSPACE':'ESPAÇO DO PROJETO', 'Overview':'Visão geral', 'Chat':'Conversa', 'Tasks':'Tarefas', 'Memory':'Memória', 'Project sections':'Seções do projeto',
  'Project tasks':'Tarefas do projeto', 'Completing tasks updates project progress automatically.':'Concluir tarefas atualiza o progresso do projeto.',
  'Add task':'Adicionar tarefa', 'Add a task…':'Escreva uma tarefa…', 'Task title':'Título da tarefa', 'Priority':'Prioridade', 'Due date (optional)':'Prazo (opcional)',
  'Medium':'Média', 'High':'Alta', 'Low':'Baixa', 'No tasks yet. Add the first one.':'Nenhuma tarefa. Adicione a primeira.',
  'Permanent project memory':'Memória do projeto', 'Save memory':'Salvar memória', 'New project memory':'Nova memória do projeto', 'Project memory':'Memória do projeto',
  'Add a durable fact, preference, rule, or decision for this project…':'Salve uma informação, preferência ou decisão deste projeto…',
  'No permanent memories yet. You can add one here or tell Zeus “remember this…” inside the project chat.':'Nenhuma memória salva. Adicione aqui ou diga “lembre disso” na conversa do projeto.',
  'No files or generated outputs yet.':'Nenhum arquivo ou resultado ainda.', 'Anything uploaded here is automatically attached to this project\'s context.':'Os arquivos enviados aqui ficam disponíveis no contexto deste projeto.',
  'Delete this memory':'Excluir esta memória', 'What should this project accomplish?':'O que você quer realizar neste projeto?', 'Optional context':'Contexto opcional',
  'Cancel':'Cancelar', 'Close dialog':'Fechar janela', 'Done':'Concluir', '← Back':'← Voltar',
  'Approve Complex Turbo':'Autorizar execução avançada', 'Higher-budget execution':'Esta tarefa exige mais recursos', 'Approve Turbo':'Autorizar execução',
  'This is a workload bound, not a dollar quote; provider pricing varies.':'Esses limites indicam o trabalho previsto. O custo depende do provedor.',
  'Commit ZIP to GitHub':'Enviar ZIP ao GitHub', 'Repository URL':'Endereço do repositório', 'Branch':'Branch', 'Default branch':'Branch padrão', 'Commit message':'Mensagem do commit',
  'This file is private. Use Download to save it to your device.':'Este arquivo é privado. Use Baixar para salvar no seu dispositivo.',
  'Delete this project memory?':'Excluir esta memória do projeto?', 'Something went wrong. Try again.':'Algo deu errado. Tente novamente.',
  'Analyze the attached file and ground every important claim in the source. Call out anything the source does not support.':'Analise o arquivo anexado, fundamentando as conclusões no conteúdo. Indique o que o arquivo não permite concluir.',
  'Create the next professional deliverable for this work and keep it connected to the conversation.':'Crie um documento profissional para este trabalho e mantenha-o conectado à conversa.',
  'Build this as runnable code. Include focused tests and tell me clearly which tests were not actually executed.':'Crie código executável com testes e indique quais testes foram realmente executados.',
  'Turn this goal into a project plan with clear tasks, risks, and milestones.':'Transforme este objetivo em um plano com tarefas, riscos e marcos.',
  'Search the web for ':'Pesquise na web sobre ', 'Build or review code for ':'Crie ou revise código para ', 'Create an image of ':'Crie uma imagem de ',
  'Create a professional PDF about ':'Crie um PDF profissional sobre ',
  'Analyze the attached source and ground the findings in what it actually supports':'Analise o arquivo anexado e fundamente as conclusões no conteúdo.',
  'No projects yet':'Nenhum projeto ainda', 'Create your first real workspace.':'Crie seu primeiro projeto.',
  'A project connects its conversation, tasks, files, artifacts and memory.':'Um projeto reúne conversas, tarefas, arquivos e memória.',
  'Turn ideas into real projects. Each project has one independent conversation.':'Organize suas ideias em projetos. Cada projeto tem sua própria conversa.',
  'All Projects':'Todos', 'In Progress':'Em andamento', 'Filter projects':'Filtrar projetos', 'Upcoming tasks':'Próximas tarefas',
  'Open workspace ›':'Abrir projeto ›', 'Permanent memory':'Memória do projeto', 'PROJECT CONTEXT':'CONTEXTO DO PROJETO',
  'PERMANENT PROJECT CHAT':'CONVERSA DO PROJETO', 'Execution mode':'Modo de inteligência',
  'Goal, tasks, project files, approved memory and conversation history are injected into every turn.':'Objetivo, tarefas, arquivos, memória e histórico ajudam a contextualizar cada resposta.',
  'This is the permanent conversation for this project. Leaving and returning keeps its history and context.':'Esta conversa fica salva no projeto. Ao voltar, você mantém o histórico e o contexto.',
  'Project context remains attached to this conversation.':'O contexto do projeto permanece nesta conversa.',
  'Next step':'Próximo passo', 'Project status':'Estado do projeto', 'Create deliverable':'Criar documento',
  'Review this project and tell me the next highest-impact step':'Revise este projeto e indique o próximo passo mais importante.',
  'Summarize where this project stands using its tasks, files and conversation history':'Resuma o estado deste projeto usando tarefas, arquivos e histórico.',
  'Create the next deliverable for this project':'Crie o próximo documento para este projeto.',
  'Project files':'Arquivos do projeto', 'Artifacts':'Resultados', 'Next tasks':'Próximas tarefas', 'View all ›':'Ver todas ›',
  'No open tasks.':'Nenhuma tarefa pendente.', 'No goal added yet.':'Nenhum objetivo definido.', 'Progress':'Progresso', 'progress':'de progresso',
  'files':'arquivos', 'memories':'memórias', 'Files + outputs':'Arquivos e resultados', 'Memories':'Memórias',
  'GOAL':'OBJETIVO', 'Manage ›':'Gerenciar ›', 'Recent project material':'Arquivos recentes do projeto', 'Open files ›':'Ver arquivos ›',
  'No project files or outputs yet.':'Nenhum arquivo neste projeto ainda.',
  'Add a clear goal so Zeus and Olympus know what success means.':'Defina o objetivo para orientar o trabalho de Zeus e Olympus.',
  'IN PROGRESS':'Em andamento', 'PAUSED':'Pausado', 'COMPLETED':'Concluído', 'TODO':'A fazer', 'DONE':'Concluído',
  'HIGH':'Alta', 'MEDIUM':'Média', 'LOW':'Baixa', 'Start task':'Iniciar tarefa', 'Mark task done':'Concluir tarefa', 'Reopen task':'Reabrir tarefa',
  'Approved memory is selected deterministically by priority and recency within the AI context budget.':'As memórias mais relevantes e recentes são usadas conforme o espaço disponível para a resposta.',
  'No capability diagnostics reported.':'Nenhum diagnóstico disponível.', 'Diagnostics load when the workspace runtime responds.':'Aguardando o diagnóstico dos serviços.',
  'chat':'Conversas', 'documents':'Documentos', 'imageGeneration':'Criação de imagens', 'imageEditing':'Edição de imagens', 'imageUnderstanding':'Análise de imagens',
  'serverTranscription':'Transcrição de áudio', 'webSearch':'Pesquisa na web', 'githubCommit':'Envio ao GitHub',
  'NOT CONFIGURED':'Não configurado', 'NOT_CONFIGURED':'Não configurado', 'Committing…':'Enviando…',
  'Commit completed.':'Commit concluído.', 'This commit was already completed.':'Este commit já foi concluído.', 'Repository already matches this ZIP.':'O repositório já contém estes arquivos.',
  'Open commit':'Abrir commit', 'Could not commit to GitHub.':'Não foi possível enviar ao GitHub.',
  'Olympus is working':'Olympus está trabalhando', 'Completed':'Concluído', 'INITIALIZING ZEUS':'INICIANDO ZEUS',
  'You are offline. Reconnect and try again.':'Você está sem conexão. Reconecte e tente novamente.',
  'Could not unlock Zeus.':'Não foi possível desbloquear o Zeus.', 'Unlock Zeus again.':'Desbloqueie o Zeus novamente.',
  'Use the same 32+ character private key configured in Netlify.':'Use a chave de acesso configurada, com pelo menos 32 caracteres.',
  'Checking workspace runtime…':'Verificando os serviços…', 'AI runtime and workspace services are available.':'Os serviços de IA e do espaço estão disponíveis.',
  'Workspace loaded, but AI runtime is not fully available.':'O espaço carregou, mas a IA não está totalmente disponível.',
  'Runtime diagnostics did not load. Refresh to retry.':'O diagnóstico não carregou. Atualize a página para tentar novamente.',
  'You are offline. Changes will fail until the connection returns.':'Você está sem conexão. Reconecte antes de enviar alterações.',
  'One explicit, atomic, non-force commit. OlyHub blocks .env/private-key files and credential-like values before writing. If GITHUB_REPO_ALLOWLIST is configured, only listed repositories are accepted.':'O envio cria um commit sem sobrescrever o histórico. Arquivos sensíveis e credenciais são bloqueados. Apenas repositórios autorizados são aceitos.',
  'Choosing the model for this request…':'Preparando sua resposta…', 'Running the selected model…':'Preparando sua resposta…',
  'Olympus is drafting, then writing one answer…':'Olympus está analisando o pedido e preparando a resposta…',
  'Olympus is still writing one answer…':'Olympus continua preparando a resposta…',
  'Olympus is still working · reconnecting to its result…':'Olympus continua trabalhando · recuperando o resultado…',
  'Complex Turbo approved · starting bounded execution…':'Execução avançada autorizada · iniciando o trabalho…',
  'Olympus could not finish that request. Tap Retry.':'Olympus não conseguiu concluir o pedido. Toque em Tentar novamente.',
  'Olympus is still working. Wait a moment, then tap Retry to collect the reply.':'Olympus continua trabalhando. Aguarde um pouco e toque em Tentar novamente para recuperar a resposta.',
  'File uploaded and ready for text analysis.':'Arquivo enviado e pronto para análise.',
  'Image uploaded and ready for vision.':'Imagem enviada e pronta para análise.',
  'File uploaded, but text extraction failed. The original is preserved.':'Arquivo enviado, mas não foi possível extrair o texto. O original foi preservado.',
  'Video source stored; analysis uses sampled frames.':'Vídeo salvo. A análise usa imagens selecionadas do vídeo.',
  'File uploaded and preserved; this type is stored only.':'Arquivo enviado e preservado. Este formato fica disponível para armazenamento.',
  'Recording reached the safe size limit; transcribing captured audio…':'A gravação atingiu o limite de tamanho. Transcrevendo o áudio capturado…',
  'Detecting language and transcribing…':'Identificando o idioma e transcrevendo…',
  'Listening… tap the mic when finished':'Ouvindo… toque no microfone ao terminar', 'Listening…':'Ouvindo…',
  'No speech was detected.':'Nenhuma fala foi detectada.', 'Voice input is not supported by this browser.':'Este navegador não oferece entrada por voz.',
  'Could not encode image.':'Não foi possível preparar a imagem.',
  'This image format could not be decoded on this device.':'Este dispositivo não conseguiu abrir a imagem. Tente outro formato.',
  'This video could not be decoded on this device.':'Este dispositivo não conseguiu abrir o vídeo. Tente outro formato.',
  'Video frame sampling timed out.':'O tempo para preparar as imagens do vídeo se esgotou.',
  'The server sent an unreadable response. Try again.':'Não foi possível ler a resposta do servidor. Tente novamente.',
  'Connection to Zeus ended before the server returned an HTTP response. Your internet may still be fine; retry once, then check Runtime diagnostics if it repeats.':'A conexão com Zeus terminou antes da resposta. Tente novamente. Se persistir, confira os serviços em Configurações.',
  'AI Gateway/provider authentication failed for this runtime.':'Não foi possível autenticar o serviço de IA. Confira a configuração das credenciais.',
  'AI Gateway credits or provider quota are exhausted.':'Os créditos ou a cota do serviço de IA se esgotaram.',
  'The selected AI provider is rate-limiting Zeus right now.':'O serviço de IA atingiu um limite temporário. Aguarde e tente novamente.',
  'A configured model is unavailable; Zeus could not complete fallback safely.':'O modelo de IA está indisponível e Zeus não conseguiu usar uma alternativa.',
  'The AI request exceeded Zeus’s execution budget before a provider completed it.':'O pedido atingiu o limite de execução antes de a IA concluir a resposta.',
  'No configured AI provider completed this request.':'Nenhum serviço de IA conseguiu concluir este pedido.',
  'Your private Zeus access is no longer valid on this screen. Unlock Zeus again.':'Seu acesso ao Zeus expirou ou deixou de ser válido. Desbloqueie novamente.',
  'GitHub commit is not configured on the server yet.':'O envio ao GitHub ainda não está configurado.',
  'GitHub rejected the server credential. Update the GitHub token and try again.':'O GitHub recusou a credencial do servidor. Atualize o token e tente novamente.',
  'GitHub denied this commit. Check repository permission or branch protection.':'O GitHub recusou o commit. Confira as permissões do repositório e a proteção da branch.',
  'The commit was blocked because a credential-like value was detected in the ZIP.':'O envio foi bloqueado porque o ZIP contém um possível segredo ou credencial.',
  'The target branch changed or rejected the safe non-force update.':'A branch de destino mudou ou recusou a atualização. Confira o repositório antes de tentar novamente.',
  'GitHub commit needs an explicit confirmation from this screen.':'Confirme o envio ao GitHub nesta tela antes de continuar.',
  'This repository is outside the configured GitHub allowlist.':'Este repositório não está na lista de destinos autorizados.',
  'Complex Turbo needs your approval before this higher-budget run starts.':'Autorize a execução avançada antes de iniciar esta tarefa.',
  'Hourly execution limit reached (Olympus 3/h, Zeus 15/h by default). Wait for the window to reset.':'O limite de execuções por hora foi atingido. Aguarde a renovação do limite. Por padrão: Olympus 3/h e Zeus 15/h.',
}));

export function translateInterfaceText(value) {
  const reference=/^([\s\S]*?)( · ref .+)$/.exec(value);
  if(reference)return translateInterfaceText(reference[1])+reference[2];
  if (translations.has(value)) return translations.get(value);
  const trimmed=value.trim();
  if (translations.has(trimmed)) return value.replace(trimmed,translations.get(trimmed));
  return value
    .replace(/^Uploading (.+)…$/,'Enviando $1…')
    .replace(/^Open agent (.+)$/,'Abrir agente $1')
    .replace(/^(\d+)% · (\d+) open tasks$/,'$1% · $2 tarefas abertas')
    .replace(/^Preparing (.+) for vision…$/,'Preparando $1 para análise…')
    .replace(/^Sampling (.+) for visual analysis…$/,'Selecionando imagens de $1 para análise…')
    .replace(/^Video prepared: (\d+) sampled frames\. Audio and motion between samples are not analyzed\.$/,'Vídeo preparado: $1 imagens selecionadas. O áudio e os movimentos entre as imagens não são analisados.')
    .replace(/^Could not prepare (.+)\.$/,'Não foi possível preparar $1.')
    .replace(/^Some workspace services did not load: ([\s\S]+)\. Refresh to retry\.$/,(_,list)=>`Alguns serviços não carregaram: ${list.split(', ').map(n=>translations.get(n)||n).join(', ')}. Atualize a página para tentar novamente.`)
    .replace(/^Request failed \(HTTP (\d+)\)\.$/,'Não foi possível concluir o pedido (HTTP $1).')
    .replace(/^Zeus's server timed out or stopped before replying \(HTTP (\d+)\)\. Tap Retry: a reply that finished will be recovered\.$/,'O servidor demorou demais ou foi interrompido (HTTP $1). Toque em Tentar novamente para recuperar uma resposta já concluída.')
    .replace(/^The connection closed after (\d+)s while Zeus was still working[\s\S]+$/,'A conexão terminou após $1 segundos enquanto Zeus trabalhava. Toque em Tentar novamente para recuperar uma resposta já concluída.')
    .replace(/^Start working inside /,'Comece a trabalhar em ')
    .replace(/^Everything here stays attached to /,'O trabalho desta conversa fica salvo em ')
    .replace(/^Working inside /,'Trabalhando em ')
    .replace(/^Start task: /,'Iniciar tarefa: ').replace(/^Mark task done: /,'Concluir tarefa: ').replace(/^Reopen task: /,'Reabrir tarefa: ')
    .replace(/^Expected successful path: (\d+) model calls · up to (\d+) creator workstreams\.$/,'Previsão: $1 chamadas de IA · até $2 frentes de trabalho.')
    .replace(/^Hard ceiling: (\d+) model calls · (\d+)s runtime · up to (.+) output tokens across the pipeline\.$/,'Limites: $1 chamadas de IA · $2 segundos · até $3 tokens de saída.')
    .replace(/^Saved here means durable project memory\.[\s\S]*$/,'As informações salvas aqui ficam disponíveis para este projeto. As mais relevantes são selecionadas para cada resposta.')
    .replace(/^Message (Zeus|Olympus)/,'Mensagem para $1')
    .replace(/^Open project /,'Abrir projeto ')
    .replace(/^Remove /,'Remover ')
    .replace(/^Delete (?:file|artifact) /,'Excluir arquivo ')
    .replace(/^Project: /,'Projeto: ')
    .replace(/\b(\d+) SAVED\b/g,(_,count)=>`${count} ${count==='1'?'SALVA':'SALVAS'}`)
    .replace(/\b(analyzable|vision_only|vision only|stored_only|stored only|omitted_sensitive|omitted sensitive|unsupported|failed)\b/g,word=>({analyzable:'pronto para análise',vision_only:'análise de imagem','vision only':'análise de imagem',stored_only:'armazenado','stored only':'armazenado',omitted_sensitive:'conteúdo sensível omitido','omitted sensitive':'conteúdo sensível omitido',unsupported:'formato não analisável',failed:'falha na análise'}[word]))
    .replace(/\b(\d+) tasks\b/g,'$1 tarefas').replace(/\b(\d+) files\b/g,'$1 arquivos').replace(/\b(\d+) memories\b/g,'$1 memórias')
    .replace(/^Permanent Project chat · dedicated memory \+ files$/,'Conversa do projeto · memória própria e arquivos');
}

export function localizeInterface(root) {
  const protectedContent='.message-body,.private-preview-text,.recent-item,.file-chip,.out-row strong,.artifact-card strong,.proj-body strong,.proj-body>span,.project-title-row h1,.project-title-row p,.overview-goal,.project-context-card>p,.topbar-context strong,.memory-item p,.task-item strong,textarea,script,style';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(!node.parentElement?.closest(protectedContent)||node.parentElement?.closest('[data-ui-label]'))node.nodeValue=translateInterfaceText(node.nodeValue);
  }
  for(const el of root.querySelectorAll('[aria-label],[title],[placeholder],[data-prompt],[data-tool-prompt]')){
    for(const attr of ['aria-label','title','placeholder','data-prompt','data-tool-prompt']){
      if(el.hasAttribute(attr))el.setAttribute(attr,translateInterfaceText(el.getAttribute(attr)));
    }
  }
}
