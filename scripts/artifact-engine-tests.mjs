import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {artifactTypesFromText,classifyIntent} from '../netlify/functions/_shared/intent.mjs';
import {deliveryContract,parseArtifactDelivery,isArtifactContinuation,validateWorkbook} from '../netlify/functions/_shared/artifact-delivery.mjs';
const request='Crie plano de negócios PDF e Excel com 12 meses, fórmulas e cenários pessimista, realista e otimista.';
assert.deepEqual(artifactTypesFromText(request),['pdf','xlsx']);
assert.deepEqual(classifyIntent(request).artifactTypes,['pdf','xlsx']);
assert.match(deliveryContract(['pdf','xlsx'],request),/Do not ask for more confirmation/);
for(const word of ['Continuar','gera os arquivos','Continue','go ahead'])assert.equal(isArtifactContinuation(word),true);
assert.equal(isArtifactContinuation('How are you?'),false);
const doc='# Business plan\n'+['## Market','Miami demand estimates and competition considerations.','## Costs','Startup budget $50000. Equipment $16000, rent deposit $9000, building $14000, licenses $3000, buffer $8000.','## Operations','Ticket $12, 120 customers a day, taxes and insurance are illustrative assumptions.','## Projections','Revenue estimated $18000 and costs $16500, profit $1500.','## Marketing','90-day launch: research, opening, acquisition, retention and verification.','## Risks','Rent inflation, staffing changes, demand reduction and supplier shortages.','## Timeline','Permits, lease negotiations, training, launch and weekly tracking.'].join('\n')+'\n'+('Confirm all regional licensing and sales assumptions before investment. '.repeat(38));
const workbook={sheets:[{name:'Inputs',rows:[['Metric','Value'],['Budget',50000]]},{name:'Scenarios',rows:[['Scenario','Revenue'],['Pessimista',9000],['Realista',16000],['Otimista',22000]]},{name:'Projection',rows:[['Month','Revenue','Costs','Profit'],...Array.from({length:12},(_,i)=>[i+1,18000+i*500,16500,{formula:'B'+(i+2)+'-C'+(i+2),result:1500+i*500}])]}]};
const raw='<olyhub_artifacts>'+JSON.stringify({summary:'Files complete',artifacts:[{type:'pdf',title:'Business plan',content:doc},{type:'xlsx',title:'12 months',workbook}]})+'</olyhub_artifacts>';
assert.deepEqual(parseArtifactDelivery(raw,['pdf','xlsx'],{requestText:request}).artifacts.map(x=>x.type),['pdf','xlsx']);
assert.equal(validateWorkbook(workbook,request).formulas,12);
for(const v of ['Vou gerar os arquivos assim que confirmar.','Please confirm before I start.','Em seguida vou preparar o PDF'])assert.throws(()=>parseArtifactDelivery(v,['pdf'],{requestText:request}),e=>e.code==='ARTIFACT_INCOMPLETE');
assert.throws(()=>parseArtifactDelivery('<olyhub_artifacts>{bad}</olyhub_artifacts>',['pdf','xlsx'],{requestText:request}),e=>e.code==='ARTIFACT_INCOMPLETE');
assert.throws(()=>parseArtifactDelivery(raw,['pdf','docx'],{requestText:request}),e=>e.code==='ARTIFACT_INCOMPLETE');
assert.throws(()=>validateWorkbook({sheets:[{name:'NoData',rows:[['Header'],['Data']]}]},request),e=>e.code==='ARTIFACT_INCOMPLETE');
assert.throws(()=>validateWorkbook({sheets:[{name:'Attack',rows:[['X','Y'],['bad',{formula:'HYPERLINK("https://evil")'}]]}]},'Excel'),e=>e.code==='ARTIFACT_INCOMPLETE');
const chat=readFileSync('netlify/functions/chat.mjs','utf8'),artifact=readFileSync('netlify/functions/_shared/artifact.mjs','utf8'),ui=readFileSync('public/app.js','utf8');
assert.ok(chat.includes('parseArtifactDelivery(result.content,requestedArtifacts')&&chat.includes('for(const file of bundle.artifacts)'));
assert.ok(chat.includes('await finalizeTurn({db,')&&chat.includes('isArtifactContinuation(content)'));
assert.ok(artifact.includes('validateWorkbook(workbook)')&&artifact.includes('readback.xlsx.load(Buffer.from(bytes))'));
assert.ok(ui.includes('<details class="message-debug">'));
assert.ok(ui.includes('Message '+'$'+'{composerMode}'));
console.log('Artifact Engine multi-file validation and continuation: PASS');
// fix-v2: Portuguese prose regressions (ref 6688a54d)
{
  const m=await import('../netlify/functions/_shared/artifact-delivery.mjs');
  const e=await import('../netlify/functions/_shared/execution-error.mjs');
  const body='1. Decisão sobre todo o portfólio com 12 dados verificáveis. '.repeat(15);
  const doc='# Resumo executivo\n'+body+' Na próxima etapa a empresa expande. '+body;
  m.parseArtifactDelivery(doc,['pdf'],{requestText:'resumo executivo'});
  let threw=false;try{m.parseArtifactDelivery('TODO '+doc,['pdf'],{requestText:'x'});}catch(x){threw=x.code==='ARTIFACT_INCOMPLETE';}
  if(!threw)throw new Error('uppercase TODO marker must still be rejected');
  threw=false;try{m.parseArtifactDelivery('Vou criar os arquivos. '+doc,['pdf'],{requestText:'x'});}catch(x){threw=true;}
  if(!threw)throw new Error('leading promise must still be rejected');
  for(const code of ['ARTIFACT_INCOMPLETE','AI_RATE_LIMIT','OLYMPUS_CREATOR_UNAVAILABLE']){
    const f=e.publicExecutionFailure(Object.assign(new Error('raw secret sk-xyz'),{code,status:422}));
    if(/Zeus could not complete/.test(f.message)||/sk-xyz/.test(f.message))throw new Error('generic/leaky message for '+code);
  }
  console.log('fix-v2 artifact prose + actionable error mapping: PASS');
}
