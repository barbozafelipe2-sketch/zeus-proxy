// One owner-facing deity per tool. Model candidates are resolved from the
// actually configured server catalog; unavailable providers are never advertised
// as callable. Preferences are lightweight routing feedback, not model training.
export const TOOL_WORKFLOWS=Object.freeze({
  web:Object.freeze({id:'web',god:'Hermes',title:'Web Search',route:'research',vision:false}),
  code:Object.freeze({id:'code',god:'Hephaestus',title:'Code',route:'coding',vision:false}),
  images:Object.freeze({id:'images',god:'Apollo',title:'Images',route:'vision',vision:true}),
  documents:Object.freeze({id:'documents',god:'Athena',title:'Documents',route:'writing',vision:false}),
  analysis:Object.freeze({id:'analysis',god:'Hestia',title:'Source Review',route:'hard',vision:true}),
});

export function getToolWorkflow(id){return typeof id==='string'?TOOL_WORKFLOWS[id]||null:null;}
export function toolConversationTitle(id){const tool=getToolWorkflow(id);return tool?`${tool.god} · ${tool.title}`:null;}
export function safeToolPreference(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {models:{},ratings:0,standard:null};
  const models={};
  for(const [key,raw] of Object.entries(value.models||{}).slice(0,24)){
    if(!/^[a-z0-9_-]{2,32}:[a-z0-9._/-]{1,100}$/i.test(key))continue;
    const likes=Math.max(0,Math.min(999,Math.trunc(Number(raw?.likes)||0)));
    const dislikes=Math.max(0,Math.min(999,Math.trunc(Number(raw?.dislikes)||0)));
    const samples=Math.max(0,Math.min(1998,likes+dislikes));
    if(samples)models[key]={likes,dislikes,samples};
  }
  const ratings=Math.min(9999,Math.max(0,Math.trunc(Number(value.ratings)||0)));
  const standard=typeof value.standard==='string'&&Object.hasOwn(models,value.standard)?value.standard:null;
  return {models,ratings,standard};
}

export function recordToolFeedback(allPreferences,toolId,modelKeys,value){
  const tool=getToolWorkflow(toolId);if(!tool||!['up','down','choose'].includes(value))return null;
  const next=allPreferences&&typeof allPreferences==='object'&&!Array.isArray(allPreferences)?structuredClone(allPreferences):{};
  const previous=safeToolPreference(next[toolId]);
  const keys=[...new Set((Array.isArray(modelKeys)?modelKeys:[]).filter(k=>typeof k==='string'&&/^[a-z0-9_-]{2,32}:[a-z0-9._/-]{1,100}$/i.test(k)))].slice(0,6);
  if(!keys.length)return null;
  for(const key of keys){
    const current=previous.models[key]||{likes:0,dislikes:0,samples:0};
    const liked=value==='up'||value==='choose';
    previous.models[key]={likes:Math.min(999,current.likes+(liked?1:0)),dislikes:Math.min(999,current.dislikes+(liked?0:1)),samples:Math.min(1998,current.samples+1)};
  }
  previous.ratings=Math.min(9999,previous.ratings+1);
  const ranked=Object.entries(previous.models).sort((a,b)=>(b[1].likes-b[1].dislikes)-(a[1].likes-a[1].dislikes)||b[1].likes-a[1].likes);
  // A model becomes the working standard only after five explicit ratings;
  // future calls still explore the rest of the pool.
  previous.standard=previous.ratings>=5&&ranked.length?ranked[0][0]:null;
  next[toolId]=previous;return next;
}

export function toolPreferenceScore(model,preference){
  const key=`${model?.provider||''}:${model?.id||''}`;
  const data=preference?.models?.[key];if(!data)return 0;
  return Math.max(-12,Math.min(12,(Number(data.likes||0)-Number(data.dislikes||0))*1.5));
}

export function pickToolCandidate(candidates,toolId,preferences,random=Math.random){
  if(!Array.isArray(candidates)||!candidates.length)return null;
  const preference=safeToolPreference(preferences?.[toolId]);
  const ranked=[...candidates].sort((a,b)=>toolPreferenceScore(b,preference)-toolPreferenceScore(a,preference));
  const standard=preference.standard;
  if(standard&&random()<0.7){const preferred=ranked.find(m=>`${m.provider}:${m.id}`===standard);if(preferred)return preferred;}
  // Epsilon exploration prevents a current favorite from freezing the model mix.
  if(ranked.length>1&&random()<0.25)return ranked[Math.floor(random()*Math.min(6,ranked.length))];
  return ranked[0];
}
