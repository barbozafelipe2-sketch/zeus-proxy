Warning: truncated output (original token count: 48541)
Total output lines: 1818

import { renderMarkdown } from './markdown.js';
import { localizeInterface, translateInterfaceText } from './locale-pt.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const app = $('#app');

const state = {
  user:null, authReady:false, attachMenu:false,
  tab:'Home', mode:'ZEUS', olympusAuto:false, activeMode:null, activeLevel:null, drawer:false,
  conversations:[], currentConversation:null, messages:[], chatArtifacts:[], sending:false, execStatus:'', error:'', bootstrapFailures:[],
  attachedFiles:[], projects:[], projectFilter:'ALL', currentProject:null, tasks:[],
  files:[], artifacts:[], health:null, recording:false,
  projectSection:'CHAT', projectMemories:[], projectSources:[], memoryPolicy:null,
  messagePage:{hasMore:false,nextCursor:null}, filesPage:{scope:'global',hasMore:false,nextCursor:null}, artifactsPage:{scope:'global',hasMore:false,nextCursor:null}, chatRestore:null,
  voiceBusy:false, voiceRecorder:null, voiceStream:null, voiceChunks:[], voiceStopTimer:null, voiceBytes:0, voiceHitSizeLimit:false, voiceSubmitRequested:false,
  liveTalk:false, liveTalkStopRequested:false, liveMuted:false, livePersona:'ZEUS', liveFailureKind:null, liveAgentConversation:null, liveAgentConversationId:'', liveAgentPartial:'', liveTextDraft:'', liveTextStatus:'', liveAgentPermissionStream:null, liveAgentLogQueue:Promise.resolve(), liveAgentLoggedEvents:new Map(), liveGeneration:0, liveRetryCount:0, liveStage:'idle', liveLocale:'auto', voiceId:'marin', elevenLabsVoiceId:'', voiceStatus:null, voiceTesting:false, liveSpeechCache:null, voiceReplyAudio:null, liveAudioUrl:null, liveSpeechController:null, liveAudioUnlocked:false, liveSpeechUnlocked:false,
  messageFeedback:{}, messageAudioId:'', messageAudioBusyId:'', messageAudioUrl:null,
  voiceAvatar:'lightning', elevenLabsVoices:[], elevenLabsVoicesLoaded:false, elevenLabsVoicesLoading:false, elevenLabsVoicesError:'', elevenLabsVoicePageToken:'', elevenLabsVoiceHasMore:false,
  preferences:{personality:'balanced',instructions:''}, preferencesLoaded:false,
  googleSearchResults:{}, googleSearchQueries:{}, googleSearchBusy:null,
  draft:'', offline:typeof navigator!=='undefined'&&navigator.onLine===false,
  lastFailedText:'', lastFailedMessageId:null, lastFailedAttachments:[], lastFailedRequestId:null, lastFailedMode:null, lastFailedTurboApproval:null,lastFailedCompareType:null,compareType:null,
};
const privateBlobUrls=new Map();const PRIVATE_BLOB_CACHE_MAX=16;
function revokePrivateBlobUrls(){for(const entry of privateBlobUrls.values())try{URL.revokeObjectURL(entry?.url||entry)}catch{}privateBlobUrls.clear();}
function rememberPrivateBlob(key,url){if(privateBlobUrls.has(key)){const old=privateBlobUrls.get(key);try{URL.revokeObjectURL(old?.url||old)}catch{}privateBlobUrls.delete(key);}privateBlobUrls.set(key,{url,at:Date.now()});while(privateBlobUrls.size>PRIVATE_BLOB_CACHE_MAX){const first=privateBlobUrls.keys().next().value,old=privateBlobUrls.get(first);try{URL.revokeObjectURL(old?.url||old)}catch{}privateBlobUrls.delete(first);}}

const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSize = n => { n=Number(n||0); if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KB`; return `${(n/1048576).toFixed(1)} MB`; };
const fmtDate = v => { if(!v)return ''; const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined}); };
const fmtDateTime = v => { if(!v)return ''; const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'}); };
const resetViewport = () => requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
const initials = () => (state.user?.user_metadata?.full_name || state.user?.email || 'O').trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
async function bootAuth(){
  state.authReady=true;
  state.user={id:'zeus-personal-owner',user_metadata:{full_name:'Felipe'}};
  for(const key of ['olyhub.zeusproxy.access.v3','olyhub.zeusproxy.access.v2','olyhub.zeusproxy.access.session.v1']){
    try{localStorage.removeItem(key);sessionStorage.removeItem(key)}catch{}
  }
  render();
  try{await bootstrapApp();}catch(err){state.error=err.message||'Zeus could not load the workspace.';render();}
}

const LONG_REQUEST_DROP_MS=20000;
function apiError(message,status=0,code='',data=null){
  const error=new Error(message);error.status=status;error.code=code||'';error.data=data;return error;
}
async function api(path, options={}){
  const {requestId:optionRequestId,...fetchOptions}=options;
  const headers=new Headers(fetchOptions.headers||{});
  const apiRequestId=optionRequestId||crypto.randomUUID();
  headers.set('X-OlyHub-Request-ID',apiRequestId);
  if(fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
  let r;
  const startedAt=Date.now();
  setBusy(1);
  try{r=await fetch(path,{...fetchOptions,headers});}
  catch(networkError){
    if(networkError?.name==='AbortError')throw networkError;
    if(navigator.onLine===false)throw apiError('You are offline. Reconnect and try again.',0,'OFFLINE');
    const elapsed=Date.now()-startedAt;
    // A long request that drops is almost always the server's 60s function limit or iOS suspending the app, not the user's network.
    if(elapsed>=LONG_REQUEST_DROP_MS)throw apiError(`The connection closed after ${Math.round(elapsed/1000)}s while Zeus was still working — the request likely hit the server time limit, or the app went to the background. Tap Retry: a reply that finished will be recovered.`,0,'CONNECTION_INTERRUPTED');
    throw apiError('Connection to Zeus ended before the server returned an HTTP response. Your internet may still be fine; retry once, then check Runtime diagnostics if it repeats.',0,'NETWORK_ERROR');
  }finally{setBusy(-1);}
  const contentType=r.headers.get('content-type')||'';
  let data;
  try{data=contentType.includes('application/json')?await r.json():await r.text();}
  catch{data=null;if(r.ok)throw new Error('The server sent an unreadable response. Try again.');}
  if(!r.ok){
    const isJson=data&&typeof data==='object';
    let msg=isJson?(data.error||data.message||''):'';
    if(!isJson){
      // Non-JSON error bodies come from the platform (gateway timeout / function crash), never from Zeus itself.
      if([502,503,504].includes(r.status))msg=`Zeus's server timed out or stopped before replying (HTTP ${r.status}). Tap Retry: a reply that finished will be recovered.`;
      else if(typeof data==='string'&&data.trim()&&!/^\s*</.test(data))msg=data.slice(0,180);
    }
    const ref=isJson&&data.requestId?` · ref ${String(data.requestId).slice(0,18)}`:'';
    const code=isJson?data.code:'HTTP_ERROR';
    const friendly={AI_PROVIDER_AUTH:'AI Gateway/provider authentication failed for this runtime.',AI_PROVIDER_QUOTA:'AI Gateway credits or provider quota are exhausted.',AI_PROVIDER_RATE_LIMIT:'The selected AI provider is rate-limiting Zeus right now.',AI_MODEL_UNAVAILABLE:'A configured model is unavailable; Zeus could not complete fallback safely.',EXECUTION_DEADLINE:'The AI request exceeded Zeus’s execution budget before a provider completed it.',AI_PROVIDERS_FAILED:'No configured AI provider completed this request.',GITHUB_WRITE_NOT_CONFIGURED:'GitHub commit is not configured on the server yet.',GITHUB_AUTH_FAILED:'GitHub rejected the server credential. Update the GitHub token and try again.',GITHUB_WRITE_DENIED:'GitHub denied this commit. Check repository permission or branch protection.',GITHUB_SECRET_DETECTED:'The commit was blocked because a credential-like value was detected in the ZIP.',GITHUB_BRANCH_CONFLICT:'The target branch changed or rejected the safe non-force update.',GITHUB_CONFIRMATION_REQUIRED:'GitHub commit needs an explicit confirmation from this screen.',GITHUB_REPO_NOT_ALLOWED:'This repository is outside the configured allowlist.',TURBO_APPROVAL_REQUIRED:'Complex Turbo needs your approval before this higher-budget run starts.',AI_RATE_LIMIT:'Hourly execution limit reached (Olympus 3/h, Zeus 15/h by default). Wait for the window to reset.'}[code];
    throw apiError(`${friendly||msg||`Request failed (HTTP ${r.status}).`}${ref}`,r.status,code,isJson?data:null);
  }
  return data;
}

async function fetchPrivateBlob(url){
  const headers=new Headers();headers.set('X-OlyHub-Request-ID',crypto.randomUUID());
  const r=await fetch(url,{headers,cache:'no-store'});
  if(!r.ok){
    let data=null;try{data=await r.json()}catch{}
    throw apiError(data?.error||`Could not load private output (HTTP ${r.status}).`,r.status,data?.code||'PRIVATE_OUTPUT_FAILED',data);
  }
  return await r.blob();
}
async function privateObjectUrl(url){
  if(privateBlobUrls.has(url)){const entry=privateBlobUrls.get(url);privateBlobUrls.delete(url);privateBlobUrls.set(url,entry);return entry?.url||entry;}
  const blob=await fetchPrivateBlob(url),objectUrl=URL.createObjectURL(blob);rememberPrivateBlob(url,objectUrl);return objectUrl;
}
async function downloadPrivateOutput(url,filename='Zeus-Proxy-output'){
  const blob=await fetchPrivateBlob(url),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=objectUrl;a.download=filename||'Zeus-Proxy-output';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
}
async function openPrivateOutput(url,filename='Zeus Proxy output',mime='application/octet-stream'){
  const blob=await fetchPrivateBlob(url),objectUrl=URL.createObjectURL(blob),type=blob.type||mime||'application/octet-stream';
  let body;if(type.startsWith('image/'))body=`<img class="private-preview-image" src="${objectUrl}" alt="${esc(filename)}">`;else if(type==='application/pdf')body=`<iframe class="private-preview-frame" src="${objectUrl}" title="${esc(filename)}"></iframe>`;else if(type==='text/html'){
    const source=(await blob.text()).slice(0,240000);
    const lockedCsp=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
    body=`<p class="muted tiny">Isolated preview: scripts run inside a sandbox; network and parent-session access are blocked.</p><iframe class="private-preview-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${esc(filename)}" srcdoc="${esc(lockedCsp+source)}"></iframe>`;
  }else if(type.startsWith('text/')||type.includes('json')||type.includes('csv')){const text=await blob.text();body=`<pre class="private-preview-text">${esc(text.slice(0,240000))}${text.length>240000?'\n[preview truncated]':''}</pre>`;}else body=`<div class="private-preview-generic">${icon('files')}<strong>${esc(filename)}</strong><p>This file is private. Use Download to save it to your device.</p></div>`;
  showModal(`<div class="modal-backdrop private-preview-backdrop"><section class="modal private-preview-modal"><header class="private-preview-head"><button class="secondary compact" id="private-preview-close" type="button">← Back</button><strong>${esc(filename)}</strong><button class="secondary compact" id="private-preview-download" type="button">Download</button></header><div class="private-preview-body">${body}</div></section></div>`,{initialFocus:'#private-preview-close',onClose:()=>URL.revokeObjectURL(objectUrl)});
  $('#private-preview-close')?.addEventListener('click',()=>closeModal());
  $('#private-preview-download')?.addEventListener('click',()=>downloadPrivateOutput(url,filename).catch(e=>{state.error=e.message;closeModal();render();}));
}
async function hydratePrivateImages(){
  const nodes=$$('[data-private-image]');
  await Promise.allSettled(nodes.map(async node=>{const url=node.dataset.privateImage;if(!url||node.src)return;try{node.src=await privateObjectUrl(url);node.classList.add('loaded');}catch{node.closest('.artifact-thumb-wrap')?.classList.add('thumb-failed');}}));
}

let inflightRequests=0;
function setBusy(delta){
  inflightRequests=Math.max(0,inflightRequests+delta);
  const busy=inflightRequests>0;
  document.documentElement.classList.toggle('is-busy',busy);
  app?.setAttribute('aria-busy',String(busy));
}
let lastAnnouncement='';
function announce(text){
  const region=document.getElementById('a11y-status');const value=translateInterfaceText(String(text||'').trim());
  if(!region||!value||value===lastAnnouncement)return;
  lastAnnouncement=value;region.textContent=value;
}
function dismissError(){state.error='';state.bootstrapFailures=[];state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;state.lastFailedMode=null;state.lastFailedTurboApproval=null;render();}
function errorBanner(extraClass=''){
  if(!state.error)return '';
  const bootstrapNotice=state.bootstrapFailures.length>0;
  const message=bootstrapNotice?'Workspace services need to reconnect.':state.error;
  const details=bootstrapNotice?`<details class="service-failure-details"><summary>Show affected services</summary><ul>${state.bootstrapFailures.map(item=>`<li><strong>${esc(item.name)}</strong>${item.message?`: ${esc(item.message)}`:''}</li>`).join('')}</ul></details>`:'';
  return `<div class="chat-error ${extraClass}"><div class="error-copy"><span>${esc(message)}</span>${details}</div><div class="error-actions">${bootstrapNotice?`<button type="button" id="retry-services">Retry services</button>`:''}${state.lastFailedBudgetExecutionId?`<button type="button" id="approve-olympus-five">Approve +$5</button>`:''}${state.lastFailedText?`<button type="button" id="retry-last">Try again</button>`:''}<button type="button" class="error-dismiss" data-dismiss-error aria-label="Dismiss message">${icon('close')}</button></div></div>`;
}
async function bootstrapApp(){
  state.authReady=true;state.bootstrapFailures=[];state.error='';render();
  const jobs=[
    ['Conversations',loadConversations()],
    ['Projects',loadProjects()],
    ['Files',loadFiles()],
    ['Artifacts',loadArtifacts()],
    ['Runtime diagnostics',loadHealth()],
    ['Personalization',loadPreferences()],
  ];
  const settled=await Promise.allSettled(jobs.map(([,promise])=>promise));
  settled.forEach((result,index)=>{if(result.status==='rejected'){const name=jobs[index][0],message=String(result.reason?.message||'').slice(0,180);state.bootstrapFailures.push({name,message});console.warn(`OlyHub bootstrap ${name} failed`,result.reason);}});
  if(state.bootstrapFailures.length)state.error='Some workspace services did not load. Retry services to try again.';
  const params=new URLSearchParams(location.search); const pid=params.get('project'); const cid=params.get('conversation');
  if(pid && state.projects.some(p=>p.id===pid)){ await openProjectWorkspace(pid); return; }
  if(cid) await openConversation(cid,false);
  render();
}
async function loadConversations(){ const d=await api('/api/conversations');state.conversations=d.conversations||[]; }
async function loadProjects(){ const d=await api('/api/projects');state.projects=d.projects||[]; if(state.currentProject)state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||null; }
function mergeById(existing,incoming){const map=new Map((existing||[]).map(x=>[x.id,x]));for(const item of incoming||[])map.set(item.id,item);return [...map.values()];}
async function loadFiles(projectId=null,{append=false}={}){
  const scope=projectId||'global';const page=state.filesPage?.scope===scope?state.filesPage:{scope,hasMore:false,nextCursor:null};
  const qs=new URLSearchParams({limit:'60'});if(projectId)qs.set('projectId',projectId);if(append&&page.nextCursor)qs.set('before',page.nextCursor);
  const d=await api(`/api/files?${qs}`);const incoming=d.files||[];
  state.files=append?mergeById(state.files,incoming):incoming;state.filesPage={scope,hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
}
async function loadArtifacts(projectId=null,{append=false}={}){
  const scope=projectId||'global';const page=state.artifactsPage?.scope===scope?state.artifactsPage:{scope,hasMore:false,nextCursor:null};
  const qs=new URLSearchParams({limit:'60'});if(projectId)qs.set('projectId',projectId);if(append&&page.nextCursor)qs.set('before',page.nextCursor);
  const d=await api(`/api/artifacts?${qs}`);const incoming=d.artifacts||[];
  state.artifacts=append?mergeById(state.artifacts,incoming):incoming;state.artifactsPage={scope,hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
}
async function loadHealth(){ try{state.health=await api('/api/health');state.healthError=false;}catch(error){state.healthError=true;throw error;} }
async function loadTasks(projectId){ const d=await api(`/api/tasks?projectId=${encodeURIComponent(projectId)}`);state.tasks=d.tasks||[]; }
async function loadProjectSources(){
  if(!state.currentProject?.id){state.projectSources=[];return;}
  const d=await api(`/api/project-sources?projectId=${encodeURIComponent(state.currentProject.id)}`);
  state.projectSources=d.sources||[];
}
async function loadMemories(projectId){ if(!projectId){state.projectMemories=[];state.memoryPolicy=null;return;} const d=await api(`/api/memories?projectId=${encodeURIComponent(projectId)}`);state.projectMemories=d.memories||[];state.memoryPolicy=d.policy||null; }

function icon(name){
  const svg=(d,box='0 0 24 24')=>`<svg class="ico" viewBox="${box}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const map={
    menu:svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    home:svg('<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>'),
    projects:svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    tools:svg('<path d="M14.5 6.5 18 3l3 3-3.5 3.5M3 21l7.5-7.5M13 11l2.5-2.5"/><path d="M8 16l-3 5 5-3"/>'),
    files:svg('<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'),
    settings:svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4 6.2 17.8"/>'),
    plus:svg('<path d="M12 5v14M5 12h14"/>'),
    search:svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>'),
    chat:svg('<path d="M5 6h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3V7a1 1 0 0 1 1-1z"/>'),
    attach:svg('<path d="M8.5 12.5 14 7a3.5 3.5 0 1 1 5 5l-8 8a4.5 4.5 0 0 1-6.4-6.4l7.5-7.5"/>'),
    mic:svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>'),
    'mic-off':svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6M3 3l18 18"/>'),
    send:svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    image:svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.4"/><path d="m8 16 3-3 3 2 2-2 3 3"/>'),
    camera:svg('<path d="M7 7.5 8.5 5h7L17 7.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2z"/><circle cx="12" cy="13.5" r="3.2"/>'),
    doc:svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    chart:svg('<path d="M5 19V9M10 19V5M15 19v-7M20 19V8"/>'),
    globe:svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
    code:svg('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"/>'),
    auto:svg('<path d="M12 8v4l2.5 1.5"/><circle cx="12" cy="12" r="8"/>'),
    close:svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    back:svg('<path d="m15 18-6-6 6-6M9 12h12"/>'),
    check:svg('<path d="m5 12 5 5 9-10"/>'),
    like:svg('<path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3ZM7 10l5-7c2 0 3 1 2 4l-1 3h6a2 2 0 0 1 2 2l-1 6a2 2 0 0 1-2 2H7"/>'),
    dislike:svg('<path d="M7 14V4H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3ZM7 14l5 7c2 0 3-1 2-4l-1-3h6a2 2 0 0 0 2-2l-1-6a2 2 0 0 0-2-2H7"/>'),
    speaker:svg('<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11"/>'),
    pause:svg('<path d="M8 5v14M16 5v14"/>'),
    folder:svg('<path d="M4 7h6l2 2h8v10H4z"/>'),
    memory:svg('<rect x="5" y="7" width="14" height="10" rx="2"/><path d="M8 7V5M16 7V5M8 19v-2M16 19v-2"/>'),
  };
  return map[name]||svg('<circle cx="12" cy="12" r="2"/>');
}

function sidebar(){
  const recents=homeChats().slice(0,18).map(c=>`<button class="recent-item ${c.id===state.currentConversation?'active':''}" data-conv="${esc(c.id)}" title="${esc(c.title)}" ${c.id===state.currentConversation?'aria-current="true"':''}>${esc(c.title||'Conversation')}</button>`).join('') || `<div class="muted tiny" style="padding:8px 10px">Home chats appear here. Project chats stay inside each project.</div>`;
  return `<aside class="sidebar ${state.drawer?'open':''}" id="app-sidebar" aria-label="Workspace navigation">
    <button type="button" class="close-navigation" id="close-navigation" aria-label="Fechar navegação">${icon('close')}</button>
    <div class="logo-row"><div class="personal-bolt small">ϟ</div><div><div class="logo-word">OLYMPUS HUB</div><div class="logo-sub">PERSONAL · ZEUS</div></div></div>
    <button class="new-chat" id="new-chat">${icon('chat')} <span><strong>New chat</strong><small class="muted" style="display:block;margin-top:2px">Start a clean execution</small></span></button>
    <div class="search-box" role="search">${icon('search')}<input id="chat-search" type="search" placeholder="Search chats" aria-label="Search chats" autocomplete="off"></div>
    <nav class="side-nav" aria-label="Primary">${navButtons()}</nav>
    <div class="side-section"><div class="side-title">Recent chats</div><div class="recent-list" id="recent-list">${recents}<div class="muted tiny recent-empty hidden" id="recent-empty" style="padding:8px 10px">No chats match your search.</div></div></div>
    <div class="sidebar-foot"><div class="user-chip"><div class="avatar">${esc(initials())}</div><div style="min-width:0"><strong style="font-size:12px">${esc(state.user?.user_metadata?.full_name||state.user?.email||'Felipe')}</strong><div class="muted tiny">Personal workspace</div></div></div></div>
  </aside>${state.drawer?'<button class="scrim" id="scrim" aria-label="Close menu"></button>':''}`;
}
function navButtons(){
  const items=[['Home','home','Home'],['Projects','projects','Agents'],['Tools','tools','Tools'],['Files','files','Files'],['Settings','settings','Settings']];
  return items.map(([tab,ico,label])=>`<button data-tab="${tab}" class="${state.tab===tab?'active':''}" ${state.tab===tab?'aria-current="page"':''}>${icon(ico)}<span>${label}</span></button>`).join('');
}
function homeChats(){ return (state.conversations||[]).filter(c=>!c.project_id); }
function projectChats(){ return (state.conversations||[]).filter(c=>c.project_id); }
function managerAgentStrip(){
  const agents=(state.projects||[]).filter(p=>p.status!=='COMPLETED');
  const chips=agents.slice(0,6).map(p=>`<button type="button" class="manager-agent-chip" data-project="${esc(p.id)}" aria-label="Open agent ${esc(p.name)}"><span class="manager-agent-mark" aria-hidden="true">${esc((p.name||'A').trim().slice(0,1).toUpperCase())}</span><span class="manager-agent-copy"><strong>${esc(p.name)}</strong><small>${Number(p.progress||0)}% · ${Number(p.task_count||0)} open tasks</small></span><span class="manager-agent-status" aria-hidden="true"></span></button>`).join('');
  return `<section class="manager-panel" aria-labelledby="manager-title"><div class="manager-panel-head"><div><div class="eyebrow">WORKSPACE MANAGER</div><h1 id="manager-title">Manager</h1><p>Choose an agent to continue its dedicated work.</p></div><button type="button" class="secondary compact" id="create-project">＋ New agent</button></div><div class="manager-agent-strip" aria-label="Your agents">${chips||`<div class="manager-empty">No agents yet. Create one to give a workstream its own chat, memory and files.</div>`}<button type="button" class="manager-all-agents" data-tab="Projects">All agents <span aria-hidden="true">›</span></button></div></section>`;
}
function homeAgentPanel(){
  const agents=(state.projects||[]).filter(p=>p.status!=='COMPLETED').slice(0,10);
  return `<aside class="home-agent-rail" aria-label="Workspace agents"><div class="home-rail-heading"><div><span class="eyebrow">WORKSPACE</span><h2>Agents</h2></div><span class="home-count">${agents.length}</span><button type="button" class="home-see-agents" data-tab="Projects">View all <span aria-hidden="true">›</span></button></div><button type="button" class="home-agent-search" data-tab="Projects">${icon('search')}<span>Browse agents</span><span aria-hidden="true">⌕</span></button><div class="home-agent-list">${agents.length?agents.map(p=>`<button type="button" class="home-agent-card" data-project="${esc(p.id)}"><span class="home-agent-avatar">${esc((p.name||'A').trim().slice(0,1).toUpperCase())}</span><span class="home-agent-info"><strong>${esc(p.name)}</strong><small>${Number(p.progress||0)}% progress · ${Number(p.task_count||0)} tasks</small></span><span class="home-agent-indicator" aria-hidden="true"></span></button>`).join(''):`<div class="home-rail-empty">No agents yet. Create a project to give a workstream its own chat and memory.</div>`}</div><button type="button" class="home-create-agent" id="home-create-project"><span aria-hidden="true">＋</span><span><strong>Create agent</strong><small>Start a dedicated workstream</small></span></button></aside>`;
}
function homeContextPanel(){
  const artifacts=[...(state.artifacts||[])].filter(a=>!a.project_id).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,4);
  const memories=(state.projects||[]).filter(p=>Number(p.memory_count||0)>0).slice(0,5);
  return `<aside class="home-context-rail" aria-label="Workspace context"><section class="home-context-section"><div class="home-rail-heading"><div><span class="eyebrow">WORKSPACE</span><h2>Artifacts</h2></div><button type="button" class="home-view-link" data-tab="Files">View all <span aria-hidden="true">›</span></button></div><div class="home-artifact-list">${artifacts.length?artifacts.map(a=>`<button type="button" class="home-artifact-card" data-open-output="${esc(a.downloadUrl||'')}" data-output-name="${esc(a.filename||'Saved artifact')}" data-output-mime="${esc(a.mime_type||a.type||'application/octet-stream')}" ${a.downloadUrl?'':'disabled'}><span class="home-artifact-icon">${icon('doc')}</span><span class="home-artifact-copy"><strong>${esc(a.filename||'Saved artifact')}</strong><small>${esc(String(a.type||a.mime_type||'FILE').toUpperCase())} · ${fmtDateTime(a.created_at)||'Saved'}</small></span><span class="home-artifact-chevron" aria-hidden="true">›</span></button>`).join(''):`<div class="home-rail-empty">Saved outputs will appear here.</div>`}</div></section><section class="home-context-section home-memory-section"><div class="home-rail-heading"><div><span class="eyebrow">PERSISTENT CONTEXT</span><h2>Project memory</h2></div><span class="home-memory-mark">${icon('memory')}</span></div>${memories.length?`<div class="home-memory-list">${memories.map(p=>`<button type="button" class="home-memory-card" data-project="${esc(p.id)}"><span class="home-memory-copy"><strong>${esc(p.name)}</strong><small>${Number(p.memory_count||0)} saved ${Number(p.memory_count||0)===1?'memory':'memories'}</small></span><span aria-hidden="true">›</span></button>`).join('')}</div>`:`<div class="home-rail-empty">Memory stays with each project. Open an agent to review its saved context.</div>`}</section></aside>`;
}
function homeMobileArtifacts(){
  const artifacts=[...(state.artifacts||[])].filter(a=>!a.project_id).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,8);
  return `<section class="home-mobile-artifacts" aria-labelledby="mobile-artifacts-title"><div class="mobile-artifacts-heading"><div><span class="eyebrow">SAVED OUTPUTS</span><h2 id="mobile-artifacts-title">Artifacts</h2></div><button type="button" data-tab="Files">See all <span aria-hidden="true">›</span></button></div>${artifacts.length?`<div class="mobile-artifact-track">${artifacts.map(a=>{const image=String(a.mime_type||'').startsWith('image/');return `<button type="button" class="mobile-artifact-card" data-open-output="${esc(a.downloadUrl||'')}" data-output-name="${esc(a.filename||'Saved artifact')}" data-output-mime="${esc(a.mime_type||a.type||'application/octet-stream')}" ${a.downloadUrl?'':'disabled'}>${image?`<img data-private-image="${esc(a.downloadUrl||'')}" alt="">`:`<span class="mobile-artifact-glyph">${esc(String(a.type||'FILE').toUpperCase().slice(0,4))}</span>`}<span class="mobile-artifact-name">${esc(a.filename||'Saved artifact')}</span></button>`}).join('')}</div>`:`<div class="mobile-artifacts-empty">Saved outputs from this chat will appear here.</div>`}</section>`;
}
function topbar(){
  const context=state.currentProject?.name||(state.tab==='Home'?(state.currentConversation?'Conversation':'Home'):state.tab);
  const hasHealth=Boolean(state.health);
  const chatReady=Boolean(state.health?.capabilities?.chat);
  const status=state.offline?'OFFLINE':chatReady?'READY':(hasHealth||state.healthError)?'LIMITED':'SYNCING';
  const tone=state.offline?'offline':chatReady?'ready':(hasHealth||state.healthError)?'limited':'syncing';
  const title=state.offline?'You are offline. Changes will fail until the connection returns.':state.healthError&&!hasHealth?'Runtime diagnostics did not load. Refresh to retry.':chatReady?'AI runtime and workspace services are available.':hasHealth?'Workspace loaded, but AI runtime is not fully available.':'Checking workspace runtime…';
  return `<header class="topbar">
    <button class="hamburger personal-more" aria-controls="app-sidebar" aria-expanded="${state.drawer}" id="hamburger" aria-label="Open navigation" title="Navigation">${icon('menu')}</button>
    <div class="topbar-context" aria-label="Current workspace"><span>${esc(state.currentProject?'PROJECT':'WORKSPACE')}</span><strong ${!state.currentProject&&!(state.tab==='Home'&&state.currentConversation)?'data-ui-label':''}>${esc(context)}</strong></div>
    <div class="brand-center"><div class="personal-bolt small">ϟ</div><div class="brand-copy"><span class="logo-word">OLYMPUS HUB</span><span class="logo-sub">PERSONAL · ZEUS</span></div></div>
    <div class="topbar-actions"><span class="system-indicator ${tone}" title="${esc(title)}" role="status" aria-label="${esc(`${status}: ${title}`)}"><i aria-hidden="true"></i>${status}</span><button class="avatar ghost" id="profile-avatar" aria-label="Open account settings">${esc(initials())}</button></div>
  </header>`;
}

function lastReply(messages=state.messages){return [...(messages||[])].reverse().find(m=>m.role==='assistant'&&(m.mode==='OLYMPUS'||m.mode==='ZEUS'))||null;}
function lastReplyMode(messages=state.messages){return lastReply(messages)?.mode||null;}
function syncActiveModeFromMessages(){const last=lastReply();state.activeMode=last?.mode||null;state.activeLevel=last?.metadata?.executionLevel||null;}
function liveMode(){return state.mode==='OLYMPUS'?'OLYMPUS':'ZEUS';}
function autoModeKey(){return 'zeus.olympusAuto.v1.'+(state.user?.id||'anonymous');}
function automaticOlympus(){try{return localStorage.getItem(autoModeKey())==='true';}catch{return state.olympusAuto===true;}}
function selectedZeusLevelCap(){try{const n=Number(localStorage.getItem('zeus.maxLevel.v1')||3);return [1,2,3].includes(n)?n:3;}catch{return 3;}}
function modeStrip(){
  const selected=liveMode();
  return `<div class="mode-select-wrap"><div class="mode-strip" role="group" aria-label="Intelligence mode">
    <button type="button" class="mode-card zeus ${selected==='ZEUS'?'selected':''}" data-mode="ZEUS" aria-pressed="${selected==='ZEUS'}" ${state.sending?'disabled':''}><div class="mode-icon">${icon('auto')}</div><div><strong>Zeus</strong></div></button>
    <button type="button" class="mode-card olympus ${selected==='OLYMPUS'?'selected':''}" data-mode="OLYMPUS" aria-pressed="${selected==='OLYMPUS'}" ${state.sending?'disabled':''}><div class="mode-icon">${icon('globe')}</div><div><strong>Olympus</strong></div></button>
  </div></div>`;
}

function homeView(){
  const isEmpty=!state.messages.length;
  const msgs=state.messages.map(m=>messageHtml(m)).join('');
  const exec=state.execStatus?`<div class="exec-card live" aria-hidden="true"><div class="exec-head"><span class="exec-pulse"></span><div><strong>${esc(state.execTitle||'Zeus is working')}</strong><div class="muted tiny">${esc(state.execStatus)}</div></div></div><div class="exec-foot">Live execution status — no simulated timings.</div></div>`:'';
  return `<section class="page chat-page home-workspace">
    <div class="home-chat-column">
    ${modeStrip()}
    <div class="chat-scroll" id="chat-scroll">
      ${isEmpty?`<div class="welcome"><div class="eyebrow">${state.currentProject?esc(state.currentProject.name):'ONE AI ENVIRONMENT. REAL RESULTS.'}</div><h1>Turn the request into a result.</h1><p>Tell Zeus what you need. Your work stays saved in this conversation.</p><div class="quick-prompts"><button data-prompt="Analyze the attached file and ground every important claim in the source. Call out anything the source does not support.">Review a source</button><button data-prompt="Create the next professional deliverable for this work and keep it connected to the conversation.">Create a deliverable</button><button data-prompt="Build this as runnable code. Include focused tests and tell me clearly which tests were not actually executed.">Build with tests</button><button data-prompt="Turn this goal into a project plan with clear tasks, risks, and milestones.">Plan a project</button></div></div>`:`${state.messagePage?.hasMore?'<div class="history-more"><button class="secondary compact" id="load-older-messages">Load older messages</button></div>':''}<div class="message-list">${msgs}</div>`}
      ${exec}
      ${errorBanner()}
    </div>
    ${composer()}
    </div>
  </section>`;
}
function safeSources(m){
  const raw=Array.isArray(m?.metadata?.sources)?m.metadata.sources:Array.isArray(m?.sources)?m.sources:[];
  const out=[];const seen=new Set();
  for(const source of raw){
    try{const url=new URL(String(source?.url||''));if(!['http:','https:'].includes(url.protocol)||seen.has(url.href))continue;seen.add(url.href);out.push({url:url.href,title:String(source?.title||url.hostname).slice(0,300)});}catch{}
    if(out.length>=12)break;
  }
  return out;
}
function messageHtml(m){
  const artifacts=(m.artifacts||[]).map(artifactCard).join('');
  const compareArtifacts=(m.role==='assistant'&&m.metadata?.comparePair&&Array.isArray(m.artifacts)&&m.artifacts.length>=2)?m.artifacts.slice(0,2):[];
  const compareControls=compareArtifacts.length===2?`<div class="compare-pair-actions"><button type="button" data-compare-select="${esc(compareArtifacts[0].id)}" data-compare-type="${esc(m.metadata.compareType||compareArtifacts[0].type||'pdf')}">Choose A</button><button type="button" data-compare-select="${esc(compareArtifacts[1].id)}" data-compare-type="${esc(m.metadata.compareType||compareArtifacts[1].type||'pdf')}">Choose B</button><button type="button" data-compare-combine="${esc(compareArtifacts[0].id)}" data-compare-with="${esc(compareArtifacts[1].id)}" data-compare-type="${esc(m.metadata.compareType||compareArtifacts[0].type||'pdf')}">Combine into C</button><button type="button" data-compare-retry="${esc(m.execution_id||'')}" data-compare-type="${esc(m.metadata.compareType||compareArtifacts[0].type||'pdf')}">Try another pair</button></div>`:'';
  const attached=(m.attachments||[]).map(f=>`<span class="file-chip static">${icon('files')} ${esc(f.filename||f.name||'file')}</span>`).join('');
  const sources=safeSources(m);
  const sourceHtml=sources.length?`<div class="message-sources"><span>Sources</span><div>${sources.map((source,i)=>`<a href="${esc(source.url)}" target="_blank" rel="noreferrer noopener" title="${esc(source.title)}"><strong>${i+1}</strong><span>${esc(source.title)}</span></a>`).join('')}</div></div>`:'';
  const leadRaw=m.role==='assistant'&&m.metadata?.leadModel?String(m.metadata.leadModel):'';
  const lead=leadRaw.includes(':')?`${leadRaw.slice(0,leadRaw.indexOf(':'))} · ${leadRaw.slice(leadRaw.indexOf(':')+1)}`:leadRaw;
  const vision=m.metadata?.visionSummary,visionNote=vision?.skipped?`Vision ${Number(vision.analyzed||0)}/${Number(vision.attached||0)} images analyzed`:'';
  const capabilityNotes=(Array.isArray(m.metadata?.capabilities)?m.metadata.capabilities:[]).map(c=>c?.name==='github_repository'&&c?.status==='completed'?`GitHub ${Number(c.fileCount||0)}/${Number(c.treeEntries||0)} files sampled`:c?.name==='web_search'&&c?.status==='completed'?`Web ${Number(c.sourceCount||0)} sources`:c?.name==='google_gmail'&&c?.status==='completed'?`Gmail ${Number(c.itemCount||0)} messages`:c?.name==='google_calendar'&&c?.status==='completed'?`Calendar ${Number(c.itemCount||0)} events`:c?.name==='google_drive'&&c?.status==='completed'?`Drive ${Number(c.itemCount||0)} files`:null).filter(Boolean);
  const level=m.metadata?.executionLevel?String(m.metadata.executionLevel).replaceAll('_',' '):'';
  const phases=Array.isArray(m.metadata?.phases)?m.metadata.phases.slice(0,3):[];
  const phaseNote=phases.length?`Stages: ${phases.map(p=>`${String(p.label||'Stage')} ${String(p.state||'COMPLETED').toLowerCase()}${p.restored?' (resumed)':''}`).join(' → ')}`:'';
  const u=m.role==='assistant'&&m.metadata?.usage&&typeof m.metadata.usage==='object'?m.metadata.usage:null;
  // A missing provider field is unknown, not zero. Partial prices are *subtotals*
  // and can exclude web-search tool fees, failed calls and other unpriced usage.
  const fmt=(x)=>x===null||x===undefined||x===''?'unknown':Number(x).toLocaleString();
  const usd=(x)=>Number(x)>0&&Number(x)<0.000001?'less than US$0.000001':`US${Number(x).toFixed(6)}`;
  const costNote=u?.estimateCoverage==='full'&&u.estimatedUsd!=null
    ?`≈ ${usd(u.estimatedUsd)} estimated`
    :u?.estimatedUsd!=null
      ?`Known cost subtotal ≈ ${usd(u.estimatedUsd)}; actual cost unknown (unpriced models, usage or web fees)`
      :'Cost unknown (missing price, token usage or tool charges)';
  const usageNote=u?[`Calls ${fmt(u.callsUsed)}${u.maxCalls!=null?`/${fmt(u.maxCalls)}`:''}`,`Tokens in ${fmt(u.inputTokens)} · out ${fmt(u.outputTokens)} · total ${fmt(u.totalTokens)}`,...(Array.isArray(u.byRole)?u.byRole.slice(0,8).map(r=>`${String(r.role||'').replaceAll('_',' ')}: ${fmt(r.inputTokens)}/${fmt(r.outputTokens)}${r.outcome==='failure'?' (failed)':''}`):[]),costNote].join(' · '):'';
  const note=[level,m.metadata?.modeExplanation,m.metadata?.pipelineLabel,phaseNote,lead,m.metadata?.fallback?'fallback':'',m.metadata?.verificationLabel,visionNote,...capabilityNotes,usageNote].filter(Boolean).join(' · ');
  const speaker=m.role==='user'?'YOU':String(m.mode||'ZEUS').toUpperCase();
  const messageId=String(m.id||m.execution_id||'');
  const reaction=state.messageFeedback[messageId]||'';
  const activeMessageAudio=state.messageAudioId===messageId;
  const audioBusy=state.messageAudioBusyId===messageId;
  const messageActions=m.role==='assistant'&&messageId?`<div class="message-actions" aria-label="Rate or listen to this Zeus reply"><button type="button" class="message-action ${reaction==='up'?'selected':''}" data-message-feedback="up" data-message-id="${esc(messageId)}" aria-label="Approve this answer" aria-pressed="${reaction==='up'}" title="Useful"><span>${icon('like')}</span></button><button type="button" class="message-action ${reaction==='down'?'selected':''}" data-message-feedback="down" data-message-id="${esc(messageId)}" aria-label="Disapprove this answer" aria-pressed="${reaction==='down'}" title="Not useful"><span>${icon('dislike')}</span></button><button type="button" class="message-action message-speak ${activeMessageAudio?'selected':''}" data-message-speak="${esc(messageId)}" aria-label="${audioBusy?'Generating speech':activeMessageAudio?'Pause or resume reading':'Read answer aloud'}" title="${audioBusy?'Preparing voice…':activeMessageAudio?'Pause / resume':'Read aloud'}" ${audioBusy?'disabled':''}><span>${icon(audioBusy?'auto':activeMessageAudio&&state.messageAudioPlaying?'pause':'speaker')}</span></button>${audioBusy?'<span class="message-audio-status" role="status">Preparing voice…</span>':''}</div>`:'';
  return `<article class="message ${m.role==='user'?'user':'assistant'}"><div class="message-label">${m.role==='user'?'':`<span class="message-bolt" aria-hidden="true">⚡</span>`}<span>${esc(speaker)}</span></div><div class="message-body ${m.role==='assistant'?'markdown-body':''}">${m.role==='assistant'?renderMarkdown(m.content||''):esc(m.content||'')}</div>${messageActions}${note?`<details class="message-debug"><summary>Execution details</summary><div class="message-model">${esc(note)}</div></details>`:''}${sourceHtml}${attached?`<div class="attachments in-message">${attached}</div>`:''}${artifacts?`<div class="artifact-row">${artifacts}</div>`:''}${compareControls}</article>`;
}
function artifactCard(a){const tag=esc((a.type||'FILE').toUpperCase().slice(0,4)),url=esc(a.downloadUrl||''),name=esc(a.filename||'Zeus Proxy output'),mime=esc(a.mime_type||a.type||'application/octet-stream'),isImage=String(a.mime_type||'').startsWith('image/'),isZip=a.type==='zip'||/zip/i.test(a.mime_type||'')||String(a.filename||'').toLowerCase().endsWith('.zip'),git=Boolean(state.health?.capabilities?.githubCommit);return `<div class="artifact-card">${isImage?`<button type="button" class="artifact-thumb-wrap" data-open-output="${url}" data-output-name="${name}" data-output-mime="${mime}" aria-label="Open ${name}"><img class="artifact-thumb" data-private-image="${url}" alt=""></button>`:`<div class="out-badge">${tag}</div>`}<div><strong>${name}</strong><small>${fmtSize(a.size)} · ${mime}</small></div><div class="artifact-actions"><button type="button" data-open-output="${url}" data-output-name="${name}" data-output-mime="${mime}">Open</button><button type="button" class="ghost-a" data-download-output="${url}" data-output-name="${name}">Download</button>${isZip&&git?`<button type="button" class="ghost-a" data-github-commit="artifact" data-source-id="${esc(a.id)}" data-source-name="${name}">Commit</button>`:''}</div></div>`}
const LIVE_LOCALES={auto:'auto',pt:'pt-BR',en:'en-US',es:'es-ES'};
const VOICE_AVATARS=new Set(['lightning','classic','olympus','liquid']);
function initVoicePrefs(){
 try{const l=localStorage.getItem('zeus-live-locale');state.liveLocale=Object.prototype.hasOwnProperty.call(LIVE_LOCALES,l)?l:'auto';
 const persona=String(localStorage.getItem('zeus-live-persona')||'ZEUS').toUpperCase();state.livePersona=persona==='ATHENA'?'ATHENA':'ZEUS';
 const a=localStorage.getItem('zeus-voice-avatar');state.voiceAvatar=VOICE_AVATARS.has(a)?a:'lightning';
 const savedVoice=String(localStorage.getItem('zeus-voice-id')||'marin').toLowerCase();
 state.voiceId=['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar'].includes(savedVoice)?savedVoice:'marin';
 const customVoice=String(localStorage.getItem('zeus-elevenlabs-voice-id')||'').trim();state.elevenLabsVoiceId=/^[A-Za-z0-9_-]{2,120}$/.test(customVoice)?customVoice:'';}catch{}
 try{const saved=JSON.parse(localStorage.getItem('zeus-message-feedback.v1')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))state.messageFeedback=Object.fromEntries(Object.entries(saved).filter(([,v])=>v==='up'||v==='down').slice(-200));}catch{}
}
const ELEVENLABS_VOICE_PATTERN=/^[A-Za-z0-9_-]{2,120}$/;
const OPENAI_VOICE_NAMES=['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar'];
function storageGet(key){try{return localStorage.getItem(key)||''}catch{return ''}}
function storedElevenLabsVoiceId(){const v=storageGet('zeus-elevenlabs-voice-id').trim();return ELEVENLABS_VOICE_PATTERN.test(v)?v:'';}
function elevenLabsVoiceLabel(id){if(!id)return '';const voice=state.elevenLabsVoices.find(v=>v.voice_id===id);return voice?.name?`${voice.name} (${id})`:id;}
function setVoiceStatus(kind,text){state.voiceStatus={kind,text};announce(text);render();}
function persistVoicePrefs(openaiVoice,elevenLabsVoiceId){
  try{
    localStorage.setItem('zeus-voice-id',openaiVoice);
    if(elevenLabsVoiceId)localStorage.setItem('zeus-elevenlabs-voice-id',elevenLabsVoiceId);else localStorage.removeItem('zeus-elevenlabs-voice-id');
    return true;
  }catch{return false;}
}
function saveVoiceSettings({elevenLabsVoiceId,source='button'}={}){
  const openaiVoice=String($('#zeus-voice-preset')?.value||state.voiceId||'marin').toLowerCase();
  if(!OPENAI_VOICE_NAMES.includes(openaiVoice)){setVoiceStatus('error','Choose a supported OpenAI fallback voice.');return false;}
  const id=String(elevenLabsVoiceId||'').trim();
  if(id&&!ELEVENLABS_VOICE_PATTERN.test(id)){setVoiceStatus('error','Enter a valid ElevenLabs Voice ID (letters, numbers, hyphens, or underscores).');return false;}
  const stored=persistVoicePrefs(openaiVoice,id);
  state.voiceId=openaiVoice;state.elevenLabsVoiceId=id;state.error='';
  if(!stored)setVoiceStatus('error','Could not save the voice in this browser (storage is blocked). It only applies until you reload.');
  else setVoiceStatus('ok',id?`Voice saved: ${elevenLabsVoiceLabel(id)}`:'Voice removed.');
  return true;
}
function describeSpeechFailure(failure,status){
  const names={elevenlabs:'ElevenLabs',openai_gateway:'OpenAI TTS',gemini_gateway:'Gemini TTS'};
  const list=(Array.isArray(failure?.providerFailures)?failure.providerFailures:[]).filter(item=>names[item?.provider]&&Number.isInteger(Number(item?.status)));
  const part=item=>`${names[item.provider]} ${Number(item.status)}${item.detail?`: ${String(item.detail).slice(0,160)}`:''}`;
  const eleven=list.filter(item=>item.provider==='elevenlabs');
  const others=list.filter(item=>item.provider!=='elevenlabs');
  if(eleven.length){
    const backups=others.length?` Backup voices also failed (${others.map(part).join(', ')}).`:'';
    return `ElevenLabs voice failed — ${eleven.map(part).join(' → ')}.${backups}`.slice(0,420);
  }
  const base=String(failure?.error||`Voice providers are unavailable (HTTP ${status||'?'}).`).slice(0,240);
  return `${base}${others.length?` (${others.map(part).join(' → ')})`:''}`;
}
async function requestSpeechAudio(text,{elevenLabsVoiceId='',signal}={}){
  let res;
  try{
    res=await fetch('/api/speech',{method:'POST',headers:new Headers({'Content-Type':'application/json'}),signal,body:JSON.stringify({text,voiceId:state.voiceId||storageGet('zeus-voice-id')||'marin',elevenLabsVoiceId})});
  }catch(error){
    if(error?.name==='AbortError')throw error;
    const failed=new Error('Could not reach the voice service. Check your connection and try again.');failed.stage='fetch';throw failed;
  }
  if(!res.ok){
    const failure=await res.json().catch(()=>({}));
    const failed=new Error(describeSpeechFailure(failure,res.status));failed.stage='fetch';throw failed;
  }
  const blob=await res.blob();
  if(!blob.size){const failed=new Error('Voice provider returned empty audio.');failed.stage='fetch';throw failed;}
  return {blob,voiceFallback:res.headers.get('X-Zeus-Voice-Fallback')==='1'};
}
function setMessageFeedback(messageId,value){
  const next=state.messageFeedback[messageId]===value?'':value;
  if(next)state.messageFeedback[messageId]=next;else delete state.messageFeedback[messageId];
  try{localStorage.setItem('zeus-message-feedback.v1',JSON.stringify(Object.fromEntries(Object.entries(state.messageFeedback).slice(-200))));}catch{}
  render();
}
async function toggleMessageSpeech(messageId){
  const message=state.messages.find(item=>String(item.id||item.execution_id||'')===messageId&&item.role==='assistant');
  if(!message)return;
  if(state.liveTalk){state.error='Finish Live Talk before playing a separate reply aloud.';render();return;}
  const audio=state.voiceReplyAudio;
  if(state.messageAudioBusyId===messageId)return;
  if(state.messageAudioId===messageId&&audio){
    if(audio.paused){try{await audio.play();state.messageAudioPlaying=true;}catch(error){state.error=`Playback was blocked: ${error?.message||'tap the speaker again'}`;}}
    else{audio.pause();state.messageAudioPlaying=false;}
    render();return;
  }
  try{audio?.pause()}catch{}
  if(state.messageAudioUrl){URL.revokeObjectURL(state.messageAudioUrl);state.messageAudioUrl=null;}
  const replyAudio=audio||new Audio();state.voiceReplyAudio=replyAudio;
  state.messageAudioId='';state.messageAudioPlaying=false;state.messageAudioBusyId=messageId;state.error='';
  unlockLiveAudioFromGesture();render();
  try{
    const {blob}=await requestSpeechAudio(message.content||'',{elevenLabsVoiceId:state.elevenLabsVoiceId||storedElevenLabsVoiceId()});
    if(state.messageAudioBusyId!==messageId)return;
    state.messageAudioUrl=URL.createObjectURL(blob);replyAudio.src=state.messageAudioUrl;replyAudio.muted=false;replyAudio.volume=1;replyAudio.playsInline=true;
    replyAudio.onended=()=>{if(state.messageAudioId===messageId){state.messageAudioId='';state.messageAudioPlaying=false;if(state.messageAudioUrl)URL.revokeObjectURL(state.messageAudioUrl);state.messageAudioUrl=null;render();}};
    replyAudio.onerror=()=>{if(state.messageAudioId===messageId){state.messageAudioId='';state.messageAudioPlaying=false;state.error='Zeus voice audio could not be played. Try the speaker again.';render();}};
    state.messageAudioBusyId='';state.messageAudioId=messageI…23541 tokens truncated…EventListener('submit',async e=>{
    e.preventDefault();
    try{const d=await api('/api/conversations',{method:'PATCH',body:JSON.stringify({conversationId,projectId:$('#conversation-target-project').value,operation:'move'})});
      closeModal();await Promise.all([loadProjects(),loadConversations()]);await openConversation(d.conversationId);}
    catch(err){setModalError(err.message||'Transfer failed.');}
  });
}
async function openConversation(id,doRender=true){
  try{
    const d=await api(`/api/chat?conversationId=${encodeURIComponent(id)}&limit=60`);
    state.currentConversation=id;
    state.currentProject=state.projects.find(p=>p.id===d.conversation?.project_id)||null;
    if(state.currentProject){
      await hydrateProjectWorkspace(state.currentProject.id,{loadConversation:false});
    }else{
      await Promise.all([loadFiles(),loadArtifacts()]);
    }
    state.files=mergeById(state.files,d.files||[]);
    const fileIndex=Object.fromEntries((state.files||[]).map(f=>[f.id,f]));
    state.messages=(d.messages||[]).map(m=>({...m,
      artifacts:(m.metadata?.artifacts||[]).map(id=>(d.artifacts||[]).find(a=>a.id===id)).filter(Boolean),
      attachments:(m.metadata?.attachments||[]).map(fid=>(typeof fid==='object'?fid:fileIndex[fid]||{id:fid,filename:'Attached file'}))
    }));
    state.chatArtifacts=d.artifacts||[];
    state.artifacts=mergeById(state.artifacts,d.artifacts||[]);
    state.messagePage={hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
    syncActiveModeFromMessages();
    state.tab=state.currentProject?'Projects':'Home';state.drawer=false;
    history.replaceState({},'',state.currentProject?`/?project=${encodeURIComponent(state.currentProject.id)}`:`/?conversation=${encodeURIComponent(id)}`);
    if(doRender){render();resetViewport();}
  }catch(e){state.error=e.message;if(doRender)render();}
}
async function loadOlderMessages(){
  if(!state.currentConversation||!state.messagePage?.hasMore||!state.messagePage?.nextCursor)return;
  const scroll=$('#chat-scroll');const restore=scroll?{height:scroll.scrollHeight,top:scroll.scrollTop}:null;
  try{
    const d=await api(`/api/chat?conversationId=${encodeURIComponent(state.currentConversation)}&limit=60&before=${encodeURIComponent(state.messagePage.nextCursor)}`);
    state.files=mergeById(state.files,d.files||[]);
    state.chatArtifacts=mergeById(state.chatArtifacts,d.artifacts||[]);
    const fileIndex=Object.fromEntries((state.files||[]).map(f=>[f.id,f]));
    const artifactIndex=new Map((state.chatArtifacts||[]).map(a=>[a.id,a]));
    const incoming=(d.messages||[]).map(m=>({...m,
      artifacts:(m.metadata?.artifacts||[]).map(id=>artifactIndex.get(id)).filter(Boolean),
      attachments:(m.metadata?.attachments||[]).map(fid=>(typeof fid==='object'?fid:fileIndex[fid]||{id:fid,filename:'Attached file'}))
    }));
    const existing=new Set(state.messages.map(m=>m.id));
    state.messages=[...incoming.filter(m=>!existing.has(m.id)),...state.messages];
    state.messagePage={hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
    if(restore)state.chatRestore=restore;
    render();
  }catch(error){state.error=error.message||'Could not load older messages.';render();}
}
async function loadOlderOutputs(){
  const projectId=state.tab==='Projects'&&state.currentProject?.id?state.currentProject.id:null;
  try{
    await Promise.all([
      state.filesPage?.hasMore?loadFiles(projectId,{append:true}):Promise.resolve(),
      state.artifactsPage?.hasMore?loadArtifacts(projectId,{append:true}):Promise.resolve(),
    ]);
    render();
  }catch(error){state.error=error.message||'Could not load older files.';render();}
}

async function sendMessage(e){
  e.preventDefault();
  if(voiceCaptureActive()){
    state.voiceSubmitRequested=true;
    state.execStatus='Finishing audio, then sending…';render();
    stopVoiceRecording();
    return;
  }
  const text=$('#composer-text')?.value.trim()||'';
  if(!text||state.sending)return;
  await sendText(text,[...state.attachedFiles]);
}
async function sendVoiceTranscript(transcript){
  const typed=String($('#composer-text')?.value||state.draft||'').trim();
  state.draft='';
  await sendText([typed,String(transcript||'').trim()].filter(Boolean).join('\n\n'),[...state.attachedFiles]);
}
async function pollForReply(conversationId, executionId){
  const deadline=Date.now()+180000;let waitMs=1800,lastStatusPaint=0;
  while(Date.now()<deadline){
    const pause=document.visibilityState==='hidden'?Math.max(waitMs,5500):waitMs;
    await new Promise(r=>setTimeout(r,pause));
    try{
      const page=await api(`/api/chat?conversationId=${encodeURIComponent(conversationId)}&limit=30`);
      const assistant=(page.messages||[]).find(m=>m.role==='assistant'&&m.execution_id===executionId);
      if(assistant){
        const ids=new Set(Array.isArray(assistant.metadata?.artifacts)?assistant.metadata.artifacts:[]);
        const artifacts=(page.artifacts||[]).filter(a=>ids.has(a.id));
        return {page,assistant:{...assistant,artifacts}};
      }
      const userRow=(page.messages||[]).find(m=>m.role==='user'&&m.execution_id===executionId);
      if(userRow?.metadata?.failed){const code=userRow.metadata.errorCode||'AI_EXECUTION_FAILED';throw apiError(code==='OLYMPUS_APPROVAL_REQUIRED'?'Olympus needs explicitly authorized extra $5.':'Olympus could not finish. Tap Retry.',code==='OLYMPUS_APPROVAL_REQUIRED'?402:503,code,{executionId});}
      if(Date.now()-lastStatusPaint>12000){state.execStatus='Olympus is still writing one answer…';lastStatusPaint=Date.now();render();}
    }catch(error){
      if(error?.code==='AI_EXECUTION_FAILED'||error?.status===401)throw error;
      if(!([0,502,503,504].includes(Number(error?.status||0))||error?.code==='CONNECTION_INTERRUPTED'))throw error;
      if(Date.now()-lastStatusPaint>12000){state.execStatus='Olympus is still working · reconnecting to its result…';lastStatusPaint=Date.now();render();}
    }
    waitMs=Math.min(5500,Math.round(waitMs*1.35));
  }
  throw apiError('Olympus is still working. Wait a moment, then tap Retry to collect the reply.',503,'REQUEST_IN_PROGRESS');
}
async function sendText(text,pendingAttachments=[],requestId=crypto.randomUUID(),requestedMode=state.mode,turboApproval=null,resumeExecutionId=null,options={}){
  if(!text||state.sending)return;
  const pending=[...(pendingAttachments||[])],liveTalkTurn=options?.liveTalk===true,mode=liveTalkTurn?'ZEUS':requestedMode==='OLYMPUS'?'OLYMPUS':'ZEUS',compareType=liveTalkTurn?null:state.compareType;
  const optimistic={id:crypto.randomUUID(),role:'user',mode,content:text,artifacts:[],attachments:pending};
  state.messages.push(optimistic);
  state.attachedFiles=[];state.draft='';
  state.sending=true;state.activeMode=mode;state.activeLevel=null;state.error='';state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;state.lastFailedMode=null;state.lastFailedTurboApproval=null;state.lastFailedCompareType=null;
  state.execTitle=mode==='OLYMPUS'?'Olympus is working':'Zeus is working';
  state.execStatus=liveTalkTurn?'Preparing a quick spoken reply…':'Choosing the model for this request…';render();
  const timer=setTimeout(()=>{
    if(!state.sending)return;
    state.execStatus=state.activeMode==='OLYMPUS'?'Olympus is drafting, then writing one answer…':'Running the selected model…';render();
  },1400);
  try{
    const payload={
      conversationId:state.currentConversation,
      projectId:state.currentProject?.id||null,
      content:text,
      fileIds:pending.map(f=>f.id),
      olympusAuto:liveTalkTurn?false:automaticOlympus(),
      maxZeusLevel:liveTalkTurn?1:selectedZeusLevelCap(),
      ...(liveTalkTurn?{liveTalk:true}:{}),
      mode,
      requestId,
      ...(compareType?{comparePair:true,compareType}:{}),
      ...(turboApproval?{turboApproval}:{}),
      ...(resumeExecutionId?{resumeExecutionId}:{})
    };
    let d;
    try{
      d=await api('/api/chat',{method:'POST',body:JSON.stringify(payload),requestId});
    }catch(firstError){
      if(firstError?.code!=='TURBO_APPROVAL_REQUIRED'||!firstError?.data?.approvalFingerprint)throw firstError;
      const approved=await turboApprovalModal(firstError.data.quote||{});
      if(!approved){
        state.messages=state.messages.filter(m=>m.id!==optimistic.id);
        state.attachedFiles=pending;state.draft=text;state.execStatus='';state.activeLevel=null;state.activeMode=mode;
        return;
      }
      turboApproval=firstError.data.approvalFingerprint;
      payload.turboApproval=turboApproval;
      state.execStatus='Complex Turbo approved · starting bounded execution…';render();
      d=await api('/api/chat',{method:'POST',body:JSON.stringify(payload),requestId});
    }
    state.currentConversation=d.conversationId;
    if(d.mode)state.activeMode=d.mode;if(d.level)state.activeLevel=d.level;
    state.execTitle=d.mode==='OLYMPUS'?'Olympus is working':'Zeus is working';
    if(d.modeExplanation)state.execStatus=d.modeExplanation;
    history.replaceState({},'',state.currentProject?.id?`/?project=${encodeURIComponent(state.currentProject.id)}`:`/?conversation=${encodeURIComponent(d.conversationId)}`);
    if(d.userMessage){
      const idx=state.messages.findIndex(m=>m.id===optimistic.id);
      if(idx>=0)state.messages[idx]={...d.userMessage,attachments:pending,artifacts:[]};
    }
    let assistant=d.message||null;
    if(d.pending){
      state.execTitle='Olympus is working';
      state.execStatus=d.modeExplanation||'Olympus is drafting, then writing one answer…';
      render();
      const polled=await pollForReply(d.conversationId,d.execution?.id);
      assistant=polled.assistant;
      if(assistant?.mode)state.activeMode=assistant.mode;if(assistant?.metadata?.executionLevel)state.activeLevel=assistant.metadata.executionLevel;
    }
    if(assistant){
      if(assistant.mode)state.activeMode=assistant.mode;if(assistant?.metadata?.executionLevel)state.activeLevel=assistant.metadata.executionLevel;
      const deliveredArtifacts=d.artifacts||assistant.artifacts||[];
      state.messages.push({...assistant,artifacts:deliveredArtifacts});
      if(deliveredArtifacts.length){state.chatArtifacts=mergeById(state.chatArtifacts,deliveredArtifacts);state.artifacts=mergeById(state.artifacts,deliveredArtifacts);}
      if(liveTalkTurn&&state.liveTalk){
        try{
          state.liveStage='speaking';state.error='';render();
          const {blob}=await requestSpeechAudio(assistant.content||'',{elevenLabsVoiceId:state.elevenLabsVoiceId||storedElevenLabsVoiceId()});
          if(!state.liveTalk)return;
          const audio=state.voiceReplyAudio||new Audio();state.voiceReplyAudio=audio;
          if(state.liveAudioUrl)URL.revokeObjectURL(state.liveAudioUrl);
          state.liveAudioUrl=URL.createObjectURL(blob);audio.src=state.liveAudioUrl;audio.muted=false;audio.volume=1;audio.playsInline=true;
          await audio.play();audio.onended=()=>{if(state.liveTalk){state.liveStage=state.liveAgentConversation?'listening':'error';render();}};
        }catch(error){state.liveStage=state.liveAgentConversation?'listening':'error';state.error=`Text reply arrived, but voice playback failed: ${error?.message||'tap the screen and retry'}`;}
      }
    }
    if(compareType)state.compareType=null;
    state.execStatus='Completed';
    await Promise.allSettled([loadConversations(),loadProjects()]);
    setTimeout(()=>{if(state.execStatus==='Completed'&&!state.sending){state.execStatus='';state.execTitle='';render();}},900);
  }catch(err){
    if(err?.code==='REQUEST_IN_PROGRESS'){
      if(err.data?.conversationId&&!state.currentConversation)state.currentConversation=err.data.conversationId;
      state.error='Zeus is still finishing this request. Wait a few seconds, then tap Retry to get the reply.';
    }else state.error=err.message||'Request failed.';
    state.execStatus='';state.activeMode=mode;state.activeLevel=null;
    state.lastFailedText=text;
    state.lastFailedMessageId=optimistic.id;
    state.lastFailedAttachments=pending;
    state.lastFailedRequestId=requestId;state.lastFailedMode=mode;state.lastFailedTurboApproval=turboApproval;
    state.lastFailedCompareType=compareType;
    state.lastFailedBudgetExecutionId=err?.code==='OLYMPUS_APPROVAL_REQUIRED'?err?.data?.executionId||null:null;
    state.lastFailedResumeExecutionId=mode==='ZEUS'?err?.data?.executionId||null:null;
  }finally{clearTimeout(timer);state.sending=false;render();}
}
async function approveNextOlympusFive(){
 const executionId=state.lastFailedBudgetExecutionId;
 if(!executionId||state.sending)return;
 try{
  const before=await api('/api/olympus-budget?executionId='+encodeURIComponent(executionId));
  const beforeDollars=(before.authorizedCents/100).toFixed(2);
  const afterDollars=((before.authorizedCents+500)/100).toFixed(2);
  if(!confirm('Authorize exactly $5 additional spend for this Olympus job? '+beforeDollars+' → '+afterDollars+' USD.'))return;
  await api('/api/olympus-budget',{method:'POST',body:JSON.stringify({executionId,authorization:'add_five_usd',expectedAuthorizedCents:before.authorizedCents})});
  state.lastFailedBudgetExecutionId=null;
  await retryLastMessage();
 }catch(error){state.error=error.message||'Budget authorization failed.';render();}
}
async function retryLastMessage({liveTalk=false}={}){
  if(!state.lastFailedText||state.sending)return;
  if(!window.confirm('Try again? This may start another paid attempt. Saved completed stages will be reused when available.'))return;
  const text=state.lastFailedText;
  const pending=[...state.lastFailedAttachments];
  let requestId=state.lastFailedRequestId||crypto.randomUUID();
  const mode=state.lastFailedMode||state.mode,turboApproval=state.lastFailedTurboApproval||null;
  const compareType=state.lastFailedCompareType||null;
  let resumeExecutionId=null;
  if(mode==='ZEUS'&&state.lastFailedResumeExecutionId){
    try{
      const checkpoints=await api('/api/production-checkpoints?executionId='+encodeURIComponent(state.lastFailedResumeExecutionId));
      if((checkpoints.phases||[]).some(x=>x.state==='COMPLETED')){
        resumeExecutionId=state.lastFailedResumeExecutionId;
        requestId=crypto.randomUUID();
      }
    }catch{}
  }
  if(state.lastFailedMessageId)state.messages=state.messages.filter(m=>m.id!==state.lastFailedMessageId);
  state.error='';state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;state.lastFailedMode=null;state.lastFailedTurboApproval=null;state.lastFailedCompareType=null;state.compareType=compareType;render();
  if(liveTalk)await sendText(text,pending,requestId,mode,turboApproval,resumeExecutionId,{liveTalk:true});
  else await sendText(text,pending,requestId,mode,turboApproval,resumeExecutionId);
}
function mediaBaseName(name='media'){return String(name||'media').replace(/\.[^.]+$/,'').replace(/[^a-z0-9._-]+/gi,'-').slice(0,100)||'media';}
function canvasJpeg(canvas,quality=.82){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode image.')),'image/jpeg',quality));}
async function imageElementFromFile(file){const url=URL.createObjectURL(file);try{const img=new Image();img.decoding='async';await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('This image format could not be decoded on this device.'));img.src=url;});return {img,url};}catch(error){URL.revokeObjectURL(url);throw error;}}
async function normalizeMediaImage(file){const supported=/^image\/(?:png|jpeg|jpg|webp|gif)$/i.test(file.type||'');if(supported&&file.size<=1500*1024)return file;const {img,url}=await imageElementFromFile(file);try{const max=1600,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1)),w=Math.max(1,Math.round((img.naturalWidth||1)*scale)),h=Math.max(1,Math.round((img.naturalHeight||1)*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);let blob=await canvasJpeg(canvas,.84);if(blob.size>1500*1024)blob=await canvasJpeg(canvas,.70);return new File([blob],`${mediaBaseName(file.name)}.jpg`,{type:'image/jpeg',lastModified:Date.now()});}finally{URL.revokeObjectURL(url);}}
async function sampleVideoFrames(file,maxFrames=3){const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;video.src=url;try{await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('This video could not be decoded on this device.'));});const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:1,points=Array.from({length:maxFrames},(_,i)=>(i+1)/(maxFrames+1)),out=[];for(let i=0;i<points.length;i++){const t=Math.max(0,Math.min(Math.max(0,duration-.05),duration*points[i]));await new Promise((resolve,reject)=>{let timer;const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);resolve();};video.addEventListener('seeked',done,{once:true});video.currentTime=t;timer=setTimeout(()=>{video.removeEventListener('seeked',done);reject(new Error('Video frame sampling timed out.'));},5000);});const max=1280,scale=Math.min(1,max/Math.max(video.videoWidth||1,video.videoHeight||1)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((video.videoWidth||1)*scale));canvas.height=Math.max(1,Math.round((video.videoHeight||1)*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const blob=await canvasJpeg(canvas,.76);out.push(new File([blob],`${mediaBaseName(file.name)}-frame-${i+1}.jpg`,{type:'image/jpeg',lastModified:Date.now()}));}return out;}finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}}
async function handleMediaFiles(files){state.attachMenu=false;for(const file of files){try{if((file.type||'').startsWith('video/')){state.execStatus=`Sampling ${file.name} for visual analysis…`;render();const frames=await sampleVideoFrames(file,3);if(file.size<=4*1024*1024)await uploadFile(file,{analysisRole:'video_source',sourceName:file.name,attach:true});for(const frame of frames)await uploadFile(frame,{analysisRole:'video_frame',sourceName:file.name,attach:true});state.execStatus=`Video prepared: ${frames.length} sampled frames. Audio and motion between samples are not analyzed.`;}else if((file.type||'').startsWith('image/')||/\.(heic|heif)$/i.test(file.name||'')){state.execStatus=`Preparing ${file.name} for vision…`;render();const normalized=await normalizeMediaImage(file);await uploadFile(normalized,{analysisRole:'media_image',sourceName:file.name,attach:true});}else await uploadFile(file);}catch(error){state.error=error?.message||`Could not prepare ${file.name}.`;state.execStatus='';render();}}}
async function uploadFile(file,{analysisRole='',sourceName='',attach=true}={}){
  if(file.size>4*1024*1024){state.error=`${file.name} is over the current 4 MB safe upload limit.`;render();return;}
  state.execStatus=`Uploading ${file.name}…`;render();
  try{
    const fd=new FormData();fd.append('file',file);if(analysisRole)fd.append('analysisRole',analysisRole);if(sourceName)fd.append('sourceName',sourceName);
    const inProjectWorkspace=state.tab==='Projects'&&Boolean(state.currentProject?.id);
    if(inProjectWorkspace)fd.append('projectId',state.currentProject.id);
    if((inProjectWorkspace||state.tab==='Home')&&state.currentConversation)fd.append('conversationId',state.currentConversation);
    const d=await api('/api/files',{method:'POST',body:fd});
    if(attach)state.attachedFiles.push(d.file);await loadFiles(inProjectWorkspace?state.currentProject.id:null);
    const status=d.file.analysisStatus||d.file.metadata?.extractionStatus||'stored_only';state.execStatus=status==='analyzable'?'File uploaded and ready for text analysis.':status==='vision_only'?'Image uploaded and ready for vision.':status==='failed'?'File uploaded, but text extraction failed. The original is preserved.':status==='stored_only'&&analysisRole==='video_source'?'Video source stored; analysis uses sampled frames.':'File uploaded and preserved; this type is stored only.';
  }catch(e){state.error=e.message;state.execStatus='';}
  finally{render();const shown=state.execStatus;setTimeout(()=>{if(state.execStatus===shown&&!state.sending){state.execStatus='';render();}},1200)}
}
function finishLiveTalkSession(){
  state.liveTalk=false;state.liveTalkStopRequested=false;state.liveMuted=false;state.liveStage='idle';state.liveGeneration++;
  clearTimeout(state.liveRetryTimer);state.liveRetryTimer=null;
  releaseLiveAgentPermissionStream();
  const connection=state.liveAgentConversation;state.liveAgentConversation=null;state.liveAgentConversationId='';state.liveAgentPartial='';
  try{void connection?.endSession?.()}catch{}
  try{state.liveSpeechController?.abort()}catch{}
  state.liveSpeechController=null;discardLiveAudio();try{window.speechSynthesis?.cancel()}catch{}render();
}
function pauseLiveTalkOnError(message,kind='agent'){
  if(!state.liveTalk)return;
  const detail=String(message||'ElevenLabs Realtime could not complete this voice session.');
  state.error=/operation is insecure|securityerror|secure context/i.test(detail)
    ? `${window.isSecureContext===false?'This page is not in a secure context. Open the HTTPS site directly in Safari.':'Safari blocked microphone setup for this page. Check Safari microphone permission for this site, reload, and reconnect.'} You can still type below; Zeus will answer by voice.`
    : /notallowederror|permission denied|microphone.*denied/i.test(detail)
      ? 'Microphone permission is off for this site. Allow it in Safari settings and reconnect. You can still type below; Zeus will answer by voice.'
      : detail;
  state.liveStage='error';state.liveFailureKind=kind;clearTimeout(state.liveRetryTimer);state.liveRetryTimer=null;
  releaseLiveAgentPermissionStream();
  const connection=state.liveAgentConversation;state.liveAgentConversation=null;state.liveAgentPartial='';
  try{void connection?.endSession?.()}catch{}
  try{state.liveSpeechController?.abort()}catch{}
  discardLiveAudio({keepElement:true});try{window.speechSynthesis?.cancel()}catch{}render();
}
function describeLiveDisconnect(details){
  const reason=String(details?.message||details?.context?.reason||details?.closeReason||'').trim();
  const code=details?.closeCode??details?.context?.code;
  const category=details?.reason==='agent'?'The ElevenLabs agent/LiveKit closed the session':details?.reason==='error'?'The Realtime transport failed':'The Realtime session ended';
  const diagnostic=[reason,code!=null?`code ${Number(code)}`:''].filter(Boolean).join(' · ');
  return diagnostic?`${category}: ${diagnostic}`:`${category}. The SDK did not provide a close reason.`;
}
function saveLiveAgentMessage(payload,generation,providerConversationId){
  const content=String(payload?.message||'').replace(/<\/?Athena>/gi,'').trim(),eventId=String(payload?.event_id??'');
  if(!content||!eventId||!state.liveTalk||generation!==state.liveGeneration)return;
  const role=payload?.role==='user'||payload?.source==='user'?'user':'assistant';
  const key=`${role}:${eventId}`;
  let local=state.liveAgentLoggedEvents.get(key);
  if(local){local.content=content;}
  else{
    local={id:`eleven-${generation}-${key}`,role,mode:'ZEUS',content,artifacts:[],attachments:[],metadata:{source:'elevenlabs_realtime'}};
    state.liveAgentLoggedEvents.set(key,local);state.messages.push(local);
  }
  if(role==='user')state.liveAgentPartial=content;
  else state.liveAgentPartial='';
  if(role==='user'){
    const text=content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(/\b(?:fale|fala|falar|converse|conversar|chame|chama|chamar|quero falar|talk|speak|switch)\b[\s\S]{0,28}\b(?:(?:com|to|with)\s+)?(?:a\s+)?(?:helen|athena)\b/.test(text)&&state.livePersona!=='ATHENA')selectLivePersona('ATHENA');
    else if(/\b(?:volta|volte|fale|fala|falar|converse|conversar|quero falar|talk|speak|switch|back)\b[\s\S]{0,28}\b(?:(?:com|to|with)\s+)?(?:o\s+)?zeus\b/.test(text)&&state.livePersona!=='ZEUS')selectLivePersona('ZEUS');
  }
  if(role==='assistant')state.liveStage='speaking';
  render();
  state.liveAgentLogQueue=state.liveAgentLogQueue.then(async()=>{
    if(!state.liveTalk&&generation!==state.liveGeneration)return;
    const saved=await api('/api/voice-log',{method:'POST',body:JSON.stringify({
      conversationId:state.currentConversation||null,
      projectId:state.currentProject?.id||null,
      providerConversationId,
      eventId,
      role,
      content,
    })});
    if(generation!==state.liveGeneration)return;
    state.currentConversation=saved.conversationId;
    const index=state.messages.findIndex(message=>message.id===local.id);
    if(index>=0)state.messages[index]={...saved.message,artifacts:[],attachments:[]};
    history.replaceState({},'',state.currentProject?.id?`/?project=${encodeURIComponent(state.currentProject.id)}`:`/?conversation=${encodeURIComponent(saved.conversationId)}`);
    void Promise.allSettled([loadConversations(),loadProjects()]);render();
  }).catch(error=>{
    if(generation!==state.liveGeneration)return;
    state.error=`Live Talk is connected, but its transcript could not be saved in OlyHub: ${error?.message||'save failed'}`;render();
  });
}
async function connectLiveTalkAgent(){
  clearTimeout(state.liveRetryTimer);state.liveRetryTimer=null;
  if(!state.liveTalk||state.liveTalkStopRequested)return;
  const generation=state.liveGeneration;state.liveStage='connecting';state.liveAgentPartial='';render();
  let permissionStream=null;
  try{
    // Ask for microphone access immediately from the Start/Retry tap. Safari on
    // iOS can reject getUserMedia if the first request happens after an API await.
    permissionStream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(!state.liveTalk||generation!==state.liveGeneration){releaseLiveAgentPermissionStream(permissionStream);for(const track of permissionStream.getTracks())try{track.stop()}catch{}return;}
    state.liveAgentPermissionStream=permissionStream;
    const isIosWebKit=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(/MacIntel/.test(navigator.platform||'')&&navigator.maxTouchPoints>1);
    const issued=await api(isIosWebKit?'/api/voice/realtime-signed-url':'/api/voice/realtime-token',{method:'POST',body:'{}'});
    if(!state.liveTalk||generation!==state.liveGeneration)return;
    const {Conversation}=await import('/assets/elevenlabs-agent.js');
    const selectedLanguage=state.liveLocale==='auto'?'':({pt:'pt',en:'en',es:'es'}[state.liveLocale]||'');
    // Keep the Realtime voice owned by the published agent configuration. This
    // agent does not allow `voice_id` overrides, and ElevenLabs closes the
    // session with code 1008 when the SDK sends one. Custom voices remain
    // available to the standalone TTS route.
    const overrides={
      ...(selectedLanguage?{agent:{language:selectedLanguage}}:{}),
    };
    const conversation=await Conversation.startSession({
      ...(isIosWebKit?{signedUrl:issued.signedUrl,connectionType:'websocket'}:{conversationToken:issued.token,connectionType:'webrtc'}),
      workletPaths:{
        rawAudioProcessor:'/assets/elevenlabs-worklets/raw-audio-processor.js',
        audioConcatProcessor:'/assets/elevenlabs-worklets/audio-concat-processor.js',
      },
      libsampleratePath:'/assets/elevenlabs-worklets/libsamplerate.worklet.js',
      ...(Object.keys(overrides).length?{overrides}:{}),
      onConnect:({conversationId})=>{
        if(!state.liveTalk||generation!==state.liveGeneration)return;
        state.liveAgentConversationId=conversationId||issued.conversationId||'';state.liveStage=state.liveMuted?'muted':'listening';state.error='';render();
      },
      onStatusChange:({status})=>{
        if(!state.liveTalk||generation!==state.liveGeneration)return;
        if(status==='connected'&&state.liveStage==='connecting'){state.liveStage='listening';render();}
      },
      onModeChange:({mode})=>{
        if(!state.liveTalk||generation!==state.liveGeneration)return;
        state.liveStage=mode==='speaking'?'speaking':state.liveMuted?'muted':'listening';render();
      },
      onMessage:message=>saveLiveAgentMessage(message,generation,state.liveAgentConversationId||issued.conversationId||''),
      onError:(message)=>{if(state.liveTalk&&generation===state.liveGeneration)pauseLiveTalkOnError(String(message||'ElevenLabs Realtime encountered an error.'),'agent');},
      onDisconnect:details=>{
        if(state.liveTalk&&generation===state.liveGeneration){
          pauseLiveTalkOnError(describeLiveDisconnect(details),'agent');
        }
      },
    });
    if(!state.liveTalk||generation!==state.liveGeneration){await conversation.endSession();releaseLiveAgentPermissionStream(permissionStream);permissionStream=null;return;}
    state.liveAgentConversation=conversation;
    state.liveAgentConversationId=conversation.getId?.()||state.liveAgentConversationId||issued.conversationId||'';
    try{conversation.sendContextualUpdate(liveSessionContext());}catch{}
    releaseLiveAgentPermissionStream(permissionStream);permissionStream=null;
    state.liveStage=state.liveMuted?'muted':'listening';state.error='';render();
  }catch(error){
    if(permissionStream)releaseLiveAgentPermissionStream(permissionStream);
    if(!state.liveTalk||generation!==state.liveGeneration)return;
    if(error?.name==='NotAllowedError'||/microphone|permission/i.test(String(error?.message||'')))pauseLiveTalkOnError('Microphone permission was denied. Allow microphone access for this site and reconnect.','agent');
    else if(error?.name==='SecurityError'||/operation is insecure|secure context/i.test(String(error?.message||'')))pauseLiveTalkOnError('Safari blocked microphone access because this page is not in a secure context. Open OlyHub using its HTTPS address, then reconnect.','agent');
    else pauseLiveTalkOnError(error?.message||'Could not connect to the ElevenLabs Realtime agent. Check that the agent is published and the server API key has access.','agent');
  }
}
function toggleLiveTalk(){
  if(state.liveTalk){finishLiveTalkSession();return;}
  if(state.sending){state.error='Wait for Zeus to finish the current reply before starting Live Talk.';render();return;}
  if(window.isSecureContext===false){state.error='Live Talk requires a secure HTTPS page. Open OlyHub using its HTTPS address and reconnect.';render();return;}
  if(!liveTalkSupported()){state.error='Live Talk requires microphone access, audio playback, and a supported browser.';render();return;}
  state.voiceId=localStorage.getItem('zeus-voice-id')||'marin';unlockLiveAudioFromGesture();
  state.error='';state.liveMuted=false;state.liveFailureKind=null;state.liveRetryCount=0;state.liveTalkStopRequested=false;state.liveAgentPartial='';state.liveTalk=true;state.liveStage='connecting';state.liveGeneration++;state.liveAgentLoggedEvents=new Map();state.liveAgentLogQueue=Promise.resolve();render();connectLiveTalkAgent();
}
function toggleLiveTalkMute(){
  if(!state.liveTalk)return;
  const connection=state.liveAgentConversation;
  if(!connection){state.error='ElevenLabs Realtime is not connected. Reconnect before changing microphone state.';render();return;}
  try{
    state.liveMuted=!state.liveMuted;connection.setMicMuted(state.liveMuted);
    state.liveStage=state.liveMuted?'muted':'listening';state.error='';render();
  }catch(error){pauseLiveTalkOnError(error?.message||'ElevenLabs Realtime could not change microphone state. Reconnect.','agent');}
}
function livePersonaContext(persona=state.livePersona){
  return persona==='ATHENA'
    ? 'Felipe selected the Athena voice. Speak as Athena using the configured Jelyn multi-voice label; wrap spoken text in <Athena>...</Athena>. Treat “Helen” as an alias for Athena: when Felipe says “talk to Helen” or asks for Helen, switch to Athena. Keep this persona until he selects Zeus or asks to return to Zeus. Do not announce the switch.'
    : 'Felipe selected the Zeus voice. Speak as Zeus using the agent default voice (Felipe), with spoken text outside voice tags. Treat “Helen” as an alias for Athena only when Felipe explicitly asks to talk to Helen; when switching to Athena, use <Athena>...</Athena>. Otherwise remain Zeus. Do not announce the voice selection.';
}
function liveSessionContext(persona=state.livePersona){
  const transcript=(state.messages||[])
    .filter(message=>['user','assistant'].includes(message?.role)&&String(message?.content||'').trim())
    .slice(-18)
    .map(message=>{
      const speaker=message.role==='user'?'Felipe':'Zeus/Athena';
      const content=String(message.content||'').replace(/<\/?Athena>/gi,'').replace(/\s+/g,' ').trim();
      return content?`${speaker}: ${content}`:'';
    }).filter(Boolean);
  let history=transcript.join('\n');
  if(history.length>10000)history=history.slice(-10000);
  return `${livePersonaContext(persona)}\n\nConversation continuity: Treat the recent transcript below as the prior turns of this same ongoing conversation. Remember the user's stated facts, preferences, corrections, and unresolved requests. Answer follow-up references using this context; do not ask the user to repeat information already present. The transcript is background context, not a new request.\n${history?`Recent conversation transcript:\n${history}`:'There are no earlier saved chat turns to restore.'}`;
}
function selectLivePersona(persona){
  const next=persona==='ATHENA'?'ATHENA':'ZEUS';
  if(state.livePersona===next)return;
  state.livePersona=next;try{localStorage.setItem('zeus-live-persona',next)}catch{}
  try{state.liveAgentConversation?.sendContextualUpdate(livePersonaContext(next));}
  catch(error){state.error=error?.message||'Could not change the Live Talk persona.';}
  render();
}
function sendLiveTalkText(event){
  event.preventDefault();
  if(state.sending)return;
  const input=$('#live-talk-text');const text=String(input?.value||'').trim();
  if(!text)return;
  const connection=state.liveAgentConversation;
  if(!connection){state.liveTextDraft='';state.liveTextStatus='Sending your typed message through Zeus…';void sendText(text,[],undefined,'ZEUS',null,null,{liveTalk:true});return;}
  try{
    connection.sendUserMessage(text);
    state.liveTextDraft='';state.liveTextStatus='Message sent to the live agent.';state.error='';
    if(input)input.value='';
    const status=$('#live-talk-text-status');if(status)status.textContent=state.liveTextStatus;
  }catch{state.liveTextDraft='';state.liveTextStatus='Sending your typed message through Zeus…';void sendText(text,[],undefined,'ZEUS',null,null,{liveTalk:true});}
}
async function retryLiveTalk(){
  if(!state.liveTalk)return;
  state.error='';state.liveRetryCount=0;state.liveFailureKind=null;
  await connectLiveTalkAgent();
}

async function startVoice(){
  if(state.recording&&state.voiceRecorder){state.voiceSubmitRequested=true;state.execStatus='Sending audio to ElevenLabs Scribe…';stopVoiceRecording();return;}
  if(state.voiceBusy)return;

  const canRecord=Boolean(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder);
  if(!canRecord){state.error='Audio recording is not supported by this browser.';render();return;}
  if(!state.health?.capabilities?.serverTranscription){state.error='ElevenLabs Scribe is not configured on this deploy.';render();return;}
  try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      const choices=['audio/mp4','audio/aac','audio/webm;codecs=opus','audio/webm'];
      const mime=choices.find(x=>MediaRecorder.isTypeSupported?.(x))||'';
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      state.voiceStream=stream;state.voiceRecorder=recorder;state.voiceChunks=[];state.voiceBytes=0;state.voiceHitSizeLimit=false;
      recorder.ondataavailable=e=>{if(e.data?.size){state.voiceChunks.push(e.data);state.voiceBytes+=e.data.size;if(state.voiceBytes>3600*1024&&recorder.state==='recording'){state.voiceHitSizeLimit=true;recorder.stop();}}};
      recorder.onerror=e=>{state.voiceSubmitRequested=false;state.error=`Voice recording failed${e?.error?.name?` (${e.error.name})`:''}. Check microphone permission.`;cleanupVoice();render();};
      recorder.onstop=async()=>{
        if(recorder._zeusFinalized)return;recorder._zeusFinalized=true;
        clearTimeout(state.voiceStopTimer);clearTimeout(recorder._zeusWatchdog);
        const chunks=state.voiceChunks.slice();
        const type=recorder.mimeType||'audio/webm';const hitSizeLimit=state.voiceHitSizeLimit;
        cleanupVoice();
        if(!chunks.length){state.voiceSubmitRequested=false;state.error='No voice audio was captured.';render();return;}
        state.voiceBusy=true;state.execStatus=hitSizeLimit?'Sending captured audio to ElevenLabs Scribe…':'Sending audio to ElevenLabs Scribe…';render();
        try{
          const blob=new Blob(chunks,{type});
          const ext=type.includes('mp4')||type.includes('aac')?'m4a':'webm';
          const fd=new FormData();fd.append('audio',blob,`voice-${Date.now()}.${ext}`);
          const d=await api('/api/transcribe',{method:'POST',body:fd});
          state.voiceBusy=false;state.execStatus='';render();
          if(d.text){
            if(state.voiceSubmitRequested){state.voiceSubmitRequested=false;await sendVoiceTranscript(d.text);}
            else{state.draft=d.text;state.execStatus='Transcript ready. Review it, then tap Send.';render();$('#composer-text')?.focus();}
          } else throw new Error('No speech was detected.');
        }catch(error){
          state.voiceSubmitRequested=false;
          state.voiceBusy=false;state.execStatus='';
          state.error=error.message||'Voice transcription failed.';
          render();
        }
      };
      recorder.start(250);
      state.recording=true;state.error='';state.execStatus='Recording… tap the mic again to send to ElevenLabs Scribe';
      state.voiceStopTimer=setTimeout(()=>{if(state.recording&&state.voiceRecorder===recorder)stopVoiceRecording();},60000);
      render();return;
    }catch(error){
      state.voiceSubmitRequested=false;
      cleanupVoice();
      state.error=error?.name==='NotAllowedError'?'Microphone permission was denied. Enable microphone access for this site and try again.':`Could not start microphone recording: ${String(error?.message||'unknown error').slice(0,180)}`;
      render();
  }
}
function stopVoiceRecording(){
  const recorder=state.voiceRecorder;if(!recorder)return;
  try{recorder.requestData?.()}catch{}
  try{if(recorder.state!=='inactive')recorder.stop()}catch{}
  // Release the microphone right away; iOS keeps the indicator on otherwise.
  state.voiceStream?.getTracks?.().forEach(t=>t.stop());
  // If onstop never fires (seen on iOS), finalize with what was captured.
  recorder._zeusWatchdog=setTimeout(()=>{if(!recorder._zeusFinalized)recorder.onstop?.();},3000);
  state.execStatus='Finishing recording…';render();
}
function voiceCaptureActive(){return Boolean(state.recording&&state.voiceRecorder);}
function cleanupVoice(){
  state.voiceStream?.getTracks?.().forEach(t=>t.stop());
  state.recording=false;state.voiceRecorder=null;state.voiceStream=null;state.voiceChunks=[];state.voiceBytes=0;state.voiceHitSizeLimit=false;
  clearTimeout(state.voiceStopTimer);state.voiceStopTimer=null;
}
function projectModal(){
  showModal(`<div class="modal-backdrop" id="modal-bg"><div class="modal" aria-labelledby="project-modal-title"><div class="modal-head"><h2 id="project-modal-title">New project</h2><button class="ghost" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div id="modal-notice" class="notice error-notice hidden" role="alert" aria-live="assertive"></div><form id="project-form" class="form-grid"><div class="field"><label for="project-name">Name</label><input id="project-name" required maxlength="120" placeholder="Hercules Hub"></div><div class="field"><label for="project-goal">Goal</label><textarea id="project-goal" rows="3" placeholder="What should this project accomplish?"></textarea></div><div class="field"><label for="project-description">Description</label><textarea id="project-description" rows="3" placeholder="Optional context"></textarea></div><div class="modal-actions"><button type="button" class="secondary" id="modal-cancel">Cancel</button><button class="primary" id="project-submit">Create project</button></div></form></div></div>`,{initialFocus:'#project-name'});
  $('#modal-close').onclick=$('#modal-cancel').onclick=()=>closeModal();
  $('#project-form').addEventListener('submit',async e=>{
    e.preventDefault();setModalError('');const submit=$('#project-submit');submit.disabled=true;
    try{
      const d=await api('/api/projects',{method:'POST',body:JSON.stringify({name:$('#project-name').value,goal:$('#project-goal').value,description:$('#project-description').value})});
      closeModal({restoreFocus:false});await loadProjects();state.currentProject=state.projects.find(p=>p.id===d.project.id)||{...d.project};state.tab='Projects';state.projectSection='CHAT';await hydrateProjectWorkspace(state.currentProject.id);render();
    }catch(err){setModalError(err.message||'Could not create project.');submit.disabled=false;}
  });
}
async function loadProjectConversation(project){
  state.currentConversation=project?.conversation_id||null;
  state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.error='';state.messagePage={hasMore:false,nextCursor:null};
  if(!state.currentConversation)return;
  const d=await api(`/api/chat?conversationId=${encodeURIComponent(state.currentConversation)}&limit=60`);
  state.files=mergeById(state.files,d.files||[]);
  const fileIndex=Object.fromEntries((state.files||[]).map(f=>[f.id,f]));
  state.messages=(d.messages||[]).map(m=>({...m,
    artifacts:(d.artifacts||[]).filter(a=>m.metadata?.artifacts?.includes?.(a.id)),
    attachments:(m.metadata?.attachments||[]).map(fid=>(typeof fid==='object'?fid:fileIndex[fid]||{id:fid,filename:'Attached file'}))
  }));
  state.chatArtifacts=d.artifacts||[];
  state.messagePage={hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
  syncActiveModeFromMessages();
}

function projectEditModal(){
  const p=state.currentProject;if(!p)return;
  showModal(`<div class="modal-backdrop" id="modal-bg"><div class="modal" aria-labelledby="project-edit-title"><div class="modal-head"><h2 id="project-edit-title">Edit project</h2><button class="ghost" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div id="modal-notice" class="notice error-notice hidden" role="alert" aria-live="assertive"></div><form id="project-edit-form" class="form-grid"><div class="field"><label for="edit-project-name">Name</label><input id="edit-project-name" required maxlength="120" value="${esc(p.name)}"></div><div class="field"><label for="edit-project-goal">Goal</label><textarea id="edit-project-goal" rows="4">${esc(p.goal||'')}</textarea></div><div class="field"><label for="edit-project-description">Description</label><textarea id="edit-project-description" rows="4">${esc(p.description||'')}</textarea></div><div class="field"><label for="edit-project-status">Status</label><select id="edit-project-status"><option value="IN_PROGRESS" ${p.status==='IN_PROGRESS'?'selected':''}>In progress</option><option value="PAUSED" ${p.status==='PAUSED'?'selected':''}>Paused</option><option value="COMPLETED" ${p.status==='COMPLETED'?'selected':''}>Completed</option></select></div><div class="modal-actions split-actions"><button type="button" class="secondary danger" id="delete-project">Delete project</button><div><button type="button" class="secondary" id="modal-cancel">Cancel</button><button class="primary" id="project-edit-submit">Save changes</button></div></div></form></div></div>`,{initialFocus:'#edit-project-name'});
  $('#modal-close').onclick=$('#modal-cancel').onclick=()=>closeModal();
  $('#delete-project').onclick=async()=>{closeModal({restoreFocus:false});await deleteCurrentProject();};
  $('#project-edit-form').addEventListener('submit',async e=>{
    e.preventDefault();setModalError('');const submit=$('#project-edit-submit');submit.disabled=true;
    try{
      await api('/api/projects',{method:'PATCH',body:JSON.stringify({id:p.id,name:$('#edit-project-name').value,goal:$('#edit-project-goal').value,description:$('#edit-project-description').value,status:$('#edit-project-status').value,progress:p.progress})});
      closeModal({restoreFocus:false});await loadProjects();state.currentProject=state.projects.find(x=>x.id===p.id)||state.currentProject;render();
    }catch(err){setModalError(err.message||'Could not update project.');submit.disabled=false;}
  });
}
async function createMemory(e){
  e.preventDefault();const content=$('#memory-content')?.value.trim();if(!content||!state.currentProject)return;
  try{await api('/api/memories',{method:'POST',body:JSON.stringify({projectId:state.currentProject.id,content})});await Promise.all([loadMemories(state.currentProject.id),loadProjects()]);state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;render();}catch(err){state.error=err.message;render();}
}
async function deleteMemory(id){
  if(!id||!state.currentProject)return;if(!confirm('Excluir esta memória do projeto?'))return;
  try{await api('/api/memories',{method:'DELETE',body:JSON.stringify({id})});await Promise.all([loadMemories(state.currentProject.id),loadProjects()]);state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;render();}catch(err){state.error=err.message;render();}
}
async function hydrateProjectWorkspace(projectId,{loadConversation=true}={}){
  if(!projectId)return;
  await Promise.all([loadTasks(projectId),loadMemories(projectId),loadFiles(projectId),loadArtifacts(projectId)]);await loadProjectSources();
  const refreshed=state.projects.find(p=>p.id===projectId);
  if(refreshed)state.currentProject=refreshed;
  if(loadConversation&&state.currentProject)await loadProjectConversation(state.currentProject);
}

async function deleteOutput(kind,id){
  if(!id||!['file','artifact'].includes(kind))return;
  const noun=kind==='artifact'?'artifact':'file';
  if(!confirm('Excluir este arquivo? Esta ação não pode ser desfeita.'))return;
  try{
    await api(kind==='artifact'?'/api/artifacts':'/api/files',{method:'DELETE',body:JSON.stringify({id})});
    if(kind==='artifact'){
      state.artifacts=state.artifacts.filter(x=>x.id!==id);
      state.chatArtifacts=state.chatArtifacts.filter(x=>x.id!==id);
      state.messages=state.messages.map(m=>({...m,artifacts:(m.artifacts||[]).filter(x=>x.id!==id)}));
    }else{
      state.files=state.files.filter(x=>x.id!==id);
      state.attachedFiles=state.attachedFiles.filter(x=>x.id!==id);
      state.messages=state.messages.map(m=>({...m,attachments:(m.attachments||[]).filter(x=>x.id!==id)}));
    }
    await loadProjects();
    if(state.currentProject?.id)state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;
    render();
  }catch(err){state.error=err.message||`Could not delete ${noun}.`;render();}
}

async function deleteCurrentProject(){
  const p=state.currentProject;if(!p)return;
  if(!confirm(`Excluir “${p.name}” e suas conversas, tarefas, memória e arquivos? Esta ação não pode ser desfeita.`))return;
  try{
    await api('/api/projects',{method:'DELETE',body:JSON.stringify({id:p.id})});
    state.currentProject=null;state.currentConversation=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.activeMode=null;state.projectMemories=[];state.memoryPolicy=null;state.tasks=[];state.files=[];state.artifacts=[];state.projectSection='CHAT';state.messagePage={hasMore:false,nextCursor:null};state.error='';
    history.replaceState({},'',location.pathname);
    await Promise.all([loadProjects(),loadFiles(),loadArtifacts()]);
    state.tab='Projects';render();resetViewport();
  }catch(err){state.error=err.message||'Could not delete project.';render();}
}

async function openProjectWorkspace(projectId){
  try{
    const changing=state.currentProject?.id!==projectId;
    state.tab='Projects';state.drawer=false;if(changing)state.projectSection='CHAT';
    state.currentProject=state.projects.find(p=>p.id===projectId)||null;
    if(!state.currentProject)return render();
    await hydrateProjectWorkspace(projectId);
    history.replaceState({},'',`/?project=${encodeURIComponent(projectId)}`);
  }catch(err){state.error=err.message||'Could not open project workspace.';}
  render();resetViewport();
}
async function createTask(e){e.preventDefault();const title=$('#task-title')?.value.trim();if(!title)return;const priority=$('#task-priority')?.value||'MEDIUM';const due=$('#task-due')?.value||'';const dueAt=due?new Date(`${due}T12:00:00`).toISOString():null;try{await api('/api/tasks',{method:'POST',body:JSON.stringify({projectId:state.currentProject.id,title,priority,dueAt})});await Promise.all([loadTasks(state.currentProject.id),loadProjects()]);state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;render();}catch(err){state.error=err.message;render()}}
async function toggleTask(id,status){try{const currentId=state.currentProject?.id||null;const next=status==='TODO'?'IN_PROGRESS':status==='IN_PROGRESS'?'DONE':'TODO';await api('/api/tasks',{method:'PATCH',body:JSON.stringify({id,status:next})});await Promise.all([loadTasks(currentId),loadProjects()]);if(currentId)state.currentProject=state.projects.find(p=>p.id===currentId)||state.currentProject;render();}catch(err){state.error=err.message;render()}}

bootAuth();
