import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const required = [
  'public/index.html','public/app.js','public/styles.css','public/ui-premium.css',
  'netlify/functions/chat.mjs','netlify/functions/projects.mjs','netlify/functions/tasks.mjs','netlify/functions/memories.mjs',
  'netlify/functions/files.mjs','netlify/functions/file-download.mjs',
  'netlify/functions/artifacts.mjs','netlify/functions/artifact-download.mjs','netlify/functions/health.mjs','netlify/functions/transcribe.mjs',
  'netlify/functions/_shared/models.mjs','netlify/functions/_shared/web-search.mjs','netlify/functions/_shared/memory.mjs','netlify/functions/_shared/artifact.mjs','netlify/functions/_shared/artifact-limits.mjs','netlify/functions/_shared/pdf-layout.mjs','netlify/functions/_shared/extract.mjs','netlify/functions/_shared/auth.mjs','netlify/functions/_shared/db.mjs','netlify/functions/_shared/relations.mjs','netlify/functions/_shared/intent.mjs','netlify/functions/_shared/security.mjs','netlify/functions/_shared/context.mjs','netlify/functions/_shared/runtime.mjs','netlify/functions/_shared/archive-safety.mjs','netlify/functions/_shared/zip-output.mjs','netlify/functions/_shared/pagination.mjs','netlify/functions/_shared/limits.mjs','netlify/functions/_shared/storage.mjs',
  'netlify/database/migrations/20260930044607_create_olyhub_foundation/migration.sql',
  'netlify/database/migrations/20260930080000_add_files/migration.sql',
  'netlify/database/migrations/20261001030000_hard-fix-1-integrity/migration.sql',
  'netlify/database/migrations/20261001043000_hard-fix-3-operations/migration.sql',
  'scripts/hardfix1-tests.mjs','scripts/hardfix2-tests.mjs','scripts/hardfix3-tests.mjs','scripts/finalfix1-tests.mjs','scripts/finalfix2-tests.mjs','scripts/finalfix3-tests.mjs','scripts/polish-tests.mjs','scripts/smoke-live.mjs','.npmrc','netlify/functions/storage-maintenance.mjs','.github/workflows/verify.yml','.github/workflows/smoke-live.yml',
  'netlify.toml','package-lock.json','README.md','CHANGELOG.md','SMOKE-TEST.md'
];
for (const file of required) if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);

const read = f => readFileSync(f,'utf8');
const app = read('public/app.js');
const css = read('public/ui-premium.css');
const chat = read('netlify/functions/chat.mjs');
const models = read('netlify/functions/_shared/models.mjs');
const webSearch = read('netlify/functions/_shared/web-search.mjs');
const health = read('netlify/functions/health.mjs');
const projects = read('netlify/functions/projects.mjs');
const tasks = read('netlify/functions/tasks.mjs');
const memories = read('netlify/functions/memories.mjs');
const files = read('netlify/functions/files.mjs');
const auth = read('netlify/functions/_shared/auth.mjs');
const artifact = read('netlify/functions/_shared/artifact.mjs');
const artifactLimits = read('netlify/functions/_shared/artifact-limits.mjs');
const extract = read('netlify/functions/_shared/extract.mjs');
const toml = read('netlify.toml');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const readme = read('README.md');
const hardFixMigration = read('netlify/database/migrations/20261001030000_hard-fix-1-integrity/migration.sql');
const relations = read('netlify/functions/_shared/relations.mjs');
const dbShared = read('netlify/functions/_shared/db.mjs');
const intent = read('netlify/functions/_shared/intent.mjs');
const security = read('netlify/functions/_shared/security.mjs');
const contextBuilder = read('netlify/functions/_shared/context.mjs');
const runtime = read('netlify/functions/_shared/runtime.mjs');
const archiveSafety = read('netlify/functions/_shared/archive-safety.mjs');
const zipOutput = read('netlify/functions/_shared/zip-output.mjs');
const pagination = read('netlify/functions/_shared/pagination.mjs');
const limits = read('netlify/functions/_shared/limits.mjs');
const storage = read('netlify/functions/_shared/storage.mjs');
const memoryPolicy = read('netlify/functions/_shared/memory.mjs');
const fileDownload = read('netlify/functions/file-download.mjs');
const artifactDownload = read('netlify/functions/artifact-download.mjs');
const pdfLayout = read('netlify/functions/_shared/pdf-layout.mjs');
const npmrc = read('.npmrc');
const storageMaintenance = read('netlify/functions/storage-maintenance.mjs');
const hardFix3Migration = read('netlify/database/migrations/20261001043000_hard-fix-3-operations/migration.sql');

if (pkg.version !== '4.3.4') throw new Error(`Expected package version 4.3.4, found ${pkg.version}`);
if (lock.name !== pkg.name || lock.version !== pkg.version || lock.lockfileVersion !== 3) throw new Error('package-lock metadata does not match package.json / npm v3 lock format.');
const rootLockDeps = lock.packages?.['']?.dependencies || {};
if (JSON.stringify(Object.fromEntries(Object.entries(rootLockDeps).sort())) !== JSON.stringify(Object.fromEntries(Object.entries(pkg.dependencies||{}).sort()))) throw new Error('package-lock root dependencies do not exactly match package.json.');

const mustContain = [
  [app,'projectModal','project creation modal'],
  [app,'id="retry-last"','retry UI'],
  [app,'/api/transcribe','optional voice transcription endpoint'],
  [app,'brand-center','premium header UI'],
  [app,'id="attach"','chat attachment control'],
  [app,'uploadFile(file)','upload handler'],
  [app,'startVoice','voice input handler'],
  [app,'window.webkitSpeechRecognition','browser-native voice recognition'],
  [app,'state.health?.capabilities?.serverTranscription','server transcription gating'],
  [app,'data-mode="ZEUS"','Zeus mode'],
  [app,'data-mode="OLYMPUS"','Olympus mode'],
  [app,'PERMANENT PROJECT CHAT','embedded project chat'],
  [app,'workspace-tabs','project workspace tabs'],
  [app,'Permanent project memory','visible project memory manager'],
  [app,'projectEditModal','project editing UI'],
  [app,'projectFilesView','project files/output view'],
  [app,'Live execution status — no simulated timings.','truthful execution status'],
  [app,'openProjectWorkspace','project workspace loader'],
  [app,"state.tab=state.currentProject?'Projects':'Home'",'project conversations route back to Projects'],
  [app,'resetViewport','mobile tab scroll reset'],
  [css,'OH-004.2.7 — product finish pass','4.2.7 product finish UI'],
  [contextBuilder,'PERSISTENT CONVERSATION HISTORY','conversation history injected into model context'],
  [contextBuilder,'PROJECT PERMANENT MEMORY','project memory injected into model context'],
  [contextBuilder,'PROJECT TASKS','project tasks injected into model context'],
  [chat,'RUNTIME_FAILURE','top-level runtime crash shield'],
  [projects,'memory_count','project memory count'],
  [chat,'runZeus','Zeus runtime'],
  [chat,'runOlympus','Olympus runtime'],
  [chat,'stageArtifact','staged artifact generation from chat'],
  [chat,'finalizeTurn','transactional turn finalization'],
  [chat,'initializeTurn','idempotent turn initialization'],
  [chat,'REQUEST_IN_PROGRESS','idempotency in-progress guard'],
  [chat,'REQUEST_ID_REUSED','request id reuse protection'],
  [chat,"intent.action==='ARTIFACT_CREATE'",'explicit artifact creation intent'],
  [artifact,"import JSZip from 'jszip'",'zip artifact implementation'],
  [artifact,'new JSZip()','zip artifact builder'],
  [extract,"import JSZip from 'jszip'",'zip analysis dependency'],
  [extract,"lower.endsWith('.zip')",'generic zip analysis'],
  [chat,'generateImage','image generation from chat'],
  [models,'executeWithFallback','provider fallback'],
  [webSearch,'web_search','live web search tool'],
  [webSearch,'OPENAI_WEB_SEARCH_MODEL','web search model override'],
  [chat,'runWebSearch','chat web research integration'],
  [app,'message-sources','persistent web citation UI'],
  [models,'function apiRoot','OpenAI base URL normalization'],
  [models,"'gpt-5.6-sol'",'current premium OpenAI Gateway model'],
  [models,"'gpt-5.6-luna'",'current fast OpenAI Gateway model'],
  [models,"'gpt-5'",'stable OpenAI fallback'],
  [models,"'gpt-4.1-mini'",'secondary OpenAI fallback'],
  [models,'serverTranscriptionConfigured','truthful optional server transcription detection'],
  [intent,'classifyIntent','bilingual deterministic intent router'],
  [security,'redactSecrets','secret scrubber'],
  [security,'isSensitiveFilename','sensitive filename blocker'],
  [contextBuilder,'FILES ATTACHED TO THIS TURN','attachment-first context priority'],
  [runtime,'createExecutionBudget','global execution deadline/call budget'],
  [models,'providerRuntimeHealth','provider runtime health'],
  [models,'reviewedAfterFallback','Zeus review survives lead fallback'],
  [models,'OLYMPUS_DIRECTOR_RESERVE_MS','Olympus Director time reserve'],
  [models,'DIVERSITY_SCORE_TOLERANCE','quality-bounded provider diversity'],
  [memoryPolicy,'selectMemoryContext','deterministic project memory selection'],
  [health,"started_at > now() - interval '24 hours'",'persisted provider readiness evidence'],
  [health,'opportunisticDrainBlobGc','automatic queued Blob maintenance'],
  [fileDownload,'FILE_DOWNLOAD_RUNTIME_FAILURE','file download runtime error contract'],
  [artifactDownload,'ARTIFACT_DOWNLOAD_RUNTIME_FAILURE','artifact download runtime error contract'],
  [models,'PROVIDER_CIRCUIT_OPEN','provider circuit breaker'],
  [models,'image_url','OpenAI-compatible vision input'],
  [models,'inlineData','Gemini vision input'],
  [models,'bounded_specialists','bounded Olympus orchestration'],
  [health,'serverTranscriptionConfigured()','health reports actual transcription readiness'],
  [auth,'ZEUS_PROXY_ACCESS_TOKEN','server-side private access verification'],
  [auth,'timingSafeEqual','constant-time private access comparison'],
  [auth,'DATABASE_UNAVAILABLE','controlled database bootstrap failure'],
  [chat,'olympusFallback','Olympus to Zeus fallback'],
  [models,'planSpecialists','domain planner'],
  [models,'bounded_specialists','Olympus bounded specialist strategy'],
  [models,'Director','Olympus Director synthesis'],
  [projects,'INSERT INTO projects','project persistence'],
  [tasks,'syncProjectProgress','task completion updates project progress'],
  [memories,"path:'/api/memories'",'project memory API'],
  [memories,'approved=true','memory API only serves approved project memory'],
  [files,"blobStore('olyhub-files')",'Blob upload storage'],
  [app,'loadOlderMessages','cursor-paginated chat history UI'],
  [app,'loadOlderOutputs','paginated files/artifacts UI'],
  [chat,'guardAiExecution','durable AI concurrency/rate guard'],
  [chat,'pageLimit','chat cursor pagination'],
  [files,'decodeCursor','file cursor pagination'],
  [read('netlify/functions/artifacts.mjs'),'decodeCursor','artifact cursor pagination'],
  [archiveSafety,'ARCHIVE_EXPANSION_LIMIT','archive expansion budget'],
  [archiveSafety,'ARCHIVE_RATIO_LIMIT','archive compression-ratio guard'],
  [archiveSafety,'verifyZipEntries','archive actual decompression verification'],
  [extract,"assertSafeZip(buffer, 'generic')",'ZIP preflight before extraction'],
  [extract,"assertSafeZip(buffer, 'office')",'Office archive preflight'],
  [zipOutput,'ZIP_MANIFEST_MISSING','no fake README-only ZIP success'],
  [artifact,"assertSafeZip(bytes,'generated')",'generated ZIP structural verification'],
  [artifactLimits,'ARTIFACT_STRUCTURE_LIMIT','artifact structural generation budget'],
  [artifactLimits,'MAX_ARTIFACT_BYTES','artifact output byte budget'],
  [app,'hydrateProjectWorkspace','project scope hydration helper'],
  [app,'data-delete-output','file/artifact lifecycle UI'],
  [app,'deleteCurrentProject','project delete UI'],
  [files,"if(req.method==='DELETE')",'file deletion API'],
  [read('netlify/functions/artifacts.mjs'),"if(req.method==='DELETE')",'artifact deletion API'],
  [extract,"import ExcelJS from 'exceljs'",'single spreadsheet library'],
  [limits,'AI_CONCURRENCY_LIMIT','AI concurrency protection'],
  [limits,'AI_RATE_LIMIT','AI hourly safety budget'],
  [limits,'request_rate_events','endpoint rate-event guard'],
  [storage,'blob_gc_queue','durable blob cleanup queue'],
  [storage,'queueProjectBlobs','project Blob cleanup queueing'],
  [storageMaintenance,"path:'/api/storage-maintenance'",'storage reconciliation endpoint'],
  [hardFix3Migration,'CREATE TABLE IF NOT EXISTS request_rate_events','rate event migration'],
  [hardFix3Migration,'CREATE TABLE IF NOT EXISTS blob_gc_queue','blob GC migration'],
  [css,'OH-004.2.10 — operational pagination controls','4.2.10 pagination UI'],
  [css,'OH-004.3.0 — premium product UI refinement','4.3.0 premium UI refinement'],
  [css,'OH-004.3.4 — final product polish','4.3.4 final polish layer'],
  [app,'Multi-specialist synthesis','truthful Olympus product positioning'],
  [app,'OLYMPUS HUB · PERSONAL','personal Zeus product identity'],
  [app,'composer-meta','composer persistence guidance'],
  [chat,'queryAwareExcerpt','query-aware long attachment excerpts'],
  [models,'Never imply current-web research occurred unless retrieval results are explicitly present','retrieval honesty'],
  [models,'never claim tests were executed unless OlyHub actually executed them','test execution honesty'],
  [app,'system-indicator','premium runtime status affordance'],
  [app,'proj-status','premium project status treatment'],
  [app,'auth-proof','premium auth capability proof'],
  [read('netlify.toml'),'Content-Security-Policy','browser CSP hardening'],
  [app,'Some workspace services did not load','visible partial bootstrap failure'],
  [toml,'publish = "public"','publish directory'],
  [toml,'directory = "netlify/functions"','functions directory'],
  [readme,'OH-004.3.4','correct release identity'],
  [hardFixMigration,'conversations_owner_project_canonical_idx','canonical project conversation index'],
  [hardFixMigration,'executions_owner_request_id_idx','idempotent execution request index'],
  [hardFixMigration,'ON DELETE CASCADE','project workspace cascade semantics'],
  [relations,'PROJECT_CONVERSATION_MISMATCH','owned scope relationship guard'],
  [dbShared,"client.query('BEGIN')",'database transaction helper'],
];
for (const [haystack,needle,label] of mustContain) if (!haystack.includes(needle)) throw new Error(`Missing ${label}`);

if (chat.includes("state='CREATING_ARTIFACT'")) throw new Error('Invalid execution_state CREATING_ARTIFACT returned.');
if (/db\.sql[^\n]*\.catch\s*\(/.test(chat)) throw new Error('db.sql tagged result must not use Promise .catch().');
if (/Open in Zeus|Open in Olympus/.test(app)) throw new Error('Project workspace regressed to Home launcher buttons.');
if (/Understanding your request','2s'|Creating the deliverable','15s'/.test(app)) throw new Error('Simulated execution timings returned to the UI.');
if (!app.includes('lastFailedRequestId') || !app.includes('await sendText(text,pending,requestId)')) throw new Error('Retry no longer preserves the original request id.');
if (!chat.includes('ON CONFLICT (owner_id,project_id) WHERE project_id IS NOT NULL')) throw new Error('Canonical project conversation upsert missing.');
if (!chat.includes('ON CONFLICT (owner_id,request_id) WHERE request_id IS NOT NULL')) throw new Error('Execution idempotency upsert missing.');
if (!chat.includes('discardStagedArtifact')) throw new Error('Staged artifact rollback cleanup missing.');
if (!tasks.includes("WHEN status='PAUSED' THEN 'PAUSED'")) throw new Error('Task sync can still overwrite PAUSED project state.');
if (!projects.includes("hasOwn(body,'description')")) throw new Error('Project PATCH is not partial-safe.');
if (!files.includes('resolveOwnedScope') || !read('netlify/functions/artifacts.mjs').includes('resolveOwnedScope')) throw new Error('File/artifact scope ownership validation missing.');

if (extract.includes('|env|')) throw new Error('ZIP extraction still includes .env as a normal text extension.');
if (!app.includes("projectId=state.tab==='Projects'")) throw new Error('Load-older output scope can leak stale Project state into global Files.');
if (!chat.includes("limit=pageLimit") && !chat.includes("const limit=pageLimit")) throw new Error('Chat history pagination missing.');
if (!files.includes("projectId=url.searchParams.get('projectId')")) throw new Error('Project files are not queried directly by project id.');
if (!read('netlify/functions/artifacts.mjs').includes("projectId=url.searchParams.get('projectId')")) throw new Error('Project artifacts are not queried directly by project id.');
if (zipOutput.includes("files.push({ path: 'README.md', data: `# ${title}")) throw new Error('README-only ZIP fallback returned.');
if (!archiveSafety.includes('maxTotalUncompressed') || !archiveSafety.includes('maxCompressionRatio')) throw new Error('Archive safety budgets missing.');
if (!projects.includes('queueProjectBlobs') || !projects.includes('drainBlobGc')) throw new Error('Project deletion does not clean Blob storage safely.');

if (!chat.includes('classifyIntent(content')) throw new Error('Chat no longer uses the deterministic intent router.');
if (!chat.includes('loadVisionInputs')) throw new Error('Real image understanding input loader is missing.');
if (!chat.includes('redactSecrets(content)')) throw new Error('User/provider context secret redaction missing.');
if (!models.includes('primaryCap = complexity(message) >= 4 ? 3 : 2')) throw new Error('Olympus specialist cap regressed.');
if (!models.includes("String(env('OLYHUB_SERVER_TRANSCRIPTION')).toLowerCase() === 'true' && Boolean(audioBase() && audioKey())")) throw new Error('Server transcription no longer requires an explicit audio endpoint/key.');
if (Object.prototype.hasOwnProperty.call(pkg.dependencies||{},'xlsx')) throw new Error('Redundant legacy xlsx dependency returned.');
if (!app.includes("if(state.tab==='Tools')await Promise.all([loadHealth(),loadFiles(),loadArtifacts()])")) throw new Error('Tools can still render stale Project-scoped outputs.');
if (!app.includes('await hydrateProjectWorkspace(state.currentProject.id,{loadConversation:false})')) throw new Error('Opening a Project conversation does not hydrate the full workspace.');

if (models.includes('level >= 2 && lead.attempts.length === 0')) throw new Error('Zeus review is still disabled after a lead fallback.');
if (!models.includes('reserveAfterMs: OLYMPUS_DIRECTOR_RESERVE_MS')) throw new Error('Olympus specialist/critic work can still consume Director time.');
if (models.includes("ui_ux: 'writing'")) throw new Error('UI/UX specialist routing regressed to writing-only need.');
if (!chat.includes('selectMemoryContext(memories)')) throw new Error('Project memory no longer uses deterministic selection policy.');
if (!storage.includes("attempts < 8") || !storage.includes("interval '5 minutes' * LEAST(attempts,6)")) throw new Error('Blob GC retry bound/backoff missing.');
if (!fileDownload.includes('X-OlyHub-Request-Id') || !artifactDownload.includes('X-OlyHub-Request-Id')) throw new Error('Download success responses are missing correlation ids.');

if (!app.includes("const accessStoreKey='olyhub.zeusproxy.access.v2'")) throw new Error('Personal access session key missing.');
if (!app.includes('sessionStorage.setItem(accessStoreKey')) throw new Error('Private access key must remain session-scoped.');
if (app.includes('localStorage.setItem(accessStoreKey')) throw new Error('Private access key must not persist to localStorage.');
if (!app.includes("dialog.setAttribute('role','dialog')") || !app.includes("dialog.setAttribute('aria-modal','true')")) throw new Error('Accessible modal semantics missing.');
if (!app.includes("if(e.key==='Escape')") || !app.includes("if(e.key!=='Tab')return")) throw new Error('Modal keyboard controls missing.');
if (!app.includes("status==='TODO'?'IN_PROGRESS':status==='IN_PROGRESS'?'DONE':'TODO'")) throw new Error('Task three-state UI missing.');
if (!artifact.includes("import { wrapPdfText } from './pdf-layout.mjs'")) throw new Error('Safe measured PDF layout helper missing.');
if (!pdfLayout.includes('font.widthOfTextAtSize') || !pdfLayout.includes("out+='[emoji]'")) throw new Error('PDF overflow/unsupported-glyph safeguards missing.');
if (pkg.dependencies['@netlify/blobs'] !== '10.0.0' || pkg.dependencies['@netlify/database'] !== '1.0.0') throw new Error('Netlify dependencies are not exactly pinned.');
if (Object.values(pkg.dependencies||{}).some(v=>String(v).startsWith('^')||String(v).startsWith('~'))) throw new Error('A production dependency is not exactly pinned.');
if (pkg.engines?.node !== '22.x') throw new Error('Node runtime engine pin missing.');
if (!npmrc.includes('save-exact=true') || !npmrc.includes('package-lock=true') || !npmrc.includes('engine-strict=true')) throw new Error('npm reproducibility policy missing.');

const openAIStart = models.indexOf('async function callOpenAI');
const openAIEnd = models.indexOf('async function callAnthropic', openAIStart);
const openAIFunction = models.slice(openAIStart, openAIEnd);
if (/temperature\s*:/.test(openAIFunction)) throw new Error('OpenAI chat call still sends temperature; this can break newer GPT models.');
if (!openAIFunction.includes('/chat/completions')) throw new Error('OpenAI chat endpoint missing.');

function walk(dir, out=[]) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p=join(dir,name), st=statSync(p);
    if(st.isDirectory()) walk(p,out); else out.push(p);
  }
  return out;
}
for (const file of walk('.')) {
  const rel=relative('.',file).replaceAll('\\','/');
  if(rel==='scripts/verify.mjs') continue;
  if(!/\.(m?js|html|css|toml|json|md|sql)$/i.test(rel)) continue;
  const text=read(file);
  if(/NEXT_PUBLIC_SUPABASE|@supabase|supabase\.co|createClient\s*\(/i.test(text)) throw new Error(`Functional Supabase reference found: ${rel}`);
  if(/\bSOON\b/.test(text) && !rel.endsWith('README.md')) throw new Error(`Dead SOON placeholder found: ${rel}`);
}

const baseline='netlify/database/migrations/20260930044607_create_olyhub_foundation/migration.sql';
const baselineHash=createHash('sha256').update(readFileSync(baseline)).digest('hex');
const expected='90dece71adbd153d42168585fab6988e000fec715c33a6bef3595c2096a52d70';
if(baselineHash!==expected) throw new Error(`Applied baseline migration changed: ${baselineHash}`);

console.log('OlyHub OH-004.3.4 POLISH CANDIDATE verification: PASS');
console.log(`Baseline migration SHA-256: ${baselineHash}`);
console.log('Verified: hardened foundation and Final Fix invariants preserved; 4.3.4 product-polish, source-grounding, long-document and release-gate invariants present.');
