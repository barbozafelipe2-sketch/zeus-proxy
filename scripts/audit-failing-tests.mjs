// Diagnostic only: surface all failing checks when npm test stops at its first error.
// Does not replace npm test or the fail-closed release gate.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const steps=String(pkg.scripts.test||'').split(' && ').map(s=>s.trim()).filter(Boolean)
 .filter(s=>s!=='node scripts/build-client.mjs'&&s!=='node scripts/verify.mjs');
let failed=0;let checked=0;
for(const command of steps){
 const args=command.split(' ');
 if(args[0]!=='node')throw new Error('Unsupported audit command: '+command);
 const result=spawnSync(process.execPath,args.slice(1),{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
 checked++;
 if(result.status!==0){
  failed++;
  const output=(String(result.stdout||'')+'\n'+String(result.stderr||'')).trim();
  console.error('\nFAIL '+command+'\n'+output.slice(-2500));
 }else{
  console.log('PASS '+command);
 }
}
console.log('\nAudit summary: '+(checked-failed)+'/'+checked+' checks passed; '+failed+' failed.');
if(failed)process.exitCode=1;
