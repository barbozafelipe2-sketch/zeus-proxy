import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // The bundled TypeScript API avoids a silent --showConfig result from the
  // CLI subprocess in the deployment build container. `npm run typecheck`
  // remains an explicit release gate.
  experimental: {useTypeScriptCli: false},
};

export default nextConfig;
