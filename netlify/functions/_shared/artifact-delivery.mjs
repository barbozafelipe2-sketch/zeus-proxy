// Deterministic, bounded deliverable contract. The model drafts; the server validates and saves.
const MAX_MANIFEST_CHARS=160000;
const TYPES=new Set(['pdf','docx','xlsx','pptx','csv','html']);
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const coded=(code,message)=>Object.assign(new Error(message),{code,status:422});
const pending=(message)=>coded('ARTIFACT_INCOMPLETE',message||'The requested files were not complete. No partial document was marked as delivered.');
const unfinished=/(?:\b(?:i will|we will|i can|once (?:you|the)|before (?:i|we) (?:start|proceed)|please confirm|would you like me to|i(?:'m| am) (?:starting|preparing)|as soon as|in a next step)\b|\b(?:vou (?:criar|gerar|elaborar|preparar|produzir|fazer)|irei (?:criar|gerar|preparar)|assim que (?:as|os|a|o)|por favor[, ]+confirm|confirme para (?:comecar|prosseguir)|posso (?:entao )?(?:comecar|prosseguir)|estou iniciando a elaboracao|serao disponibilizados|ficarao disponiveis|em seguida (?:vou|farei)|a seguir (?:vou|farei)|na proxima etapa)\b)/i;
// Portuguese "todo" (= whole/all) is ordinary prose; only the uppercase TODO marker is a placeholder.
const placeholders=/\b(?:lorem ipsum|tbd\b|to be completed|insert (?:details|content) here|conteudo a (?:ser )?preenchid[oa])\b/i;
const placeholderMarkers=/(?:\bTODO\b|\bTBD\b|\[(?:inserir|insert)[^\]]{0,40}\])/;
// Promise/confirmation phrases only signal unfinished work at the start or end of a document;
// inside a finished document "we will"/"na proxima etapa" are normal business prose.
const edges=(t,n=600)=>t.length<=n*2?t:t.slice(0,n)+'\n'+t.slice(-n);
function tidyTypes(types=[]){return [...new Set((Array.isArray(types)?types:[]).map(v=>String(v||'').toLowerCase()))];}
export function isArtifactContinuation(text=''){
 const t=normalize(String(text).trim());
 return t.length<=230&&/^(?:(?:por favor|please|agora|entao|then|ok|okay)[ ,.!]*)*(?:continue|continua|continuar|prossiga|prossegue|prossiga com|go ahead|proceed|finish|finalize|complete|termine|finaliza|conclua|faz agora|faca agora|faz os arquivos|gera os arquivos|generate the files|create the files|entregue os arquivos)(?:[ ,.!]*(?:a entrega|o trabalho|os arquivos|the deliverables|the files|o anterior|anterior|agora|por favor|please))*[.!?]*$/i.test(t);
}
export function deliveryContract(types=[],request=''){
 const list=tidyTypes(types).filter(t=>TYPES.has(t));
 if(!list.length)return '';
 const example={
   summary:'One sentence identifying ONLY the deliverables actually provided in this manifest',
   artifacts:list.map(type=>type==='xlsx'
     ?{type,title:'Financial projections',workbook:{sheets:[
       {name:'Inputs',rows:[['Metric','Value'],['Startup budget',50000],['Average ticket',12]]},
       {name:'Projection',rows:[['Month','Revenue','Costs','Profit'],[1,15000,12000,{formula:'B2-C2',result:3000}]]}
     ]}}
     :{type,title:'Complete deliverable',content:'# Complete document\n## Section 1\nDetailed final content with facts and assumptions.'})
 };
 return 'SERVER ARTIFACT DELIVERY CONTRACT — MUST FOLLOW. This request already authorizes creation. Do not ask for more confirmation, do not promise future files, do not output a plan to write the deliverable later. Return the COMPLETE final deliverables in one machine-readable XML-delimited JSON block: <olyhub_artifacts>JSON</olyhub_artifacts>. Outside the block, write at most one brief completion sentence. Every requested type must appear EXACTLY ONCE: '+list.join(', ')+'. The server will generate binary files from the block; you do not need direct file-writing tools. No markdown fences inside the block. Document content must be substantial, fully written, with assumptions distinguished from sourced facts; never fabricate source access. Spreadsheet workbook must have sheets with 2D rows; use numbers as numbers, formulas ONLY as {"formula":"B2-C2","result":3000} and include appropriate scenario, cashflow and assumptions tables. Do not return section outlines, promises, or partial drafts. For formulas, include a numeric result when the value can be calculated. Schema example (replace ALL example values with the actual requested work): '+JSON.stringify(example)+'. OWNER REQUEST: '+String(request||'').slice(0,2000);
}
function extractManifest(raw=''){
 const text=String(raw||'');
 const open='<olyhub_artifacts>',close='</olyhub_artifacts>';
 const start=text.indexOf(open),end=text.lastIndexOf(close);
 if(start<0||end<=start)return null;
 if(text.indexOf(open,start+open.length)>=0||text.indexOf(close,end+close.length)>=0)throw pending('Ambiguous artifact manifests were returned.');
 const inside=text.slice(start+open.length,end).trim();
 if(inside.length>MAX_MANIFEST_CHARS)throw pending('The artifact manifest exceeds the safe size budget.');
 let data;try{data=JSON.parse(inside);}catch{throw pending('The artifact manifest is not valid JSON.');}
 return {data,outside:(text.slice(0,start)+text.slice(end+close.length)).trim()};
}
function rejectUnfinished(text,{strict=false,requestText=''}={}){
 const n=normalize(text);
 if(!n.trim()||unfinished.test(strict?edges(n):n)||placeholders.test(n)||placeholderMarkers.test(String(text||'')))throw pending('The response contains placeholders, promises or a request for confirmation instead of finished work.');
 if(strict){
   const plan=/plano de negocios|business plan|plano financeiro|financial projection/i.test(normalize(requestText));
   if(text.trim().length<(plan?1750:230))throw pending('The document is too short to satisfy the requested scope.');
   if(plan){
     const headings=(text.match(/^\s*(?:#{1,3}\s|[0-9]+[.)]\s)/gm)||[]).length;
     if(headings<4||!/\d/.test(text))throw pending('The business plan has no complete sections and quantified analysis.');
   }
 }
}
const BAD_FORMULA=/\[|\]|https?:|(?:HYPERLINK|WEBSERVICE|DDE|CALL|EXEC|SHELL|CMD|IMPORTDATA|IMPORTXML)\s*\(/i;
function validateCell(cell){
 if(cell===null||typeof cell==='number'||typeof cell==='boolean')return {formula:false,content:cell};
 if(typeof cell==='string'){if(cell.length>5000)throw pending('Spreadsheet cell exceeds 5,000 characters.');return {formula:false,content:cell};}
 if(!cell||typeof cell!=='object'||Array.isArray(cell))throw pending('Spreadsheet cell is invalid.');
 const formula=String(cell.formula||'').trim().replace(/^=/,'');
 if(!formula||formula.length>220||BAD_FORMULA.test(formula)||/[^A-Za-z0-9_.'!:$,()+*\/<>=\s%&^-]/.test(formula))
   throw pending('Spreadsheet contains a disallowed formula.');
 if(!/^(?!\s*$)[\w'(]/.test(formula))throw pending('Spreadsheet formula is invalid.');
 if(cell.result!=null&&!['string','number','boolean'].includes(typeof cell.result))throw pending('Formula cached result must be a scalar.');
 return {formula:true,content:formula};
}
export function validateWorkbook(workbook,requestText=''){
 if(!workbook||typeof workbook!=='object'||!Array.isArray(workbook.sheets)||!workbook.sheets.length||workbook.sheets.length>8)throw pending('Excel workbook needs 1–8 populated sheets.');
 const used=new Set(),stats={sheets:0,rows:0,cells:0,formulas:0,monthRows:0},all=[];
 for(const sheet of workbook.sheets){
   const name=String(sheet?.name||'').trim();
   if(!name||name.length>31||/[\\/*?:\[\]]/.test(name)||used.has(name.toLowerCase()))throw pending('Spreadsheet worksheet name is missing, duplicated or invalid.');
   used.add(name.toLowerCase());
   if(!Array.isArray(sheet.rows)||sheet.rows.length<2||sheet.rows.length>3000)throw pending('A worksheet has no data or exceeds 3,000 rows.');
   stats.sheets++;stats.rows+=sheet.rows.length;stats.monthRows=Math.max(stats.monthRows,sheet.rows.length-1);
   for(const row of sheet.rows){
     if(!Array.isArray(row)||row.length>40)throw pending('Spreadsheet row is not valid or is wider than 40 columns.');
     stats.cells+=row.length;if(stats.cells>14000)throw pending('Workbook exceeds the cell budget.');
     for(const cell of row){const c=validateCell(cell);if(c.formula)stats.formulas++;else if(c.content!=null)all.push(String(c.content).toLowerCase());}
   }
 }
 const req=normalize(requestText),strings=all.join(' ')+' '+[...used].join(' ');
 if(/\b(?:formula|formulas|formulae)\b/i.test(req)&&stats.formulas<1)throw pending('Requested Excel formulas were not generated.');
 if(/\b12\s*(?:meses|months)\b/i.test(req)&&stats.monthRows<12)throw pending('The workbook lacks twelve monthly projection rows.');
 if(/(?:pessimist|pessimista)/i.test(req)&&/(?:otimist|otimista)/i.test(req)&&/(?:realist|realista)/i.test(req)){
   if(!/(?:pessimist|pessimista)/i.test(strings)||!/(?:otimist|otimista)/i.test(strings)||!/(?:realist|realista)/i.test(strings))throw pending('The workbook lacks one or more requested financial scenarios.');
 }
 return stats;
}
export function parseArtifactDelivery(raw,requested=[],{requestText=''}={}){
 const types=tidyTypes(requested);
 if(types.length>4||!types.length||types.some(t=>!TYPES.has(t)))throw coded('ARTIFACT_FORMAT_UNSUPPORTED','This requested combination of artifacts is not supported.');
 const parsed=extractManifest(raw);
 if(!parsed){
   if(types.length===1&&types[0]!=='xlsx'){
     rejectUnfinished(raw,{strict:true,requestText});
     return {artifacts:[{type:types[0],title:'Deliverable',content:String(raw)}],summary:'The requested file was generated and validated.',structured:false};
   }
   throw pending('The model did not return the complete structured file bundle.');
 }
 const items=parsed.data?.artifacts;
 if(!Array.isArray(items)||items.length!==types.length)throw pending('The model omitted one or more requested files.');
 const used=new Set(),clean=[];
 for(const item of items){
   const type=String(item?.type||'').toLowerCase();
   if(!types.includes(type)||used.has(type))throw pending('The model returned a missing, duplicate or unrequested file type.');
   used.add(type);
   const title=String(item.title||'Deliverable').slice(0,100);
   if(type==='xlsx'){
     validateWorkbook(item.workbook,requestText);
     clean.push({type,title,content:'',workbook:item.workbook});
   }else{
     const content=String(item.content||'');
     rejectUnfinished(content,{strict:true,requestText});
     clean.push({type,title,content});
   }
 }
 const summary=String(parsed.data.summary||parsed.outside||'').slice(0,600);
 // Never turn manifest chatter into an unsupported claim or follow-up question.
 return {artifacts:clean,summary:summary&&!unfinished.test(normalize(summary))?summary:'The requested files were generated and validated.',structured:true};
}
