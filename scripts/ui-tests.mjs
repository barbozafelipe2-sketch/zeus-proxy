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
  [app,'Personal owner','personal workspace account identity'],
  [app,'class="topbar-context"','workspace context header'],
  [app,'function managerAgentStrip()','Home Project strip'],
  [app,'id="manager-title">Projects</h1>','Home Projects heading'],
  [app,'${modeStrip()}','shared Poseidon tool context'],
  [app,"['Projects','projects','Projects']",'Projects navigation label with compatible Projects state'],
  [app,'class="proj-card-main" data-project="${esc(p.id)}" aria-label="Abrir projeto','keyboard-accessible native project card button'],
  [app,'aria-label="Delete this memory"','memory action label'],
  [app,'aria-disabled="true"','truthful disabled tools'],
];
for(const [haystack,needle,label] of must){if(typeof haystack==='boolean'){if(haystack!==needle)throw new Error(`Missing ${label}`)}else if(!String(haystack).includes(needle))throw new Error(`Missing ${label}`)}
if(app.includes('id="zeus-level-cap"')||app.includes('id="olympus-auto"')||app.includes('data-routing-mode=')||app.includes('data-mode='))throw new Error('Legacy mode or level selectors must not appear in the Poseidon chat');
if(!app.includes('olympusAuto:true')||!app.includes('specialistLabel(userRow?.metadata?.toolId)')||!app.includes('Trace Lab ·'))throw new Error('Poseidon-managed dispatch, live specialist status or per-message Trace Lab is missing');
if(!app.includes('PERSONAL · POSEIDON')||!app.includes("'Poseidon is working'"))throw new Error('Poseidon Text identity or status is missing');
if(!app.includes("liveAgentSelection:'athena'")||!app.includes("mode:'ZEUS'")||!app.includes("X-Zeus-Voice-Fallback"))throw new Error('Athena voice identity and legacy execution identifiers must remain compatible');
const nav=app.slice(app.indexOf('function navButtons(){'),app.indexOf('\nfunction homeChats()'));
if(nav.includes("['Zeus','chart','Zeus']"))throw new Error('Zeus must not be a standalone navigation tab');
const zeusIndex=toolCatalog.indexOf("id:'zeus'");
const poseidonIndex=toolCatalog.indexOf("id:'poseidon'");
const athenaIndex=toolCatalog.indexOf("id:'athena'");
if(!(zeusIndex>=0&&poseidonIndex>zeusIndex&&athenaIndex>poseidonIndex))throw new Error('Zeus and Poseidon must lead the tools catalog in that order');
if(!toolCatalog.includes('data-new-chat="true"'))throw new Error('Poseidon card must open a clean new chat');
const liveUi=app.slice(app.indexOf('function liveTalkExperience(){'),app.indexOf('\nfunction liveTalkDock(){'));
if(liveUi.includes('Poseidon')||liveUi.includes('Athena')||liveUi.includes('Helen'))throw new Error('Live Talk UI must not pin a deity name while the orb can change');
if(/Open in Zeus|Open in Olympus/.test(app))throw new Error('Project UI regressed to Home launcher buttons');
if(!css.includes('.projects-page .page-head{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:stretch}')||!css.includes('.projects-page .page-head .primary{width:100%;min-height:46px'))throw new Error('New project button must be full-width and tappable on phones');
if(!css.includes('.projects-page .page-head .primary{box-sizing:border-box;max-width:100%;white-space:normal;line-height:1.2;overflow-wrap:anywhere}'))throw new Error('New project button text must wrap inside the mobile button');
if(!app.includes("id=\"create-project\">${icon('plus')} New project"))throw new Error('Projects page must retain the create-project action');
for(const god of ['Athena','Hefesto','Apollo','Dionísio','Peitho','Deméter','Hermes','Hades'])if(!toolCatalog.includes(`god:'${god}'`))throw new Error(`Current tool catalog is missing canonical deity ${god}`);
if(!toolCatalog.includes("data-tool-start=\"${action.kind}\"")||!toolCatalog.includes("data-tab=\"${action.tab}\"")||!toolCatalog.includes('Capacidades internas, sem Realm próprio: Héstia (revisão) e Mnemosine (memória)'))throw new Error('Canonical catalog actions or internal-capability labels are missing');
if(toolCatalog.includes("id:'hestia'")||toolCatalog.includes("id:'mnemosine'"))throw new Error('Internal capabilities must not appear as independent deity Realms');
console.log('OH-004.3.x UI regression tests: PASS');

if(!app.includes("activeMode:null"))throw new Error('execution mode state must not pin old chats to Zeus');
if(!app.includes('syncActiveModeFromMessages'))throw new Error('loaded chats must restore their actual last execution mode');
