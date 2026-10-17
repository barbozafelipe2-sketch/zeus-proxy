import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAiRoute,cheapestPricedRouter} from '../netlify/functions/_shared/ai-router.mjs';
test('validated route response only',()=>{assert.equal(parseAiRoute('{"route":"coding"}'),'coding');assert.equal(parseAiRoute('{"route":"invalid"}'),null);assert.equal(parseAiRoute('no'),null)});
test('select cheapest known priced candidate',()=>{const models=[{id:'one',roles:['general']},{id:'two',roles:['chat']},{id:'three',roles:['vision']}];assert.equal(cheapestPricedRouter(models,id=>id==='one'?{in:2,out:8}:id==='two'?{in:0.2,out:1}:null).id,'two');});
