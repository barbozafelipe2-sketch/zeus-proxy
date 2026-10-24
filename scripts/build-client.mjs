import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const agentOutput=resolve(root,'public/assets/elevenlabs-agent.js');
const workletDirectory=resolve(root,'public/assets/elevenlabs-worklets');
await mkdir(dirname(agentOutput),{recursive:true});
await build({
  entryPoints:[resolve(root,'src/elevenlabs-agent.js')],
  outfile:agentOutput,
  bundle:true,
  minify:true,
  format:'esm',
  platform:'browser',
  target:['es2022'],
  legalComments:'eof',
  conditions:['browser','module'],
});

await mkdir(workletDirectory,{recursive:true});
for(const [processor,filename] of [['rawAudioProcessor','raw-audio-processor.js'],['audioConcatProcessor','audio-concat-processor.js']]){
  const generated=resolve(root,`node_modules/@elevenlabs/client/dist/platform/web/${processor}.generated.js`);
  const source=await readFile(generated,'utf8');
  const marker=`createWorkletModuleLoader("${processor}",`;
  const templateStart=source.indexOf('`',source.indexOf(marker));
  const templateEnd=source.lastIndexOf('`);');
  if(templateStart<0||templateEnd<=templateStart)throw new Error(`Could not extract ElevenLabs ${processor} worklet from the installed SDK.`);
  const worklet=source.slice(templateStart+1,templateEnd);
  if(!worklet.includes(`registerProcessor("${processor}"`))throw new Error(`ElevenLabs ${processor} worklet source is incomplete.`);
  await writeFile(resolve(workletDirectory,filename),worklet);
}
await copyFile(
  resolve(root,'node_modules/@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js'),
  resolve(workletDirectory,'libsamplerate.worklet.js'),
);
await copyFile(resolve(root,'node_modules/@elevenlabs/client/LICENSE'),resolve(workletDirectory,'LICENSE.elevenlabs.txt'));
await copyFile(resolve(root,'node_modules/@alexanderolsen/libsamplerate-js/LICENSE.md'),resolve(workletDirectory,'LICENSE.libsamplerate.md'));
