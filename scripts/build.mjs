import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist/', import.meta.url);

// A clean export contains only the runtime files needed by a static host.
await rm(output, { recursive: true, force: true });
const compilation = spawnSync(process.platform === 'win32' ? 'tsc.cmd' : 'tsc', ['--noEmit'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (compilation.error) {
  console.error('TypeScript could not start. Install the project dependencies first.');
  console.error(compilation.error.message);
  process.exit(1);
}
if (compilation.status !== 0) process.exit(compilation.status ?? 1);

await mkdir(new URL('assets/', output), { recursive: true });
// A classic script also loads in an opaque-origin iframe without host CORS headers.
const bundle = spawnSync(process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild', [
  'src/main.ts', '--bundle', '--format=iife', '--platform=browser', '--target=es2022',
  '--minify', '--legal-comments=none', '--outfile=dist/assets/main.js',
], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (bundle.error) {
  console.error('The bundler could not start. Install the project dependencies first.');
  console.error(bundle.error.message);
  process.exit(1);
}
if (bundle.status !== 0) process.exit(bundle.status ?? 1);
await cp(new URL('../public/', import.meta.url), output, { recursive: true });
await cp(new URL('../src/styles.css', import.meta.url), new URL('assets/styles.css', output));
console.log('Built self-contained static export in dist/.');
