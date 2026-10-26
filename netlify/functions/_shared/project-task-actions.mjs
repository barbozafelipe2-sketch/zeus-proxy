import { withTransaction } from './db.mjs';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const TASK_WORD = /\b(?:task|tasks|tarefa|tarefas|todo)\b/i;
const QUESTION = /^\s*(?:como|how|why|what|where|when|can you tell|could you tell|quero saber|me explica|me diga)\b/i;
const COMPLETE = /\b(?:done|complete(?:d)?|completa?s?|conclu[ií]da?s?|finalizada?s?|terminada?s?)\b/i;
const IN_PROGRESS = /\b(?:in progress|em andamento|start(?:ed)?|iniciar|iniciada?s?|comecar|comecada?s?)\b/i;
const TODO = /\b(?:to do|not started|pendente|aberta?|nao iniciada?)\b/i;
const CHANGE_VERB = /\b(?:mark|set|change|update|finish|complete|conclude|marcar|marque|marca|concluir|conclua|conclui|finalizar|finalize|deixar|deixe|colocar|coloque|alterar|atualizar)\b/i;
const CREATE_VERB = /\b(?:create|add|make|crie|criar|cria|adicione|adicionar|adiciona|faca|fazer|fa[cç]a|inclua|incluir)\b/i;
const DUE_DETAIL = /\b(?:due|deadline|prazo|vencimento)\b/i;
const ADD_CHECKLIST = /\b(?:add|create|make|adicione|adicionar|adiciona|crie|criar|cria|inclua|incluir)\b.{0,70}\b(?:each|every|cada)\b.{0,50}\b(?:checklist|check list|lista|item|items|itens)\b|\b(?:checklist|check list|lista)\b.{0,70}\b(?:as|como)\s+(?:tasks|tarefas)\b/i;

function checklistItems(text) {
  let insideList = false;
  const items = String(text || '').split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (/^(?:checklist|check\s+list|lista(?:\s+de\s+tarefas)?)\s*:?$/i.test(trimmed)) { insideList = true; return ''; }
    const marked = /^\s*(?:[-*•‣▪]|\[\s?[xX]?\s?\]|\d{1,2}[.)])\s*/.test(line);
    if (marked) return trimmed.replace(/^(?:[-*•‣▪]|\[\s?[xX]?\s?\]|\d{1,2}[.)])\s*/, '').replace(/[\s.;]+$/, '').trim();
    if (insideList && trimmed) return trimmed.replace(/[\s.;]+$/, '').trim();
    if (!trimmed) insideList = false;
    return '';
  }).filter(item => item.length >= 2 && !/^(?:add|create|make|adicione|adicionar|adiciona|crie|criar|cria|inclua|incluir)\b/i.test(normalize(item)))
    .map(item => cleanTitle(item));
  return [...new Set(items)].slice(0, 30);
}

function titleFromCreate(text) {
  let match = text.match(/^(.+?)\s+(?:o\s+)?(?:nome\s+da\s+tarefa|task\s+name)\b/i);
  if (match) return cleanTitle(match[1]);

  match = text.match(/(?:task|tarefa)\s+(?:called|named|chamada|intitulada|com\s+nome|name|nome)\s*[:=]?\s*["“']?(.+?)["”']?(?=\s+(?:due|deadline|prazo|vencimento|description|descri[cç][aã]o|priority|prioridade)\b|[.!?]|$)/i);
  if (match) return cleanTitle(match[1]);

  match = text.match(/(?:task|tarefa)\s*[:=\-]\s*["“']?(.+?)["”']?(?=\s+(?:due|deadline|prazo|vencimento|description|descri[cç][aã]o|priority|prioridade)\b|[.!?]|$)/i);
  if (match) return cleanTitle(match[1]);

  match = text.match(/\b(?:create|add|make|crie|criar|cria|adicione|adicionar|adiciona|faca|fazer|fa[cç]a|inclua|incluir)\b.{0,45}\b(?:task|tarefa)\b\s+(?:called|named|chamada|intitulada|com\s+nome)?\s*["“']?(.+?)["”']?(?=\s+(?:due|deadline|prazo|vencimento|description|descri[cç][aã]o|priority|prioridade)\b|[.!?]|$)/i);
  return match ? cleanTitle(match[1]) : '';
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/^[\s:;,.\-–—"“”'`]+|[\s:;,.\-–—"“”'`]+$/g, '')
    .replace(/\b(?:nenhum detalhe|no details|sem detalhes)\b.*$/i, '')
    .trim().slice(0, 200);
}

function dueDateFrom(text, now) {
  const normalized = normalize(text);
  let match = normalized.match(/\b(?:prazo|vencimento|due|deadline)(?:\s+(?:em|in|de))?\s+(\d{1,3})\s*(?:dias?|days?)\b/)
    || normalized.match(/\b(?:in|em)\s+(\d{1,3})\s*(?:dias?|days?)\b/);
  let days = match ? Number(match[1]) : 0;
  if (!days && /\b(?:next week|in a week|semana que vem|daqui a uma semana)\b/.test(normalized)) days = 7;
  if (days > 0 && days <= 3650) return new Date(now.getTime() + days * 86400000).toISOString();
  match = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (match) {
    const date = new Date(`${match[1]}T12:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

export function detectProjectTaskCommand(text, { now = new Date() } = {}) {
  const raw = String(text || '').trim();
  if (!raw || QUESTION.test(raw)) return null;
  const normalized = normalize(raw);
  const status = COMPLETE.test(normalized) ? 'DONE' : IN_PROGRESS.test(normalized) ? 'IN_PROGRESS' : TODO.test(normalized) ? 'TODO' : null;
  if (status && CHANGE_VERB.test(normalized) && (TASK_WORD.test(normalized) || /\b(?:it|this|that|essa|esta|essa tarefa|isso)\b/.test(normalized))) {
    return { type: 'status', status, target: raw, dueAt: null };
  }

  if (ADD_CHECKLIST.test(normalized)) return { type: 'create_many', titles: checklistItems(raw), dueAt: dueDateFrom(raw, now), target: raw };

  const hasTaskNameMarker = /\b(?:nome\s+da\s+tarefa|task\s+name)\b/i.test(raw);
  const hasExplicitCreate = CREATE_VERB.test(normalized) && TASK_WORD.test(normalized);
  if (!hasExplicitCreate && !hasTaskNameMarker) return null;
  if (/\b(?:task|tarefa)\s+list\b/i.test(raw)) return null;
  return { type: 'create', title: titleFromCreate(raw), dueAt: dueDateFrom(raw, now), target: raw };
}

function taskReferenceMatches(tasks, text) {
  const normalized = normalize(text);
  return tasks.filter(task => {
    const title = normalize(task.title);
    return title.length >= 2 && normalized.includes(title);
  });
}

function completionLabel(status, portuguese) {
  if (status === 'DONE') return portuguese ? 'concluída' : 'complete';
  if (status === 'IN_PROGRESS') return portuguese ? 'em andamento' : 'in progress';
  return portuguese ? 'pendente' : 'not started';
}

async function syncProjectProgress(client, ownerId, projectId) {
  const stats = (await client.query(
    `SELECT count(*)::int AS total,count(*) FILTER (WHERE status='DONE')::int AS done FROM tasks WHERE owner_id=$1 AND project_id=$2`,
    [ownerId, projectId]
  )).rows[0] || {};
  const total = Number(stats.total || 0), done = Number(stats.done || 0);
  return (await client.query(
    `UPDATE projects SET progress=$1,status=CASE WHEN status='PAUSED' THEN 'PAUSED' WHEN $2::int>0 AND $3::int=$2::int THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,updated_at=now() WHERE id=$4 AND owner_id=$5 RETURNING id,name,progress,status`,
    [total ? Math.round(done / total * 100) : 0, total, done, projectId, ownerId]
  )).rows[0] || null;
}

export async function executeProjectTaskCommand({ db, ownerId, projectId, conversationId, text, now = new Date() }) {
  const command = detectProjectTaskCommand(text, { now });
  if (!command) return null;
  const portuguese = /\b(?:tarefa|cria|criar|adicione|adicionar|prazo|conclu[ií]da|conclua|marca|marcar)\b/i.test(normalize(text));
  if (!projectId) return { handled: true, ok: false, type: command.type, reply: portuguese ? 'Não alterei nada: abra o projeto onde essa tarefa deve ficar e envie o pedido novamente.' : 'I did not change anything. Open the project where this task belongs and send the request again.' };

  const projectRows = await db.sql`SELECT id,name FROM projects WHERE id=${projectId} AND owner_id=${ownerId}`;
  const project = projectRows[0];
  if (!project) return { handled: true, ok: false, type: command.type, reply: portuguese ? 'Não alterei nada: não encontrei esse projeto na sua conta.' : 'I did not change anything: that project was not found in your account.' };

  if (command.type === 'create' || command.type === 'create_many') {
    let titles = command.type === 'create_many' ? command.titles : [command.title].filter(Boolean);
    if (command.type === 'create_many' && !titles.length && conversationId) {
      const history = await db.sql`SELECT role,content FROM messages WHERE owner_id=${ownerId} AND conversation_id=${conversationId} ORDER BY created_at DESC LIMIT 20`;
      const checklistMessage = history.find(row => /\b(?:checklist|check list|lista)\b/i.test(normalize(row.content)) && checklistItems(row.content).length);
      if (checklistMessage) titles = checklistItems(checklistMessage.content);
    }
    if (!titles.length) return { handled: true, ok: false, type: command.type, reply: command.type === 'create_many' ? (portuguese ? 'Não criei tarefas: não encontrei os itens do checklist nesta mensagem nem no histórico recente. Cole o checklist ou peça para gerar e adicionar os itens.' : 'I did not create tasks because I could not find checklist items in this message or recent conversation. Paste the checklist or ask me to generate and add its items.') : (portuguese ? 'Não criei a tarefa porque não consegui identificar o título. Envie, por exemplo: “Crie a tarefa Fazer homework, com prazo de 7 dias”.' : 'I did not create a task because I could not identify its title. For example: “Create the task Do homework, due in 7 days”.') };
    const created = await withTransaction(db, async client => {
      const locked = (await client.query(`SELECT id,name FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE`, [projectId, ownerId])).rows[0];
      if (!locked) return null;
      const tasks = [];
      for (const title of titles) tasks.push((await client.query(
        `INSERT INTO tasks(owner_id,project_id,title,description,status,priority,due_at) VALUES($1,$2,$3,'','TODO','MEDIUM',$4) RETURNING id,title,status,priority,due_at`,
        [ownerId, projectId, title, command.dueAt]
      )).rows[0]);
      const updatedProject = await syncProjectProgress(client, ownerId, projectId);
      return { tasks, project: updatedProject };
    });
    if (!created) return { handled: true, ok: false, type: command.type, reply: portuguese ? 'Não criei a tarefa: o projeto não existe mais.' : 'The task was not created because the project no longer exists.' };
    const dueAt = created.tasks[0]?.due_at;
    const due = dueAt ? new Date(dueAt).toLocaleDateString(portuguese ? 'pt-BR' : 'en-US', { timeZone: 'UTC' }) : null;
    const titlesText = created.tasks.map(task => `“${task.title}”`).join(', ');
    const reply = command.type === 'create_many'
      ? (portuguese ? `Criei ${created.tasks.length} tarefas no projeto “${project.name}”: ${titlesText}${due ? `. Prazo: ${due}` : ''}. Todas estão pendentes.` : `Created ${created.tasks.length} tasks in project “${project.name}”: ${titlesText}${due ? `. Due ${due}` : ''}. All are not started.`)
      : (portuguese ? `Tarefa “${created.tasks[0].title}” criada no projeto “${project.name}”${due ? ` com prazo em ${due}` : ''}. Status: pendente.` : `Task “${created.tasks[0].title}” was created in project “${project.name}”${due ? `, due ${due}` : ''}. Status: not started.`);
    return { handled: true, ok: true, type: command.type, task: created.tasks[0], tasks: created.tasks, project: created.project, reply };
  }

  const taskRows = await db.sql`SELECT id,title,status,priority,due_at FROM tasks WHERE owner_id=${ownerId} AND project_id=${projectId} ORDER BY created_at DESC LIMIT 100`;
  let matches = taskReferenceMatches(taskRows, text);
  if (!matches.length && conversationId && /\b(?:it|this|that|essa|esta|isso)\b/i.test(normalize(text))) {
    const priorRows = await db.sql`SELECT content FROM messages WHERE owner_id=${ownerId} AND conversation_id=${conversationId} ORDER BY created_at DESC LIMIT 12`;
    const priorText = priorRows.map(row => String(row.content || '')).join('\n');
    matches = taskReferenceMatches(taskRows, priorText);
  }
  if (matches.length !== 1) {
    const reason = matches.length ? (portuguese ? 'Encontrei mais de uma tarefa possível. Diga o título exato.' : 'I found more than one matching task. Please give me its exact title.')
      : (portuguese ? 'Não alterei nada porque não consegui identificar a tarefa. Diga o título dela.' : 'I did not change anything because I could not identify the task. Please give me its title.');
    return { handled: true, ok: false, type: command.type, reply: reason };
  }
  const target = matches[0];
  if (target.status === command.status) return { handled: true, ok: true, type: command.type, task: target, project, reply: portuguese ? `A tarefa “${target.title}” já está ${completionLabel(command.status, true)}.` : `Task “${target.title}” is already ${completionLabel(command.status, false)}.` };
  const updated = await withTransaction(db, async client => {
    const lockedProject = (await client.query(`SELECT id FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE`, [projectId, ownerId])).rows[0];
    if (!lockedProject) return null;
    const task = (await client.query(
      `UPDATE tasks SET status=$1,completed_at=$2 WHERE id=$3 AND project_id=$4 AND owner_id=$5 RETURNING id,title,status,priority,due_at`,
      [command.status, command.status === 'DONE' ? now.toISOString() : null, target.id, projectId, ownerId]
    )).rows[0];
    if (!task) return null;
    const updatedProject = await syncProjectProgress(client, ownerId, projectId);
    return { task, project: updatedProject };
  });
  if (!updated) return { handled: true, ok: false, type: command.type, reply: portuguese ? 'Não alterei nada: a tarefa não foi encontrada.' : 'I did not change anything: the task was not found.' };
  return { handled: true, ok: true, type: command.type, task: updated.task, project: updated.project, reply: portuguese ? `Tarefa “${updated.task.title}” marcada como ${completionLabel(command.status, true)}.` : `Task “${updated.task.title}” marked ${completionLabel(command.status, false)}.` };
}
