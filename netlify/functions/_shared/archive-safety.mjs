import { inflateRawSync } from 'node:zlib';
const EOCD = 0x06054b50;
const CEN = 0x02014b50;

export const ARCHIVE_LIMITS = Object.freeze({
  generic: { maxEntries: 500, maxTotalUncompressed: 24 * 1024 * 1024, maxEntryUncompressed: 4 * 1024 * 1024, maxCompressionRatio: 150 },
  office: { maxEntries: 1600, maxTotalUncompressed: 48 * 1024 * 1024, maxEntryUncompressed: 12 * 1024 * 1024, maxCompressionRatio: 200 },
  generated: { maxEntries: 120, maxTotalUncompressed: 8 * 1024 * 1024, maxEntryUncompressed: 2 * 1024 * 1024, maxCompressionRatio: 100 },
});

function archiveError(message, code='ARCHIVE_UNSAFE', status=413) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function viewOf(input) {
  if (input instanceof Uint8Array) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw archiveError('Archive data is invalid.', 'ARCHIVE_INVALID', 400);
}

function u16(view, offset) { return view.getUint16(offset, true); }
function u32(view, offset) { return view.getUint32(offset, true); }

function findEocd(bytes) {
  if (bytes.byteLength < 22) throw archiveError('Archive is truncated.', 'ARCHIVE_INVALID', 400);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let i = bytes.byteLength - 22; i >= min; i -= 1) {
    if (u32(view, i) === EOCD) return i;
  }
  throw archiveError('ZIP end-of-central-directory record was not found.', 'ARCHIVE_INVALID', 400);
}

export function inspectZip(input, limits = ARCHIVE_LIMITS.generic) {
  const bytes = viewOf(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  const diskNo = u16(view, eocd + 4);
  const cdDisk = u16(view, eocd + 6);
  const entries = u16(view, eocd + 10);
  const cdSize = u32(view, eocd + 12);
  const cdOffset = u32(view, eocd + 16);
  if (diskNo !== 0 || cdDisk !== 0) throw archiveError('Multi-disk ZIP archives are not supported.', 'ARCHIVE_UNSUPPORTED', 415);
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw archiveError('ZIP64 archives are not supported for safety.', 'ARCHIVE_UNSUPPORTED', 415);
  if (entries > limits.maxEntries) throw archiveError(`Archive contains too many entries (${entries}; max ${limits.maxEntries}).`, 'ARCHIVE_TOO_MANY_ENTRIES');
  if (cdOffset + cdSize > bytes.byteLength || cdOffset > eocd) throw archiveError('Archive central directory is invalid.', 'ARCHIVE_INVALID', 400);

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let offset = cdOffset;
  let totalUncompressed = 0;
  const manifest = [];
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.byteLength || u32(view, offset) !== CEN) throw archiveError('Archive central directory entry is invalid.', 'ARCHIVE_INVALID', 400);
    const flags = u16(view, offset + 8);
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localHeaderOffset = u32(view, offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw archiveError('Archive entry metadata is truncated.', 'ARCHIVE_INVALID', 400);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = decoder.decode(nameBytes);
    if ((flags & 0x0001) !== 0) throw archiveError(`Encrypted archive entry is not supported: ${name || '(unnamed)'}.`, 'ARCHIVE_ENCRYPTED', 415);
    if (![0, 8].includes(method)) throw archiveError(`Unsupported ZIP compression method ${method} in ${name || '(unnamed)'}.`, 'ARCHIVE_UNSUPPORTED', 415);
    if (uncompressedSize > limits.maxEntryUncompressed) throw archiveError(`Archive entry is too large after decompression: ${name || '(unnamed)'}.`, 'ARCHIVE_ENTRY_TOO_LARGE');
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxTotalUncompressed) throw archiveError('Archive expands beyond the safe decompression budget.', 'ARCHIVE_EXPANSION_LIMIT');
    if (compressedSize > 0 && uncompressedSize >= 1024 * 1024 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
      throw archiveError(`Archive entry has a suspicious compression ratio: ${name || '(unnamed)'}.`, 'ARCHIVE_RATIO_LIMIT');
    }
    manifest.push({ name, compressedSize, uncompressedSize, method, flags, localHeaderOffset, directory: name.endsWith('/') });
    offset = end;
  }
  if (offset > cdOffset + cdSize) throw archiveError('Archive central directory length is inconsistent.', 'ARCHIVE_INVALID', 400);
  return { entries, totalUncompressed, manifest };
}

export function assertSafeZip(input, profile='generic') {
  const limits = typeof profile === 'string' ? ARCHIVE_LIMITS[profile] || ARCHIVE_LIMITS.generic : profile;
  return inspectZip(input, limits);
}


export function verifyZipEntries(input, inspection, { names=null, maxEntryOutput=null, maxTotalOutput=null }={}) {
  const bytes=viewOf(input);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const decoder=new TextDecoder('utf-8',{fatal:false});
  const selected=names?new Set(names):null;
  let total=0,verifiedEntries=0;
  for(const entry of inspection?.manifest||[]){
    if(entry.directory||(selected&&!selected.has(entry.name)))continue;
    const local=Number(entry.localHeaderOffset);
    if(!Number.isFinite(local)||local<0||local+30>bytes.byteLength||u32(view,local)!==0x04034b50)throw archiveError(`Archive local header is invalid: ${entry.name||'(unnamed)'}.`,'ARCHIVE_INVALID',400);
    const localFlags=u16(view,local+6),localMethod=u16(view,local+8);
    if((localFlags&0x0001)!==0||localMethod!==entry.method)throw archiveError(`Archive local header does not match the central directory: ${entry.name||'(unnamed)'}.`,'ARCHIVE_INVALID',400);
    const nameLength=u16(view,local+26),extraLength=u16(view,local+28);
    const localNameStart=local+30,localNameEnd=localNameStart+nameLength;
    if(localNameEnd>bytes.byteLength)throw archiveError(`Archive local filename is truncated: ${entry.name||'(unnamed)'}.`,'ARCHIVE_INVALID',400);
    const localName=decoder.decode(bytes.subarray(localNameStart,localNameEnd));
    if(localName!==entry.name)throw archiveError(`Archive local filename does not match the central directory: ${entry.name||'(unnamed)'}.`,'ARCHIVE_INVALID',400);
    const start=localNameEnd+extraLength,end=start+entry.compressedSize;
    if(start<0||end>bytes.byteLength||end<start)throw archiveError(`Archive payload is truncated: ${entry.name||'(unnamed)'}.`,'ARCHIVE_INVALID',400);
    const cap=Math.max(1,Math.min(maxEntryOutput||entry.uncompressedSize||1,ARCHIVE_LIMITS.office.maxEntryUncompressed));
    let actual;
    if(entry.method===0){actual=entry.compressedSize;}
    else{
      try{actual=inflateRawSync(Buffer.from(bytes.subarray(start,end)),{maxOutputLength:cap+1}).byteLength;}
      catch{throw archiveError(`Archive entry exceeded its safe decompression limit or is corrupt: ${entry.name||'(unnamed)'}.`,'ARCHIVE_EXPANSION_LIMIT');}
    }
    if(actual!==entry.uncompressedSize)throw archiveError(`Archive entry size does not match its declared size: ${entry.name||'(unnamed)'}.`,'ARCHIVE_SIZE_MISMATCH',400);
    if(maxEntryOutput&&actual>maxEntryOutput)throw archiveError(`Archive entry expands beyond the allowed output size: ${entry.name||'(unnamed)'}.`,'ARCHIVE_ENTRY_TOO_LARGE');
    total+=actual;verifiedEntries+=1;
    if(maxTotalOutput&&total>maxTotalOutput)throw archiveError('Archive extraction exceeds the total output budget.','ARCHIVE_EXPANSION_LIMIT');
  }
  return {verifiedEntries,totalOutput:total};
}
