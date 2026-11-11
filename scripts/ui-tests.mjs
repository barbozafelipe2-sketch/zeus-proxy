import { readFileSync } from 'node:fs';

const app=readFileSync('public/app.js','utf8');
const css=readFileSync('public/ui-premium.css','utf8');
const toolCatalog=app.slice(app.indexOf('function toolsView(){'),app.indexOf('\nfunction zeusRealmView(){'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const must=[
  [/^4\.3\./.test(pkg.version),true,'4.3.x release version'],
  [css,'OH-004.3.0 — premium product UI refinement','premium UI marker'],
  [css,'prefers-reduced-motion','reduced motion support'],
  [css,':focus-visible','keyboard focus visibility'],
  [css,'.project-grid{display:grid','project card grid'],
  [css,'.system-indicator','runtime status treatment'],
  [app,'Titular da conta','personal workspace account identity'],
  [app,'class="topbar-context"','workspace context header'],
  [app,'side-project-section','persistent Projects navigation'],
  [app,'sidebar-create-project','Project creation from navigation'],
  [app,'${modeStrip()}','shared Poseidon tool context'],
  [app,"['Projects','projects','Projetos','bottom']",'Projects destination is retained in the mobile bottom navigation'],
  [app,'class="proj-card-main" data-project="${esc(p.id)}" aria-label="Abrir projeto','keyboard-accessible native project card button'],
  [app,'aria-label="Excluir esta memória"','memory action label'],
  [app,'aria-disabled="true"','truthful disabled tools'],
];
for(const [haystack,needle,label] of must){if(typeof haystack==='boolean'){if(haystack!==needle)throw new Error(`Missing ${label}`)}else if(!String(haystack).includes(needle))throw new Error(`Missing ${label}`)}
if(app.includes('id="zeus-level-cap"')||app.includes('id="olympus-auto"')||app.includes('data-routing-mode=')||app.includes('data-mode='))throw new Error('Legacy mode or level selectors must not appear in the Poseidon chat');
if(!app.includes('olympusAuto:true')||!app.includes('specialistLabel(userRow?.metadata?.toolId)')||!app.includes('Trace Lab ·'))throw new Error('Poseidon-managed dispatch, live specialist status or per-message Trace Lab is missing');
if(!app.includes('PRIVATE AI WORKSPACE')||!app.includes("'Poseidon is still working."))throw new Error('OlyHub identity or Poseidon Text status is missing');
const homeView=app.slice(app.indexOf('function homeView()'),app.indexOf('function safeSources'));
if(/homeAgentPanel|homeContextPanel|homeMobileArtifacts|managerAgentStrip/.test(homeView))throw new Error('Poseidon Home must open directly into chat without legacy dashboard panels');
if(!app.includes("liveAgentSelection:'athena'")||!app.includes("mode:'ZEUS'")||!app.includes("X-Zeus-Voice-Fallback"))throw new Error('Athena voice identity and legacy execution identifiers must remain compatible');
const nav=app.slice(app.indexOf('function navButtons(){'),app.indexOf('\nfunction homeChats()'));
if(nav.includes("['Zeus','chart','Zeus']"))throw new Error('Zeus must not be a standalone navigation tab');
const blueprint=JSON.parse(readFileSync(new URL('../public/realm-blueprint.json',import.meta.url),'utf8'));
if(blueprint.realms.slice(0,3).map(realm=>realm.id).join(',')!=='zeus,poseidon,athena'||!toolCatalog.includes('state.realmBlueprint?.realms'))throw new Error('UI must render the canonical order with Zeus and Poseidon first');
if(!toolCatalog.includes('data-new-chat="true"'))throw new Error('Poseidon card must open a clean new chat');
if(toolCatalog.includes('tool-god-mark')||toolCatalog.includes('tool.mark'))throw new Error('Deity symbols must not overlay faces on any tool card');
if(!app.includes('voice-orb-options')||!app.includes("amber:{label:'Dourada'")||!app.includes("ocean:{label:'Oceano'"))throw new Error('Live Talk must offer several orb previews, including the restored gold and blue styles');
const liveUi=app.slice(app.indexOf('function liveTalkExperience(){'),app.indexOf('\nfunction liveTalkDock(){'));
if(liveUi.includes('Poseidon')||liveUi.includes('Athena')||liveUi.includes('Helen'))throw new Error('Live Talk UI must not pin a deity name while the orb can change');
if(/Open in Zeus|Open in Olympus/.test(app))throw new Error('Project UI regressed to Home launcher buttons');
if(!css.includes('.projects-page .page-head{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:stretch}')||!css.includes('.projects-page .page-head .primary{width:100%;min-height:46px'))throw new Error('New project button must be full-width and tappable on phones');
if(!css.includes('.projects-page .page-head .primary{box-sizing:border-box;max-width:100%;white-space:normal;line-height:1.2;overflow-wrap:anywhere}'))throw new Error('New project button text must wrap inside the mobile button');
if(!app.includes("id=\"create-project\">${icon('plus')} New project"))throw new Error('Projects page must retain the create-project action');
for(const god of ['Athena','Hefesto','Apollo','Dionísio','Artemis','Deméter','Hermes','Hades'])if(!blueprint.realms.some(realm=>realm.name===god))throw new Error(`Canonical blueprint is missing deity ${god}`);
if(!toolCatalog.includes("data-tool-start=\"${action.kind}\"")||!toolCatalog.includes("data-tab=\"${action.tab}\"")||!toolCatalog.includes('state.realmBlueprint?.internalCapabilities'))throw new Error('Canonical catalog actions or internal-capability labels are missing');
if(toolCatalog.includes("id:'hestia'")||toolCatalog.includes("id:'mnemosine'"))throw new Error('Internal capabilities must not appear as independent deity Realms');

// Regression contract: lost connections recover by request id, not a paid repost.
const chatServer=readFileSync('netlify/functions/chat.mjs','utf8');
if(!chatServer.includes("url.searchParams.has('requestId')")||!chatServer.includes('EXECUTION_NOT_FOUND')||!chatServer.includes('dispatchRequired:true,dispatchToken'))throw new Error('Durable request status and browser-dispatch fallback missing');
if(chatServer.includes('const inlineClaim=await claimInlineFallback'))throw new Error('Long jobs may not fall back to a synchronous worker');
if(!app.includes("PENDING_TURN_STORAGE_KEY='olyhub.pending-turn.v1'")||!app.includes("await api('/api/chat?requestId='+encodeURIComponent(requestId))")||!app.includes('Recuperar resultado'))throw new Error('Browser cannot resume the same execution');
if(!app.includes("if(d.dispatchRequired)")||!app.includes("await api('/api/olympus-background'"))throw new Error('Authenticated browser dispatch missing');
if(!css.includes('.project-chat-panel>.composer-shell{')||!css.includes('bottom:auto!important')||!css.includes('.project-chat-layout{display:grid!important;grid-template-columns:minmax(0,1fr)!important'))throw new Error('Mobile project composer overlap regression');
console.log('OH-004.3.x UI regression tests: PASS');

if(!app.includes("activeMode:null"))throw new Error('execution mode state must not pin old chats to Zeus');
if(!app.includes('syncActiveModeFromMessages'))throw new Error('loaded chats must restore their actual last execution mode');
