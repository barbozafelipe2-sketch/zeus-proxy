import assert from 'node:assert/strict';
import { decideExecutionMode, decideExecutionLevel, classifyIntent } from '../netlify/functions/_shared/intent.mjs';
const complex='Faça uma auditoria completa de segurança e arquitetura do backend e banco de dados';
assert.equal(decideExecutionMode(complex,{requestedMode:'ZEUS'}).mode,'ZEUS');
assert.equal(decideExecutionMode(complex,{requestedMode:'ZEUS',olympusAuto:true}).mode,'OLYMPUS');
assert.equal(decideExecutionMode('Oi',{requestedMode:'ZEUS',olympusAuto:true}).mode,'ZEUS');
assert.equal(decideExecutionMode('Oi',{requestedMode:'OLYMPUS',olympusAuto:false}).mode,'OLYMPUS');
assert.equal(decideExecutionMode(complex,{requestedMode:'ZEUS',olympusAuto:'true'}).mode,'ZEUS');
for(const mode of ['ZEUS','OLYMPUS']) {
  const intent=classifyIntent('Crie uma imagem de um jardim');
  const decision=decideExecutionMode('Crie uma imagem de um jardim',{requestedMode:mode,olympusAuto:true,action:intent.action});
  const image=decideExecutionLevel('Crie uma imagem de um jardim',{mode:decision.mode,action:intent.action});
  assert.equal(image.mode,'ZEUS'); assert.equal(image.level,'COMPOUND'); assert.equal(image.maxCalls,1);
}
const text=decideExecutionLevel('Corrija este bug',{mode:'ZEUS',route:'coding'});
assert.equal(text.level,'COMPOUND');assert.equal(text.maxCalls,2);
console.log('Automatic On/Off, manual override, complexity and image L2 exception: PASS');
