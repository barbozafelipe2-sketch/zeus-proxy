import { readFileSync } from 'node:fs';

const app=readFileSync('public/app.js','utf8');
const css=readFileSync('public/ui-premium.css','utf8');
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
  [app,'${modeStrip()}','shared chat mode controls'],
  [app,"['Projects','projects','Projects']",'Projects navigation label with compatible Projects state'],
  [app,'class="proj-card-main" data-project="${esc(p.id)}" aria-label="Abrir projeto','keyboard-accessible native project card button'],
  [app,'aria-label="Delete this memory"','memory action label'],
  [app,'aria-disabled="true"','truthful disabled tools'],
];
for(const [haystack,needle,label] of must){if(typeof haystack==='boolean'){if(haystack!==needle)throw new Error(`Missing ${label}`)}else if(!String(haystack).includes(needle))throw new Error(`Missing ${label}`)}
if(app.includes('id="zeus-level-cap"')||app.includes('id="olympus-auto"')||!app.includes('data-routing-mode="AUTO"')||!app.includes('data-routing-mode="MANUAL"'))throw new Error('Automatic/manual routing controls are missing or expose a manual Zeus level selector');
if(!app.includes('Automatic lets the server choose Zeus L1–L3 or Olympus')||!app.includes('Trace Lab ·'))throw new Error('Automatic routing explanation or per-message Trace Lab is missing');
if(/Open in Zeus|Open in Olympus/.test(app))throw new Error('Project UI regressed to Home launcher buttons');
if(!css.includes('.projects-page .page-head{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:stretch}')||!css.includes('.projects-page .page-head .primary{width:100%;min-height:46px'))throw new Error('New project button must be full-width and tappable on phones');
if(!css.includes('.projects-page .page-head .primary{box-sizing:border-box;max-width:100%;white-space:normal;line-height:1.2;overflow-wrap:anywhere}'))throw new Error('New project button text must wrap inside the mobile button');
if(!app.includes("id=\"create-project\">${icon('plus')} New project"))throw new Error('Projects page must retain the create-project action');
console.log('OH-004.3.x UI regression tests: PASS');

if(!app.includes("activeMode:null"))throw new Error('execution mode state must not pin old chats to Zeus');
if(!app.includes('syncActiveModeFromMessages'))throw new Error('loaded chats must restore their actual last execution mode');
