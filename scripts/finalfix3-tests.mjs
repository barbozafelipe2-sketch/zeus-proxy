import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdfSafeText, wrapPdfText } from '../netlify/functions/_shared/pdf-layout.mjs';

const app=readFileSync('public/app.js','utf8');
const artifact=readFileSync('netlify/functions/_shared/artifact.mjs','utf8');
const tasks=readFileSync('netlify/functions/tasks.mjs','utf8');
const toml=readFileSync('netlify.toml','utf8');
const npmrc=readFileSync('.npmrc','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));

// Personal auth/session hardening: the private deployment uses a server-side
// token and keeps the user-entered access value only for the browser tab.
assert.ok(app.includes("const accessStoreKey='olyhub.zeusproxy.access.v2'"),'personal session store key missing');
assert.ok(app.includes('sessionStorage.setItem(accessStoreKey'),'private access key must use sessionStorage');
assert.ok(!app.includes('localStorage.setItem(accessStoreKey'),'private access key must not be written to localStorage');
assert.ok(toml.includes('Cache-Control = "no-store"'),'API responses should remain no-store at the CDN layer');

// PDF layout should use measured widths and degrade unsupported glyphs safely instead
// of throwing from a StandardFont encoder.
const fakeFont={
  encodeText(ch){if(ch==='😀'||ch==='漢')throw new Error('unsupported');return ch;},
  widthOfTextAtSize(text,size){return [...String(text)].length*size*0.5;},
};
const safe=pdfSafeText(fakeFont,'Olá — 😀 漢');
assert.equal(safe,"Olá - [emoji] ?");
const wrapped=wrapPdfText(fakeFont,'averyveryveryverylongtoken without overflow',10,45);
assert.ok(wrapped.length>1,'long PDF tokens must wrap by measured width');
assert.ok(wrapped.every(line=>fakeFont.widthOfTextAtSize(line,10)<=45),'wrapped PDF line exceeded max width');
assert.ok(artifact.includes("import { wrapPdfText } from './pdf-layout.mjs'"),'artifact generator is not using the safe PDF layout helper');
assert.ok(artifact.includes('font.widthOfTextAtSize')||readFileSync('netlify/functions/_shared/pdf-layout.mjs','utf8').includes('font.widthOfTextAtSize'),'measured PDF wrapping missing');

// Task UI must expose all three backend states instead of TODO <-> DONE only.
assert.ok(tasks.includes("['TODO','IN_PROGRESS','DONE']"),'task API must accept IN_PROGRESS');
assert.ok(app.includes("status==='TODO'?'IN_PROGRESS':status==='IN_PROGRESS'?'DONE':'TODO'"),'task UI must cycle TODO -> IN_PROGRESS -> DONE -> TODO');
assert.ok(app.includes("class=\"task-check ${status==='DONE'?'done':status==='IN_PROGRESS'?'in-progress':''}\""),'in-progress visual state missing');

// Dialog accessibility: semantic dialog, Escape, focus trap, and focus restoration.
assert.ok(app.includes("dialog.setAttribute('role','dialog')"),'modal role=dialog missing');
assert.ok(app.includes("dialog.setAttribute('aria-modal','true')"),'aria-modal missing');
assert.ok(app.includes("if(e.key==='Escape')"),'Escape-to-close missing');
assert.ok(app.includes("if(e.key!=='Tab')return"),'modal focus trap missing');
assert.ok(app.includes('modalReturnFocus'),'dialog focus restoration missing');
assert.ok(app.includes('aria-labelledby="project-modal-title"'),'new-project dialog label missing');
assert.ok(app.includes('aria-labelledby="project-edit-title"'),'edit-project dialog label missing');

// Reproducibility hardening. Direct dependencies are exact and the runtime major is pinned.
assert.ok(/^4\.3\./.test(pkg.version),'Final Fix 3 must remain in the 4.3.x product line');
assert.equal(pkg.dependencies['@netlify/blobs'],'10.0.0');
assert.equal(pkg.dependencies['@netlify/database'],'1.0.0');
for(const [name,version] of Object.entries(pkg.dependencies))assert.ok(!String(version).startsWith('^')&&!String(version).startsWith('~'),`${name} is not exactly pinned`);
assert.equal(pkg.engines?.node,'22.x');
assert.ok(npmrc.includes('save-exact=true')&&npmrc.includes('package-lock=true')&&npmrc.includes('engine-strict=true'),'npm reproducibility policy missing');

console.log('Final Fix 3/3 auth-PDF-task-dialog-deploy tests: PASS');
