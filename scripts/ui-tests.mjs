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
  [app,'class="auth-proof"','auth capability proof'],
  [app,'class="topbar-context"','workspace context header'],
  [app,'role="button" aria-label="Open project','keyboard-accessible project cards'],
  [app,'aria-label="Delete this memory"','memory action label'],
  [app,'aria-disabled="true"','truthful disabled tools'],
];
for(const [haystack,needle,label] of must){if(typeof haystack==='boolean'){if(haystack!==needle)throw new Error(`Missing ${label}`)}else if(!String(haystack).includes(needle))throw new Error(`Missing ${label}`)}
if(/Open in Zeus|Open in Olympus/.test(app))throw new Error('Project UI regressed to Home launcher buttons');
console.log('OH-004.3.x UI regression tests: PASS');
