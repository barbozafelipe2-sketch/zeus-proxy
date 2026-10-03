export const ARTIFACT_INPUT_LIMITS=Object.freeze({
  pdf:{maxChars:100000,maxLines:5000},
  docx:{maxChars:90000,maxLines:3000},
  pptx:{maxChars:24000,maxLines:180},
  xlsx:{maxChars:80000,maxLines:5000},
  csv:{maxChars:120000,maxLines:10000},
  md:{maxChars:120000,maxLines:10000},
  zip:{maxChars:120000,maxLines:12000},
});
export const MAX_ARTIFACT_BYTES=12*1024*1024;

function artifactLimitError(message,code='ARTIFACT_TOO_LARGE'){
  const error=new Error(message);error.code=code;error.status=413;return error;
}

export function validateArtifactInput(type,content){
  const normalized=String(type||'md').toLowerCase();
  const text=String(content||'');
  const limits=ARTIFACT_INPUT_LIMITS[normalized]||ARTIFACT_INPUT_LIMITS.md;
  if(text.length>limits.maxChars)throw artifactLimitError(`${normalized.toUpperCase()} content exceeds the safe ${limits.maxChars.toLocaleString()} character limit.`);
  const lineCount=text?text.split(/\r?\n/).length:0;
  if(lineCount>limits.maxLines)throw artifactLimitError(`${normalized.toUpperCase()} content has too many rows/paragraphs/lines for one synchronous artifact (${lineCount}; max ${limits.maxLines}).`,'ARTIFACT_STRUCTURE_LIMIT');
  return {normalized,lineCount,maxChars:limits.maxChars,maxLines:limits.maxLines};
}

export function assertArtifactOutputSize(type,byteLength){
  if(Number(byteLength)>MAX_ARTIFACT_BYTES){
    const error=artifactLimitError(`Generated ${String(type||'artifact').toUpperCase()} artifact exceeds the safe 12 MB output limit.`,'ARTIFACT_OUTPUT_TOO_LARGE');
    throw error;
  }
}
