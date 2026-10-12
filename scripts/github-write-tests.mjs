import assert from 'node:assert/strict';
import JSZip from 'jszip';

globalThis.Netlify={env:{get:()=>''}};
const mod=await import('../netlify/functions/_shared/github-write.mjs');

assert.equal(mod.normalizeGitBranch('main'),'main');
assert.equal(mod.normalizeGitBranch('release/next'),'release/next');
assert.throws(()=>mod.normalizeGitBranch('../main'),e=>e?.code==='GITHUB_BRANCH_INVALID');
assert.throws(()=>mod.normalizeGitBranch('bad branch'),e=>e?.code==='GITHUB_BRANCH_INVALID');

const zip=new JSZip();zip.file('src/app.js',"export const ok=true;\n");zip.file('README.md','# Demo\n');
const bytes=new Uint8Array(await zip.generateAsync({type:'uint8array'}));
const files=await mod.extractCommitFilesFromZip(bytes);
assert.deepEqual(files.map(x=>x.path).sort(),['README.md','src/app.js']);

const secretZip=new JSZip();secretZip.file('.env','OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz\n');
const secretBytes=new Uint8Array(await secretZip.generateAsync({type:'uint8array'}));
await assert.rejects(()=>mod.extractCommitFilesFromZip(secretBytes),e=>['GITHUB_SENSITIVE_PATH','GITHUB_SECRET_DETECTED'].includes(e?.code));

const tokenZip=new JSZip();tokenZip.file('config.txt','API_KEY=sk-abcdefghijklmnopqrstuvwxyz\n');
const tokenBytes=new Uint8Array(await tokenZip.generateAsync({type:'uint8array'}));
await assert.rejects(()=>mod.extractCommitFilesFromZip(tokenBytes),e=>e?.code==='GITHUB_SECRET_DETECTED');

console.log('GitHub write tests: PASS');
