import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
const files = Object.create(null);
async function collect(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) await collect(`${directory}/${entry.name}`, `${name}/`);
    else files[name] = new Uint8Array(await readFile(`${directory}/${entry.name}`));
  }
}
await collect('dist');
await mkdir('release', { recursive: true });
await writeFile('release/chatgpt-conversation-exporter.zip', zipSync(files));
console.log('Created release/chatgpt-conversation-exporter.zip');
