import assert from 'node:assert/strict';
import { detectProjectTaskCommand, executeProjectTaskCommand } from '../netlify/functions/_shared/project-task-actions.mjs';

const now=new Date('2026-10-26T12:00:00.000Z');

const screenshotCommand=detectProjectTaskCommand('Fazer homework o nome da tarefa nenhum detalhe apenas prazo 7 dias',{now});
assert.deepEqual(screenshotCommand,{type:'create',title:'Fazer homework',dueAt:'2026-11-02T12:00:00.000Z',target:'Fazer homework o nome da tarefa nenhum detalhe apenas prazo 7 dias'});

const englishCreate=detectProjectTaskCommand('Create a task called "Do homework" due in 7 days',{now});
assert.equal(englishCreate?.type,'create');
assert.equal(englishCreate?.title,'Do homework');
assert.equal(englishCreate?.dueAt,'2026-11-02T12:00:00.000Z');

const checklistCreate=detectProjectTaskCommand('Adiciona cada item do checklist como tarefa:\n- Comprar leite\n- Fazer homework\n- Estudar inglês',{now});
assert.equal(checklistCreate?.type,'create_many');
assert.deepEqual(checklistCreate?.titles,['Comprar leite','Fazer homework','Estudar inglês']);
assert.deepEqual(detectProjectTaskCommand('Adiciona cada item do checklist como tarefa')?.titles,[], 'a checklist request without visible items must resolve items from history or ask, never create the request sentence as a task');

const portugueseComplete=detectProjectTaskCommand('Marque a tarefa "Test task" como completa',{now});
assert.equal(portugueseComplete?.type,'status');
assert.equal(portugueseComplete?.status,'DONE');

const englishComplete=detectProjectTaskCommand('Mark the task Test task as done',{now});
assert.equal(englishComplete?.type,'status');
assert.equal(englishComplete?.status,'DONE');

assert.equal(detectProjectTaskCommand('Como fazer com que essa tarefa apareça como completa?'),null,'a how-to question must not mutate a task');
assert.equal(detectProjectTaskCommand('Estou.'),null,'an acknowledgement must not be treated as approval to mutate a task');
assert.equal(detectProjectTaskCommand('Can you show me the project task list?'),null,'a task-list question must not create a task');

const noProject=await executeProjectTaskCommand({db:null,ownerId:'owner',projectId:null,conversationId:null,text:'Mark task Test task as done'});
assert.equal(noProject?.handled,true);
assert.equal(noProject?.ok,false);
assert.match(noProject?.reply,/open the project/i);

let completedAt=null;
let projectProgress=null;
const db={
  sql:async(strings)=>{
    const query=strings.join('?');
    if(query.includes('SELECT id,name FROM projects'))return [{id:'project-id',name:'Test'}];
    if(query.includes('SELECT id,title,status,priority,due_at FROM tasks'))return [{id:'task-id',title:'Test task',status:'IN_PROGRESS',priority:'MEDIUM',due_at:null}];
    throw new Error(`Unexpected SQL read: ${query}`);
  },
  pool:{connect:async()=>({
    async query(query,params=[]){
      if(query==='BEGIN'||query==='COMMIT'||query==='ROLLBACK')return {rows:[]};
      if(query.includes('SELECT id FROM projects')&&query.includes('FOR UPDATE'))return {rows:[{id:'project-id',name:'Test'}]};
      if(query.includes('UPDATE tasks SET status=$1')){
        completedAt=params[1];
        return {rows:[{id:'task-id',title:'Test task',status:params[0],priority:'MEDIUM',due_at:null}]};
      }
      if(query.includes('SELECT count(*)::int AS total'))return {rows:[{total:1,done:1}]};
      if(query.includes('UPDATE projects SET progress=$1')){
        projectProgress=params[0];
        return {rows:[{id:'project-id',name:'Test',progress:params[0],status:'COMPLETED'}]};
      }
      throw new Error(`Unexpected SQL write: ${query}`);
    },release(){}}
  )}
};
const completed=await executeProjectTaskCommand({db,ownerId:'owner',projectId:'project-id',conversationId:null,text:'Marque a tarefa "Test task" como completa',now});
assert.equal(completed?.ok,true);
assert.equal(completed?.task?.status,'DONE');
assert.equal(completedAt,now.toISOString(),'marking complete must persist a completion timestamp');
assert.equal(projectProgress,100,'completing the final task must update project progress');
assert.match(completed?.reply,/marcada como concluída/);

const insertedTitles=[];
let checklistProgress=null;
const checklistDb={
  sql:async(strings)=>{
    const query=strings.join('?');
    if(query.includes('SELECT id,name FROM projects'))return [{id:'project-id',name:'Test'}];
    throw new Error(`Unexpected checklist SQL read: ${query}`);
  },
  pool:{connect:async()=>({
    async query(query,params=[]){
      if(query==='BEGIN'||query==='COMMIT'||query==='ROLLBACK')return {rows:[]};
      if(query.includes('SELECT id,name FROM projects')&&query.includes('FOR UPDATE'))return {rows:[{id:'project-id',name:'Test'}]};
      if(query.includes('INSERT INTO tasks')){insertedTitles.push(params[2]);return {rows:[{id:`task-${insertedTitles.length}`,title:params[2],status:'TODO',priority:'MEDIUM',due_at:params[3]}]};}
      if(query.includes('SELECT count(*)::int AS total'))return {rows:[{total:insertedTitles.length,done:0}]};
      if(query.includes('UPDATE projects SET progress=$1')){checklistProgress=params[0];return {rows:[{id:'project-id',name:'Test',progress:params[0],status:'IN_PROGRESS'}]};}
      throw new Error(`Unexpected checklist SQL write: ${query}`);
    },release(){}
  })}
};
const checklist=await executeProjectTaskCommand({db:checklistDb,ownerId:'owner',projectId:'project-id',conversationId:null,text:'Adiciona cada item do checklist como tarefa:\n- Comprar leite\n- Fazer homework\n- Estudar inglês',now});
assert.equal(checklist?.ok,true);
assert.equal(checklist?.tasks?.length,3);
assert.deepEqual(insertedTitles,['Comprar leite','Fazer homework','Estudar inglês']);
assert.equal(checklistProgress,0,'new checklist tasks must remain pending');
assert.match(checklist?.reply,/Criei 3 tarefas/);

console.log('Project task action tests passed');
