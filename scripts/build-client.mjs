import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const agentOutput=resolve(root,'public/assets/elevenlabs-agent.js');
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
