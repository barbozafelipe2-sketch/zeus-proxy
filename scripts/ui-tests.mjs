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
  [app,'id="zeus-level-cap"','Zeus 1/2/3 level selector'],
  [app,'id="olympus-auto"','automatic Olympus control'],
  [app,"['Projects','projects','Projects']",'Projects navigation label with compatible Projects state'],
  [app,'role="button" aria-label="Open project','keyboard-accessible project cards'],
  [app,'aria-label="Delete this memory"','memory action label'],
  [app,'aria-disabled="true"','truthful disabled tools'],
];
for(const [haystack,needle,label] of must){if(typeof haystack==='boolean'){if(haystack!==needle)throw new Error(`Missing ${label}`)}else if(!String(haystack).includes(needle))throw new Error(`Missing ${label}`)}
if(/Open in Zeus|Open in Olympus/.test(app))throw new Error('Project UI regressed to Home launcher buttons');
if(!css.includes('.projects-page .page-head{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:stretch}')||!css.includes('.projects-page .page-head .primary{width:100%;min-height:46px'))throw new Error('New project button must be full-width and tappable on phones');
console.log('OH-004.3.x UI regression tests: PASS');

if(!app.includes("activeMode:null"))throw new Error('execution mode state must not pin old chats to Zeus');
if(!app.includes('syncActiveModeFromMessages'))throw new Error('loaded chats must restore their actual last execution mode');
