import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';
import { blobStore } from './blob.mjs';
import { safeFilename } from './http.mjs';
import { assertSafeZip, verifyZipEntries } from './archive-safety.mjs';
import { filesFromModelText } from './zip-output.mjs';
import { queueBlobGc } from './storage.mjs';
import { wrapPdfText } from './pdf-layout.mjs';

function lines(text) { return String(text || '').replace(/\r/g,'').split('\n'); }

import { validateArtifactInput, assertArtifactOutputSize } from './artifact-limits.mjs';
import { validateWorkbook } from './artifact-delivery.mjs';

async function pdfBytes(title, content) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [612,792];
  const left=50,right=50,top=740,bottom=55,maxWidth=pageSize[0]-left-right;
  let page = pdf.addPage(pageSize); let y = top;
  const nextPage=()=>{page=pdf.addPage(pageSize);y=top;};
  const drawWrapped=(value,{useFont=font,size=10.5,lineHeight=15,color=rgb(0.16,0.18,0.22),after=0}={})=>{
    for(const line of wrapPdfText(useFont,value,size,maxWidth)){
      if(y<bottom+lineHeight)nextPage();
      page.drawText(line||' ',{x:left,y,size,font:useFont,color});
      y-=lineHeight;
    }
    y-=after;
  };
  drawWrapped(title||'OlyHub Output',{useFont:bold,size:20,lineHeight:25,color:rgb(0.1,0.1,0.12),after:9});
  for (const raw of lines(content)) {const line=String(raw||'');if(/^#{1,2}\s+/.test(line))drawWrapped(line.replace(/^#{1,2}\s+/,''),{useFont:bold,size:14,lineHeight:19,color:rgb(0.11,0.12,0.15),after:5});else if(/^[-*]\s+/.test(line))drawWrapped(`- ${line.replace(/^[-*]\s+/, '')}`,{after:3});else drawWrapped(line,{after:line?4:2});}
  return await pdf.save();
}

async function docxBytes(title, content) {
  const children = [new Paragraph({text:title,heading:HeadingLevel.TITLE})];
  for (const l of lines(content)) {const line=String(l||'');if(/^#\s+/.test(line))children.push(new Paragraph({text:line.replace(/^#\s+/,''),heading:HeadingLevel.HEADING_1}));else if(/^##\s+/.test(line))children.push(new Paragraph({text:line.replace(/^##\s+/,''),heading:HeadingLevel.HEADING_2}));else if(/^[-*]\s+/.test(line))children.push(new Paragraph({text:line.replace(/^[-*]\s+/,''),bullet:{level:0}}));else children.push(new Paragraph({text:line||' '}));}
  const doc = new Document({sections:[{children}]});
  return new Uint8Array(await Packer.toBuffer(doc));
}

async function pptxBytes(title, content) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const chunks = lines(content).filter(Boolean);
  let idx = 0;
  while (idx < Math.max(1,chunks.length)) {
    const slide = pptx.addSlide();
    slide.background = {color:'0B0F14'};
    slide.addText(idx===0?title:`${title} — ${Math.floor(idx/6)+1}`, {x:0.6,y:0.45,w:12,h:0.5,fontFace:'Aptos Display',fontSize:24,bold:true,color:'E9C56A'});
    const body = chunks.slice(idx, idx+6).join('\n\n') || content;
    slide.addText(body, {x:0.75,y:1.2,w:11.8,h:5.4,fontFace:'Aptos',fontSize:16,color:'F4F6F8',breakLine:false,margin:0.08,valign:'top'});
    idx += 6;
    if (!chunks.length) break;
  }
  return new Uint8Array(await pptx.write({outputType:'arraybuffer'}));
}

async function xlsxBytes(title, content, workbook) {
  // Structured workbook: strings remain text, formulas are intentional typed cells.
  validateWorkbook(workbook);
  const wb = new ExcelJS.Workbook();
  wb.creator='Zeus Proxy';wb.created=new Date();
  for(const spec of workbook.sheets){
    const ws=wb.addWorksheet(spec.name);
    ws.views=[{state:'frozen',ySplit:1}];
    for(const values of spec.rows){
      const row=ws.addRow(values.map(cell=>cell&&typeof cell==='object'&&!Array.isArray(cell)&&typeof cell.formula==='string'
        ?{formula:cell.formula.trim().replace(/^=/,''),...(cell.result!=null?{result:cell.result}:{})}
        :cell));
      values.forEach((cell,index)=>{
        if(cell&&typeof cell==='object'&&!Array.isArray(cell)&&cell.numFmt&&/^[#0$€£.,;%() _-]{1,64}$/.test(String(cell.numFmt))){
          row.getCell(index+1).numFmt=cell.numFmt;
        }
      });
    }
    ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
    ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF18212F'}};
    ws.getRow(1).alignment={vertical:'middle',wrapText:true};
    ws.getRow(1).height=30;
    const widths=Array.isArray(spec.columnWidths)?spec.columnWidths:[];
    for(let col=1;col<=Math.min(40,Math.max(...spec.rows.map(r=>r.length),1));col++){
      ws.getColumn(col).width=Math.max(10,Math.min(55,Number(widths[col-1])||22));
    }
    ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(2,spec.rows.length),column:Math.max(1,spec.rows[0].length)}};
  }
  const bytes=new Uint8Array(await wb.xlsx.writeBuffer());
  // Ensure the bytes produced are a readable Excel workbook, not a text dump renamed .xlsx.
  const readback=new ExcelJS.Workbook();
  await readback.xlsx.load(Buffer.from(bytes));
  if(readback.worksheets.length!==workbook.sheets.length)throw Object.assign(new Error('Workbook validation failed.'),{code:'ARTIFACT_VERIFICATION_FAILED',status:422});
  return bytes;
}

async function zipBytes(title, content) {
  const files=filesFromModelText(title, content);
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.data);
  const bytes=new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions:{level:6} }));
  const inspection=assertSafeZip(bytes,'generated');
  const generatedNames=new Set(inspection.manifest.filter(x=>!x.directory).map(x=>x.name));
  for(const file of files) if(!generatedNames.has(file.path)){const e=new Error(`Generated ZIP verification failed for ${file.path}.`);e.code='ZIP_VERIFICATION_FAILED';e.status=422;throw e;}
  verifyZipEntries(bytes,inspection,{names:files.map(f=>f.path),maxEntryOutput:2*1024*1024,maxTotalOutput:8*1024*1024});
  return bytes;
}


async function artifactBytes(type, title, content, workbook=null) {
  const normalized = String(type || '').toLowerCase();
  validateArtifactInput(normalized,content);
  let bytes, mime, ext;
  if (normalized === 'pdf') { bytes=await pdfBytes(title,content); mime='application/pdf'; ext='pdf'; }
  else if (normalized === 'docx') { bytes=await docxBytes(title,content); mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'; ext='docx'; }
  else if (normalized === 'pptx') { bytes=await pptxBytes(title,content); mime='application/vnd.openxmlformats-officedocument.presentationml.presentation'; ext='pptx'; }
  else if (normalized === 'xlsx') { bytes=await xlsxBytes(title,content,workbook); mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; ext='xlsx'; }
  else if (normalized === 'html') { bytes=new TextEncoder().encode(content); mime='text/html'; ext='html'; }
  else if (normalized === 'csv') { bytes=new TextEncoder().encode(content); mime='text/csv'; ext='csv'; }
  else if (normalized === 'zip') { bytes=await zipBytes(title,content); mime='application/zip'; ext='zip'; }
  else { bytes=new TextEncoder().encode(content); mime='text/markdown'; ext='md'; }
  assertArtifactOutputSize(normalized,bytes.byteLength);
  if(normalized==='pdf'){
    // Structural verification before uploading to Blob storage.
    const loaded=await PDFDocument.load(bytes);
    if(loaded.getPageCount()<1)throw Object.assign(new Error('Empty PDF.'),{code:'ARTIFACT_VERIFICATION_FAILED',status:422});
  }
  return { normalized, bytes, mime, ext };
}

export async function stageArtifact({ ownerId, type, title, content, workbook=null, metadata=null, provenance=null }) {
  const { normalized, bytes, mime, ext } = await artifactBytes(type,title,content,workbook);
  const filename = safeFilename(`${title || 'OlyHub Output'}.${ext}`);
  const blobKey = `${ownerId}/${crypto.randomUUID()}/${filename}`;
  await blobStore('olyhub-artifacts').set(blobKey, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength));
  return {
    type: normalized, mimeType: mime, filename, blobKey, size: bytes.byteLength,
    metadata: metadata || {title}, provenance: provenance || {generator:'olyhub'}
  };
}

export async function stageBinaryArtifact({ ownerId, type='binary', mimeType='application/octet-stream', filename='OlyHub-output.bin', bytes, metadata={}, provenance={} }) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const safe = safeFilename(filename);
  const blobKey = `${ownerId}/${crypto.randomUUID()}/${safe}`;
  await blobStore('olyhub-artifacts').set(blobKey, data.buffer.slice(data.byteOffset, data.byteOffset+data.byteLength));
  return { type, mimeType, filename:safe, blobKey, size:data.byteLength, metadata, provenance };
}

export async function discardStagedArtifact(staged) {
  if (!staged?.blobKey) return true;
  try { await blobStore('olyhub-artifacts').delete(staged.blobKey); return true; } catch { return false; }
}


export async function buildArtifact({ db, ownerId, type, title, content, projectId=null, conversationId=null, executionId=null }) {
  const staged = await stageArtifact({ ownerId, type, title, content });
  try {
    const [row] = await db.sql`
      INSERT INTO artifacts (owner_id, project_id, conversation_id, execution_id, type, mime_type, filename, blob_key, size, metadata, provenance)
      VALUES (${ownerId}, ${projectId}, ${conversationId}, ${executionId}, ${staged.type}, ${staged.mimeType}, ${staged.filename}, ${staged.blobKey}, ${staged.size}, ${staged.metadata}, ${staged.provenance})
      RETURNING id, project_id, conversation_id, type, mime_type, filename, size, version, created_at
    `;
    return {...row, downloadUrl:`/api/artifact-download?id=${row.id}`};
  } catch (error) {
    const removed=await discardStagedArtifact(staged);
    if(!removed){try{await queueBlobGc(db,ownerId,'olyhub-artifacts',staged.blobKey,'failed-artifact');}catch{}}
    throw error;
  }
}
