import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync('public/app.js','utf8');
const html=readFileSync('public/index.html','utf8');
const css=readFileSync('public/styles.css','utf8')+readFileSync('public/ui-premium.css','utf8');
const toml=readFileSync('netlify.toml','utf8');
const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const transcribe=readFileSync('netlify/functions/transcribe.mjs','utf8');
const files=readFileSync('netlify/functions/files.mjs','utf8');

// Access contract stays v3 + localStorage (user decision).
assert.ok(app.includes("const accessStoreKey='olyhub.zeusproxy.access.v3'"),'v3 access key missing');
assert.ok(app.includes('localStorage.setItem(accessStoreKey'),'access key must persist to localStorage');

// Document head + boot shell.
for(const needle of ['name="description"','name="robots" content="noindex, nofollow"','name="color-scheme" content="dark"','property="og:title"','name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"','rel="apple-touch-icon"','rel="manifest"'])
  assert.ok(html.includes(needle),`index.html missing ${needle}`);
assert.ok(html.includes('class="skip-link" href="#main-content"'),'skip link missing');
assert.ok(html.includes('id="a11y-status"')&&html.includes('aria-live="polite"'),'live region missing');
assert.ok(html.includes('<noscript>'),'noscript fallback missing');
assert.ok(/<script type="module" src="\/app\.js\?rev=[^"]+"><\/script>/.test(html),'module script missing');
assert.ok(manifest.id==='/'&&manifest.display==='standalone'&&manifest.icons?.length,'manifest incomplete');

// Landmarks and ARIA state.
assert.ok(app.includes('<main class="main" id="main-content" tabindex="-1">'),'main landmark missing');
assert.ok(app.includes('<nav class="side-nav" aria-label="Primary">'),'primary nav landmark missing');
assert.ok(app.includes('aria-controls="app-sidebar" aria-expanded="${state.drawer}"'),'menu button must expose expanded state');
assert.ok(app.includes(`\${state.tab===label?'aria-current="page"':''}`),'active nav must expose aria-current');
assert.ok(app.includes('aria-haspopup="menu" aria-expanded="${state.attachMenu}"'),'+ menu must expose expanded state');
assert.ok(app.includes('role="menuitem" id="attach-media"')&&app.includes('role="menuitem" id="attach-camera"'),'attachment menu items need menuitem role');
assert.ok(app.includes('<label for="auth-key">'),'auth key label must be associated');
assert.ok(app.includes('aria-label="Search chats"'),'chat search needs a label');
assert.ok(app.includes('aria-label="Task title"')&&app.includes('aria-label="New project memory"'),'task/memory inputs need labels');
assert.ok(app.includes('aria-label="Remove ${esc(f.filename)}"'),'attachment remove button needs a label');

// Keyboard + focus.
assert.ok(app.includes('function focusKey(el)')&&app.includes('next.focus({preventScroll:true})'),'focus must be restored across renders');
assert.ok(app.includes("if(e.key!=='Escape'||$('#modal-root')?.childElementCount)return;"),'Escape handling for menu/drawer missing');
assert.ok(app.includes("if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))"),'Ctrl/Cmd+Enter send shortcut missing');
assert.ok(!app.includes("e.key==='Enter'&&!e.shiftKey"),'plain Enter must still insert a newline');
assert.ok(css.includes(':focus-visible{outline:2px solid'),'global focus-visible ring missing');
assert.ok(css.includes('prefers-reduced-motion:reduce'),'reduced-motion support missing');

// Resilience.
assert.ok(app.includes('state.draft=composerText.value')&&app.includes('${esc(state.draft)}</textarea>'),'composer draft must survive re-render');
assert.ok(app.includes("You are offline. Reconnect and try again.")&&app.includes('Connection to Zeus ended before the server returned an HTTP response.'),'friendly network errors missing');
assert.ok(app.includes("document.documentElement.classList.toggle('is-busy',busy)"),'busy indicator missing');
assert.ok(app.includes("window.addEventListener('offline'"),'offline detection missing');
assert.ok(app.includes('function errorBanner(')&&app.includes('data-dismiss-error'),'dismissible error banner missing');
for(const view of ['toolsView','filesView','settingsView']){
  const body=app.slice(app.indexOf(`function ${view}(`),app.indexOf('\nfunction',app.indexOf(`function ${view}(`)+1));
  assert.ok(body.includes("errorBanner('page-alert')"),`${view} must surface load errors`);
}
assert.ok(app.includes('if(state.execStatus===shown&&!state.sending)'),'upload status timer must not wipe newer status');

// Dead code stays gone; current UX decisions preserved.
assert.ok(!app.includes('function bottomNav(')&&!css.includes('.bottom-nav'),'dead bottom nav returned');
assert.ok(!app.includes('id="chats-menu"')&&!app.includes('id="new-chat-top"'),'hidden dead buttons returned');
assert.ok(app.includes("${icon('menu')}</button>"),'☰ navigation must remain');

// Contrast: no known sub-AA grey text colours.
for(const low of ['#66707d','#5a5a66','#525c69','#4f5965','#5e6875']) assert.ok(!new RegExp(`(?<![-\\w])color:\\s*${low}\\b`,'i').test(css),`low-contrast text colour ${low} returned`);

// Responsive: Project chat must stack to one column on tablets/phones (cascade regression).
const lastStack=css.lastIndexOf('.project-chat-layout{grid-template-columns:minmax(0,1fr)}');
assert.ok(lastStack>css.lastIndexOf('.project-chat-layout{grid-template-columns:minmax(0,1.75fr)'),'mobile Project chat stacking rule must come after the desktop two-column rule');

// Security headers and function hardening.
for(const header of ['Content-Security-Policy','Strict-Transport-Security','Cross-Origin-Opener-Policy','X-Content-Type-Options','Referrer-Policy','Permissions-Policy'])
  assert.ok(toml.includes(header),`${header} header missing`);
assert.ok(/script-src 'self';/.test(toml),'CSP must keep script-src self only');
assert.ok(transcribe.includes("'TRANSCRIBE_RUNTIME_FAILURE'")&&transcribe.includes("'INVALID_AUDIO_UPLOAD'"),'transcribe error hardening missing');
assert.ok(files.includes("'INVALID_UPLOAD'"),'files malformed-upload handling missing');

// Dependency hygiene.
assert.equal(pkg.overrides?.exceljs?.uuid,'11.1.1','exceljs uuid override missing');
assert.ok(!lock.packages['node_modules/exceljs/node_modules/uuid'],'deprecated nested uuid@8 returned to the lockfile');

console.log('OH-004.4 accessibility/resilience/security polish tests: PASS');

assert.ok(app.includes('function syncActiveModeFromMessages()'),'loaded conversations must restore the mode shown in the header');
assert.ok(app.includes("document.visibilityState==='hidden'"),'background Olympus polling must slow down while the app is hidden');
