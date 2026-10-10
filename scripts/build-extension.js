import { copyFile } from 'node:fs/promises';
// Ship the same local validator inside the self-contained unpacked extension.
await copyFile(new URL('../lib/session.js', import.meta.url), new URL('../extension/session.js', import.meta.url));
console.log('Extension validator synchronized. Load the extension directory in Chrome or Edge.');
