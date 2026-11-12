import {test,expect} from '@playwright/test';
import {systemDoctor} from '../../netlify/functions/_shared/system-doctor.mjs';
const health={capabilities:{chat:true,projects:true,files:true,artifacts:true},goLive:{database:true},providerReadiness:{openai:{configured:true,status:'configured_unverified'}},monthlyBudget:{available:true,executionCount:1,pricedExecutionCount:1,knownTextUsd:0.002,unpricedExecutionCount:0,unknownCostExecutionCount:0},storageMaintenance:{skipped:true},queueDiagnostics:{inspected:1,active:0,expired:1}};
health.doctor=systemDoctor(health,'2026-11-12T12:00:00Z');
async function mockApp(page){
  const writes=[];let failHealth=false;
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()!=='GET'){writes.push(path);return route.fulfill({status:405,json:{error:'Writes forbidden in this browser test'}});}
    if(path==='/api/health')return route.fulfill(failHealth?{status:503,json:{error:'Unavailable'}}:{json:health});
    if(path==='/api/chat')return route.fulfill({json:{conversation:{id:'test-chat'},messages:[{id:'answer',role:'assistant',content:'Resposta de teste',metadata:{traceCalls:[{stage:'answer',provider:'openai',model:'gpt-4.1-mini',outcome:'success',transport:'gateway',durationMs:42},{stage:'retry',provider:'openai',model:'gpt-4.1-mini',outcome:'failure',transport:'gateway'}],usage:{estimateCoverage:'partial',estimatedUsd:0.002,callsUsed:2,byRole:[{role:'answer',provider:'openai',model:'gpt-4.1-mini',outcome:'success',inputTokens:1000,outputTokens:1000,estimatedUsd:0.002,costKnown:true},{role:'retry',provider:'openai',model:'gpt-4.1-mini',outcome:'failure',inputTokens:null,outputTokens:null,estimatedUsd:null,costKnown:false}]}}}],artifacts:[]}});
    return route.fulfill({json:{conversations:[],projects:[],files:[],artifacts:[],memories:[],preferences:{},connections:[],jobs:[]}});
  });
  return {writes,failHealth:()=>{failHealth=true;}};
}
async function settings(page){
  if(await page.locator('#hamburger').isVisible())await page.locator('#hamburger').click();
  await page.locator('[data-tab="Settings"]:visible').first().click();
  await expect(page.locator('#system-doctor')).toBeVisible();
}
test('Doctor separates configuration, failures and missing evidence; refresh has no writes',async({page})=>{
  const mock=await mockApp(page);await page.goto('/');await settings(page);
  const card=page.locator('#system-doctor');
  await expect(card).toContainText('Há bloqueios');await expect(card).toContainText('NÃO TESTADO');await expect(card).toContainText('DESCONHECIDO');
  await card.getByRole('button',{name:'Atualizar diagnóstico'}).click();
  await expect(card.getByRole('button')).toBeEnabled();expect(mock.writes).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('Failed refresh preserves dated evidence and offers retry',async({page})=>{
  const mock=await mockApp(page);await page.goto('/');await settings(page);mock.failHealth();
  await page.locator('#refresh-doctor').click();await expect(page.locator('#system-doctor')).toContainText('evidências anteriores foram preservadas');
  await expect(page.locator('#system-doctor')).toContainText('Atualizado:');await expect(page.locator('#refresh-doctor')).toBeEnabled();expect(mock.writes).toEqual([]);
});
test('Trace Lab shows per-attempt estimate and unknown failed cost after reload',async({page})=>{
  const mock=await mockApp(page);await page.goto('/?conversation=test-chat');
  const trace=page.locator('details').filter({has:page.locator('summary', {hasText:'Trace Lab'})});
  await trace.locator('summary').click();await expect(trace).toContainText('US$0.002000');await expect(trace).toContainText('Custo desconhecido');
  await page.reload();await trace.locator('summary').click();await expect(trace).toContainText('US$0.002000');expect(mock.writes).toEqual([]);
});
