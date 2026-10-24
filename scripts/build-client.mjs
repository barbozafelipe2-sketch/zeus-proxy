import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'public/assets/elevenlabs-scribe.js');
const worklet=resolve(root,'public/vendor/elevenlabs/scribeAudioProcessor.js');
await mkdir(dirname(output),{recursive:true});
await mkdir(dirname(worklet),{recursive:true});
await build({
  entryPoints:[resolve(root,'src/elevenlabs-scribe.js')],
  outfile:output,
  bundle:true,
  minify:true,
  format:'esm',
  platform:'browser',
  target:['es2022'],
  legalComments:'eof',
  conditions:['browser','module'],
});
await copyFile(resolve(root,'node_modules/@elevenlabs/client/worklets/scribeAudioProcessor.js'),worklet);
