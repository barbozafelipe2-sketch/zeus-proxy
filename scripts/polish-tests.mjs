import { readFileSync, existsSync } from 'node:fs';
const read=(f)=>readFileSync(f,'utf8');
const app=read('public/app.js');
const css=read('public/ui-premium.css');
const models=read('netlify/functions/_shared/models.mjs');
const chat=read('netlify/functions/chat.mjs');
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));
const checks=[
  [app.includes('ONE AI ENVIRONMENT. REAL RESULTS.'),'polished home promise'],
  [!app.includes('Deep research & analysis.'),'no fake deep-research copy'],
  [app.includes('Multi-specialist synthesis'),'truthful Olympus copy'],
  [app.includes('system-indicator ${tone}'),'runtime-aware topbar state'],
  [app.includes('composer-meta'),'composer persistence/help copy'],
  [css.includes('OH-004.3.4 — final product polish'),'final polish CSS layer'],
  [models.includes('Never imply current-web research occurred unless retrieval results are explicitly present'),'source/retrieval honesty'],
  [models.includes('never claim tests were executed unless OlyHub actually executed them'),'test-execution honesty'],
  [chat.includes('queryAwareExcerpt'),'query-aware long-document excerpts'],
  [existsSync('scripts/smoke-live.mjs'),'executable live smoke harness'],
  [pkg.scripts?.['smoke:live']==='node scripts/smoke-live.mjs','live smoke npm script'],
  [pkg.packageManager==='npm@10.9.2','npm toolchain pin'],
  [existsSync('package-lock.json'),'real package lock included'],
  [lock.lockfileVersion===3 && lock.name===pkg.name && lock.version===pkg.version,'lock metadata matches package'],
  [JSON.stringify(Object.fromEntries(Object.entries(lock.packages?.['']?.dependencies||{}).sort()))===JSON.stringify(Object.fromEntries(Object.entries(pkg.dependencies||{}).sort())),'lock root dependencies match package manifest'],
  [existsSync('.github/workflows/verify.yml'),'GitHub verification workflow'],
  [existsSync('.github/workflows/smoke-live.yml'),'manual production smoke workflow'],
];
for(const [ok,label] of checks)if(!ok)throw new Error(`Polish invariant failed: ${label}`);
console.log('OH-004.3.4 polish/product-positioning tests: PASS');
