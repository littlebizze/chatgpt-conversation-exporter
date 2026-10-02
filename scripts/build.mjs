import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('LICENSE', 'dist/LICENSE');
await cp('node_modules/fflate/LICENSE', 'dist/fflate-LICENSE');
await build({
  entryPoints: ['src/popup.ts', 'src/content.ts', 'src/background.ts', 'src/target.ts'],
  outdir: 'dist', bundle: true, format: 'iife', platform: 'browser',
  target: 'chrome120', minify: false, legalComments: 'eof',
});
await mkdir('release', { recursive: true });
await rm('release/chatgpt-conversation-exporter-source', { recursive: true, force: true });
await cp('dist', 'release/chatgpt-conversation-exporter-source', { recursive: true });
console.log('Updated release/chatgpt-conversation-exporter-source');
