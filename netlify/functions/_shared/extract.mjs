import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { isSensitiveFilename, safeExtractedText } from './security.mjs';
import { assertSafeZip, verifyZipEntries } from './archive-safety.mjs';

const decode = (buf) => new TextDecoder('utf-8', { fatal: false }).decode(buf);
const stripXml = (s) => s
  .replace(/<w:tab\/?\s*>/g, '\t')
  .replace(/<w:br\/?\s*>/g, '\n')
  .replace(/<a:br\/?\s*>/g, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();

function safe(text, filename, max = 120000) {
  return safeExtractedText(String(text || ''), filename).slice(0, max);
}

export async function extractText(buffer, mime = '', filename = '') {
  const lower = (filename || '').toLowerCase();
  if (isSensitiveFilename(lower)) return '[Sensitive configuration/credential file omitted from AI context.]';
  try {
    if (mime.startsWith('text/') || /\.(txt|md|csv|json|xml|log|ini|cfg)$/i.test(lower)) {
      return safe(decode(buffer), filename);
    }
    if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
      const mod = await import('pdf-parse');
      const parse = mod.default || mod;
      const out = await parse(Buffer.from(buffer));
      return safe(out.text || '', filename);
    }
    if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) {
      const inspection=assertSafeZip(buffer, 'office');
      verifyZipEntries(buffer,inspection,{names:['word/document.xml'],maxEntryOutput:12*1024*1024,maxTotalOutput:12*1024*1024});
      const zip = await JSZip.loadAsync(buffer);
      const xml = await zip.file('word/document.xml')?.async('string');
      return xml ? safe(stripXml(xml), filename) : '';
    }
    if (lower.endsWith('.pptx') || mime.includes('presentationml')) {
      const inspection=assertSafeZip(buffer, 'office');
      const slideNames=inspection.manifest.map(x=>x.name).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k)).sort().slice(0,100);
      verifyZipEntries(buffer,inspection,{names:slideNames,maxEntryOutput:2*1024*1024,maxTotalOutput:16*1024*1024});
      const zip = await JSZip.loadAsync(buffer);
      const slides = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort();
      const texts = [];
      for (const k of slides.slice(0, 100)) texts.push(stripXml(await zip.file(k).async('string')));
      return safe(texts.join('\n\n'), filename);
    }

    if (lower.endsWith('.zip') || mime === 'application/zip' || mime === 'application/x-zip-compressed') {
      const inspection = assertSafeZip(buffer, 'generic');
      const zip = await JSZip.loadAsync(buffer);
      const textExt = /\.(?:txt|md|json|js|mjs|cjs|ts|tsx|jsx|css|scss|html|htm|xml|yml|yaml|toml|sql|py|java|go|rs|sh|ini|cfg|csv)$/i;
      const names = inspection.manifest.map(x=>x.name).filter(Boolean)
        .filter((name) => zip.files[name] && !zip.files[name].dir && textExt.test(name) && !isSensitiveFilename(name) && !/(^|\/)(node_modules|\.git|dist|build|coverage|\.next)(\/|$)/i.test(name))
        .slice(0, 90);
      verifyZipEntries(buffer,inspection,{names,maxEntryOutput:350000,maxTotalOutput:12*1024*1024});
      const chunks = [];
      let total = 0;
      for (const name of names) {
        if (total >= 115000) break;
        const entry = zip.file(name);
        if (!entry) continue;
        const raw = await entry.async('uint8array');
        if (raw.byteLength > 350000) continue;
        const text = safe(decode(raw).replace(/\0/g, ''), name, 18000);
        if (!text.trim()) continue;
        const chunk = `FILE: ${name}\n${text}`;
        chunks.push(chunk);
        total += chunk.length;
      }
      const omittedSensitive = Object.keys(zip.files).some((name) => !zip.files[name].dir && isSensitiveFilename(name));
      if (omittedSensitive) chunks.unshift('[Sensitive credential/configuration files were omitted from AI context.]');
      return safe(chunks.join('\n\n---\n\n'), filename);
    }

    if (lower.endsWith('.xlsx') || mime.includes('spreadsheetml')) {
      const inspection=assertSafeZip(buffer,'office');
      verifyZipEntries(buffer,inspection,{maxEntryOutput:12*1024*1024,maxTotalOutput:48*1024*1024});
      const wb=new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(buffer));
      const out=[];
      for(const ws of wb.worksheets.slice(0,30)){
        out.push(`SHEET: ${ws.name}`);
        let rows=0;
        ws.eachRow({includeEmpty:false},row=>{
          if(rows>=1000)return;
          const values=(row.values||[]).slice(1).map(v=>{
            if(v==null)return '';
            if(typeof v==='object'){
              if('text' in v)return String(v.text||'');
              if('result' in v)return String(v.result??'');
              if('richText' in v)return (v.richText||[]).map(x=>x.text||'').join('');
            }
            return String(v);
          });
          out.push(values.map(v=>/[",\n]/.test(v)?`"${v.replaceAll('"','""')}"`:v).join(','));
          rows+=1;
        });
        if(out.join('\n').length>110000)break;
      }
      return safe(out.join('\n'), filename);
    }
    if(lower.endsWith('.xls')){
      return '[Legacy .xls extraction is not supported. Convert the spreadsheet to .xlsx or .csv for analysis.]';
    }
  } catch (error) {
    if (error?.code && /^ARCHIVE_/.test(error.code)) throw error;
    console.error('File extraction failed', error?.message || error);
  }
  return '';
}
