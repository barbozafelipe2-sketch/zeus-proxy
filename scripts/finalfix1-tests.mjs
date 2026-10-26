import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateArtifactInput, assertArtifactOutputSize } from '../netlify/functions/_shared/artifact-limits.mjs';

assert.equal(validateArtifactInput('pptx','one\ntwo').lineCount,2);
assert.throws(()=>validateArtifactInput('pptx',Array.from({length:181},(_,i)=>`line ${i}`).join('\n')),e=>e?.code==='ARTIFACT_STRUCTURE_LIMIT'&&e?.status===413);
assert.throws(()=>validateArtifactInput('pdf','x'.repeat(100001)),e=>e?.code==='ARTIFACT_TOO_LARGE');
assert.doesNotThrow(()=>validateArtifactInput('xlsx',Array.from({length:100},(_,i)=>`row ${i}`).join('\n')));
assert.throws(()=>assertArtifactOutputSize('pdf',12*1024*1024+1),e=>e?.code==='ARTIFACT_OUTPUT_TOO_LARGE');

const app=readFileSync('public/app.js','utf8');
const files=readFileSync('netlify/functions/files.mjs','utf8');
const artifacts=readFileSync('netlify/functions/artifacts.mjs','utf8');
const extract=readFileSync('netlify/functions/_shared/extract.mjs','utf8');
const storage=readFileSync('netlify/functions/_shared/storage.mjs','utf8');
const conversations=readFileSync('netlify/functions/conversations.mjs','utf8');
const projects=readFileSync('netlify/functions/projects.mjs','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));

assert.ok(app.includes('hydrateProjectWorkspace(state.currentProject.id,{loadConversation:false})'),'project history open must hydrate full project scope');
assert.ok(app.includes("if(state.tab==='Tools')await Promise.all([loadHealth(),loadFiles(),loadArtifacts(),loadToolModels()])"),'Tools must load global output scope and configured model candidates');
assert.ok(app.includes('data-delete-output'),'file/artifact delete action missing');
assert.ok(app.includes('deleteCurrentProject'),'project delete action missing');
assert.ok(app.includes("['documents','DOCUMENTOS E APRESENTAÇÕES','Documentos e apresentações','Textos, relatórios e apresentações de alto impacto.',chat.enabled,chat.label"),'Documents capability must follow chat readiness');
assert.ok(conversations.includes("body?.operation==='rename'")&&conversations.includes("if(req.method==='DELETE')"),'personal conversations must support rename and delete');
assert.ok(conversations.includes('queueConversationBlobs')&&projects.includes('queueProjectBlobs'),'conversation and project deletion must clean stored outputs');
assert.ok(storage.includes("'olyhub-code-workspaces'")&&storage.includes('base_workspace_blob_key'),'deleting a conversation or project must queue Code Agent workspace snapshots for cleanup');
assert.ok(projects.includes('PROJECT_HAS_ACTIVE_WORK')&&projects.includes("DELETE FROM conversations WHERE owner_id=$1 AND project_id=$2"),'project deletion must preserve active work and remove its dedicated chat');
assert.ok(files.includes("if(req.method==='DELETE')"),'file DELETE endpoint missing');
assert.ok(artifacts.includes("if(req.method==='DELETE')"),'artifact DELETE endpoint missing');
assert.ok(files.includes("'file-delete'"),'file delete must queue blob cleanup');
assert.ok(artifacts.includes("'artifact-delete'"),'artifact delete must queue blob cleanup');
assert.ok(artifacts.includes('validateArtifactInput(type,content)'),'artifact request safety validation missing');
assert.ok(extract.includes("import ExcelJS from 'exceljs'"),'XLSX extraction must use existing ExcelJS dependency');
assert.ok(!extract.includes("from 'xlsx'"),'legacy xlsx dependency still imported');
assert.ok(!Object.hasOwn(pkg.dependencies,'xlsx'),'legacy xlsx dependency still present in package.json');

console.log('Final Fix 1/3 product-integrity tests: PASS');
