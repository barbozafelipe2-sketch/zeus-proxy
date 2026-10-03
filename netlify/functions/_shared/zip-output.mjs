function zipOutputError(message, code='ZIP_OUTPUT_INVALID') {
  const error = new Error(message);
  error.code = code;
  error.status = 422;
  return error;
}

export function safeZipPath(raw) {
  const normalized=String(raw||'').trim().replace(/\\/g,'/');
  if(!normalized||normalized.startsWith('/')||/^[A-Za-z]:\//.test(normalized))return null;
  const rawParts=normalized.split('/').map(p=>p.trim());
  if(rawParts.some(p=>p==='..'))return null;
  const clean=rawParts
    .filter((p)=>p&&p!=='.')
    .map((p)=>p.replace(/[<>:"|?*\0]+/g,'-'))
    .slice(0,10);
  const joined=clean.join('/');
  return joined&&joined.length<=180?joined:null;
}

const LANGUAGE_WORDS=new Set(['js','javascript','jsx','ts','typescript','tsx','mjs','cjs','json','html','htm','css','scss','sass','less','md','markdown','py','python','sh','bash','shell','zsh','yaml','yml','toml','xml','svg','sql','txt','text','plaintext','go','rust','rs','java','kotlin','swift','c','cpp','h','hpp','cs','php','rb','ruby','vue','svelte','dockerfile','makefile','ini','env','diff','graphql','gql','csv']);
const BARE_FILENAMES=/^(Dockerfile|Makefile|Procfile|LICENSE|README|CHANGELOG|\.gitignore|\.npmrc|\.nvmrc|\.env\.example|_redirects|_headers)$/i;

function stripDecorations(raw){
  return String(raw||'').trim()
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/,'')
    .replace(/^#{1,6}\s+/,'')
    .replace(/^(?:file(?:name)?|path|arquivo|caminho)\s*[:=]\s*/i,'')
    .replace(/^[*_`"']+|[*_`"']+$/g,'')
    .replace(/\s*[:\u2014\u2013-]\s*$/,'')
    .replace(/^[*_`"']+|[*_`"']+$/g,'')
    .trim();
}

export function looksLikeFilePath(raw){
  const value=String(raw||'').trim();
  if(!value||value.length>180||/\s/.test(value))return false;
  if(!/^[\w@.+\-/]+$/.test(value))return false;
  if(LANGUAGE_WORDS.has(value.toLowerCase()))return false;
  return BARE_FILENAMES.test(value.split('/').pop())||/\.[A-Za-z0-9]{1,10}$/.test(value)||(value.includes('/')&&!value.endsWith('/'));
}

function pathFromInfo(info){
  const text=String(info||'').trim();
  if(!text)return null;
  const attr=text.match(/\b(?:title|file(?:name)?|path)\s*=\s*["']?([^"'\s]+)["']?/i);
  if(attr&&looksLikeFilePath(attr[1]))return attr[1];
  const colon=text.match(/^[\w.+-]+:([^\s]+)$/);
  if(colon&&looksLikeFilePath(colon[1]))return colon[1];
  const tokens=text.split(/\s+/);
  if(tokens.length>1){const rest=stripDecorations(tokens.slice(1).join(' '));if(looksLikeFilePath(rest))return rest;}
  const single=stripDecorations(tokens[0]);
  return looksLikeFilePath(single)?single:null;
}

function pathFromPrecedingLines(lines,fenceIndex){
  let checked=0;
  for(let i=fenceIndex-1;i>=0&&checked<3;i--){
    const line=lines[i].trim();
    if(!line)continue;
    checked++;
    if(/^(`{3,}|~{3,})/.test(line))return null;
    const candidates=[stripDecorations(line),...(line.match(/`([^`\s]+)`/g)||[]).map(x=>x.slice(1,-1))];
    for(const c of candidates)if(looksLikeFilePath(c))return c;
    if(line.length>80)return null;
  }
  return null;
}

function pathFromFirstLine(firstLine){
  const m=String(firstLine||'').match(/^\s*(?:\/\/|#|<!--|\/\*|--)\s*(?:(?:file(?:name)?|path|arquivo)\s*:\s*)?([\w@.+\-/]+)\s*(?:-->|\*\/)?\s*$/i);
  return m&&looksLikeFilePath(m[1])&&/[./]/.test(m[1])?m[1]:null;
}

// Accepts the common ways models label files: ```lang path, ```path, ```lang title="path", ```lang:path,
// a heading / bold / backtick / "File:" line just above the fence, or a path comment on the first line.
export function filesFromModelText(title, content, { maxFiles=60, maxFileChars=300000, maxTotalChars=1600000 }={}) {
  const lines=String(content||'').replace(/\r\n?/g,'\n').split('\n');
  const files=[];
  const seen=new Set();
  let total=0,truncated=false,unlabeled=0;
  for(let i=0;i<lines.length;i++){
    const open=lines[i].match(/^\s*(`{3,}|~{3,})(.*)$/);
    if(!open)continue;
    const fence=open[1];
    let end=-1;
    for(let j=i+1;j<lines.length;j++){const close=lines[j].match(/^\s*(`{3,}|~{3,})\s*$/);if(close&&close[1][0]===fence[0]&&close[1].length>=fence.length){end=j;break;}}
    if(end<0){truncated=true;break;}
    const body=lines.slice(i+1,end);
    const rawPath=pathFromInfo(open[2])||pathFromPrecedingLines(lines,i)||pathFromFirstLine(body[0]);
    i=end;
    if(!rawPath){unlabeled++;continue;}
    const path=safeZipPath(rawPath);
    if(!path||seen.has(path))continue;
    const data=body.join('\n');
    if(data.length>maxFileChars)throw zipOutputError(`Generated file ${path} is too large.`, 'ZIP_FILE_TOO_LARGE');
    total+=data.length;
    if(total>maxTotalChars)throw zipOutputError('Generated ZIP source exceeds the safe output budget.', 'ZIP_OUTPUT_TOO_LARGE');
    seen.add(path);files.push({path,data});
    if(files.length>=maxFiles)break;
  }
  const nonReadme=files.filter(f=>f.path.toLowerCase()!=='readme.md');
  // Never ship a silently partial project: a cut-off answer fails loudly (chat keeps the text so nothing is lost).
  if(truncated)throw zipOutputError('The AI response was cut off before the project files were complete, so no ZIP was created. Retry, or ask for a smaller project (fewer files) so it fits in one response.', 'ZIP_OUTPUT_TRUNCATED');
  if(!files.length||!nonReadme.length){
    throw zipOutputError(`The model did not return a valid multi-file ZIP manifest${unlabeled?` (${unlabeled} code block${unlabeled===1?'':'s'} had no file name)`:''}. Retry the request so OlyHub can generate real files instead of an empty archive.`, 'ZIP_MANIFEST_MISSING');
  }
  if(!seen.has('README.md'))files.unshift({path:'README.md',data:`# ${String(title||'OlyHub Output').trim()||'OlyHub Output'}\n\nGenerated by OlyHub. Files in this archive were validated from explicit fenced file blocks.`});
  return files;
}
