import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAiRoute,cheapestPricedRouter,obviousFreeRoute,aiRouteFor} from '../netlify/functions/_shared/ai-router.mjs';
test('validated route response only',()=>{assert.equal(parseAiRoute('{"route":"coding"}'),'coding');assert.equal(parseAiRoute('{"route":"invalid"}'),null);assert.equal(parseAiRoute('no'),null)});
test('select cheapest known priced candidate',()=>{const models=[{id:'one',roles:['general']},{id:'two',roles:['chat']},{id:'three',roles:['vision']}];assert.equal(cheapestPricedRouter(models,id=>id==='one'?{in:2,out:8}:id==='two'?{in:0.2,out:1}:null).id,'two');});

test('obvious single-turn messages use zero paid router calls',async()=>{
  for(const value of ['Oi','hello!','Obrigado','Hola','ok']){
    assert.equal(obviousFreeRoute(value),'fast');
    const result=await aiRouteFor(value,{budget:{canCall:()=>{throw Error('paid route reached')}}});
    assert.equal(result.source,'obvious_free');
  }
  for(const value of ['Audit the backend','Fix JavaScript bug','Write a report'])assert.equal(obviousFreeRoute(value),null);
});
test('unavailable budget falls back without a provider call',async()=>{
  const result=await aiRouteFor('Audit the backend',{budget:{canCall:()=>false}});
  assert.equal(result.source,'rules_fallback');
});
test('exclude models with unknown or negative prices',()=>{
  const models=[{id:'unknown',roles:['chat']},{id:'negative',roles:['fast']},{id:'priced',roles:['general']}];
  const result=cheapestPricedRouter(models,id=>id==='priced'?{in:0.5,out:1}:id==='negative'?{in:-1,out:0}:null);
  assert.equal(result.id,'priced');
});
