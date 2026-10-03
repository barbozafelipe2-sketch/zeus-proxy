export function normalizePdfPunctuation(value){
  return String(value||'')
    .replace(/[\u2018\u2019]/g,"'")
    .replace(/[\u201c\u201d]/g,'"')
    .replace(/[\u2013\u2014]/g,'-')
    .replace(/\u2026/g,'...')
    .replace(/\u00a0/g,' ');
}

export function pdfSafeText(font,value){
  let out='';
  for(const ch of normalizePdfPunctuation(value).normalize('NFC')){
    try{font.encodeText(ch);out+=ch;}
    catch{
      if(/\p{Extended_Pictographic}/u.test(ch))out+='[emoji]';
      else out+='?';
    }
  }
  return out;
}

export function splitPdfToken(font,token,size,maxWidth){
  const parts=[];let current='';
  for(const ch of token){
    const next=current+ch;
    if(current && font.widthOfTextAtSize(next,size)>maxWidth){parts.push(current);current=ch;}
    else current=next;
  }
  if(current)parts.push(current);
  return parts.length?parts:[''];
}

export function wrapPdfText(font,value,size,maxWidth){
  const text=pdfSafeText(font,value);
  if(!text)return [''];
  const words=text.split(/\s+/).filter(Boolean);
  const output=[];let current='';
  for(const word of words){
    const pieces=font.widthOfTextAtSize(word,size)>maxWidth?splitPdfToken(font,word,size,maxWidth):[word];
    for(const piece of pieces){
      const candidate=current?`${current} ${piece}`:piece;
      if(current && font.widthOfTextAtSize(candidate,size)>maxWidth){output.push(current);current=piece;}
      else current=candidate;
    }
  }
  if(current)output.push(current);
  return output.length?output:[''];
}
