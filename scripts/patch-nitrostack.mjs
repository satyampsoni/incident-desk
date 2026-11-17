import { readFile, writeFile } from 'node:fs/promises';

// NitroStack 1.1.3 starts this global housekeeping timer on import and exposes
// no disposal handle for it. It must not keep CLI clients or tests alive.
const file = new URL('./decorators/rate-limit.decorator.js', import.meta.resolve('@nitrostack/core'));
const original = 'setInterval(() => defaultStorage.cleanup(), 60000);';
const replacement = 'setInterval(() => defaultStorage.cleanup(), 60000).unref();';
const source = await readFile(file, 'utf8');
if (source.includes(replacement)) {
  process.stdout.write('NitroStack cleanup timer patch already applied.\n');
} else if (source.includes(original)) {
  await writeFile(file, source.replace(original, replacement));
  process.stdout.write('Patched NitroStack 1.1.3 cleanup timer to allow clean shutdown.\n');
} else {
  throw new Error('NitroStack cleanup timer changed; review the pinned SDK patch before upgrading.');
}
