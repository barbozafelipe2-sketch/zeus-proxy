import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {explicitMemoryIntent,memoryContentFromRequest,explicitHistoryIntent,historySearchTerms} from '../netlify/functions/_shared/memory-intent.mjs';

assert.equal(explicitMemoryIntent('Zeus, remember that I prefer calm, concise answers.'),true);
assert.equal(memoryContentFromRequest('Zeus, remember that I prefer calm, concise answers.'),'I prefer calm, concise answers.');
assert.equal(memoryContentFromRequest('Lembre-se que minhas respostas devem ser diretas.'),'minhas respostas devem ser diretas.');
assert.equal(explicitMemoryIntent('I like calm answers.'),false,'ordinary chat must not silently become a saved memory');
for(const text of [
  'What should I remember in Rome?','I cannot remember where I put my keys','Do you remember what we said about Vault?',
  'lembra quando a gente falou do chess?','guarde esse arquivo no drive','remember when we built the vault?','salve isso','remember that?'
])assert.equal(explicitMemoryIntent(text),false,`questions and incidental mentions must not save: ${text}`);
for(const [text,saved] of [
  ['lembre que eu odeio café','eu odeio café'],['guarde que meu café é sem açúcar','meu café é sem açúcar'],
  ['remember: call mom on Sundays','call mom on Sundays'],['save this to memory: I live in North Miami','I live in North Miami'],
  ['Please remember to answer in Portuguese','answer in Portuguese'],['salve isso na memória: prefiro respostas curtas','prefiro respostas curtas'],
  ['guarde isso na memória: prefiro respostas curtas','prefiro respostas curtas']
]){assert.equal(explicitMemoryIntent(text),true,`explicit save command must work: ${text}`);assert.equal(memoryContentFromRequest(text),saved);}
assert.equal(explicitHistoryIntent('What did I tell you about the coffee shop?'),true);
assert.equal(explicitHistoryIntent('Procura nas conversas anteriores o nome da cafeteria.'),true);
assert.equal(explicitHistoryIntent('Tell me about coffee shops.'),false,'ordinary questions must not search old chats');
assert.deepEqual(historySearchTerms('O que eu te contei sobre a cafeteria 7ty One?'),['contei','cafeteria']);

const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const memories=readFileSync('netlify/functions/memories.mjs','utf8');
const ui=readFileSync('public/app.js','utf8');
const models=readFileSync('netlify/functions/_shared/models.mjs','utf8');
assert.match(chat,/project_id IS NULL AND approved=true/,'personal memory must be retrieved for every chat');
assert.match(chat,/if\(explicitHistoryIntent\(currentText\)\)/,'history search must only run for explicit recall requests');
assert.match(chat,/m\.owner_id=\$?\{?userId\}?/,'history lookup must remain account scoped');
assert.match(chat,/memorySaved,historySearched/,'API must report the actual save/search result');
assert.match(memories,/scope==='personal'/,'settings must have an account-wide memory scope');
assert.match(memories,/project_id IS NULL/,'personal memories must be independent of projects');
assert.match(ui,/Personal memory/,'saved personal memories must be visible in Settings');
assert.match(ui,/loadPersonalMemories\(\)/,'the app must load saved personal memories');
assert.match(ui,/memorySaved:Boolean\(d\.memorySaved\),historySearched:Boolean\(d\.historySearched\)/,'Live Talk must receive the tool result status');
assert.match(ui,/OWNER-APPROVED PERSONAL MEMORY/,'Live Talk must receive approved persistent memories');
assert.match(ui,/Do not search old chats on your own/,'Live Talk must not spend calls searching history without permission');
assert.match(models,/Avoid excessive enthusiasm, reflexive praise, hype/,'all Zeus replies must use a restrained tone');
console.log('Persistent memory, explicit history recall, Live Talk context, and restrained tone: PASS');
