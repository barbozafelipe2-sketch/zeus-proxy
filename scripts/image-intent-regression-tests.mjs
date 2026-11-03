import assert from 'node:assert/strict';
import {classifyIntent} from '../netlify/functions/_shared/intent.mjs';
const chat=['Faz tudo e resolve isso que manda um texto e ele quer criar imagem','Analise por que o app tenta criar imagem','Explique como criar uma imagem','Eu disse para não gerar imagem','Can you explain image generation?','Crie um documento sobre imagens'];
for(const text of chat)assert.notEqual(classifyIntent(text).action,'IMAGE_CREATE',text);
for(const text of ['Crie uma imagem de um gato','Generate an image of a cat','Edite esta foto','Quero uma imagem de uma praia'])assert.ok(['IMAGE_CREATE','IMAGE_EDIT'].includes(classifyIntent(text,{hasImage:true}).action),text);
console.log('Image intent regression checks passed');