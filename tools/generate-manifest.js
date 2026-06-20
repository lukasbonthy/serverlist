'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const mainDir = path.join(publicDir, 'boiii');
const betaDir = path.join(publicDir, 'boiii', 'beta');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, base, options = {}) {
  if (!(await exists(dir))) return [];

  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.gitkeep' || entry.name.endsWith('.txt')) continue;

    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replaceAll(path.sep, '/');

    if (options.excludePrefix && rel.startsWith(options.excludePrefix)) continue;

    if (entry.isDirectory()) {
      out.push(...await walk(full, base, options));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }

  return out.sort();
}

async function sha1(file) {
  const data = await fs.readFile(file);
  return crypto.createHash('sha1').update(data).digest('hex').toUpperCase();
}

async function buildManifest(dir, options = {}) {
  const files = await walk(dir, dir, options);
  const manifest = [];

  for (const rel of files) {
    const full = path.join(dir, rel);
    const stat = await fs.stat(full);
    manifest.push([rel, stat.size, await sha1(full)]);
  }

  return manifest;
}

async function main() {
  const mainManifest = await buildManifest(mainDir, { excludePrefix: 'beta/' });
  const betaManifest = await buildManifest(betaDir);

  await fs.writeFile(path.join(publicDir, 'boiii.json'), JSON.stringify(mainManifest, null, 2) + '\n');
  await fs.writeFile(path.join(publicDir, 'boiii-beta.json'), JSON.stringify(betaManifest, null, 2) + '\n');

  console.log(`Wrote public/boiii.json with ${mainManifest.length} files`);
  console.log(`Wrote public/boiii-beta.json with ${betaManifest.length} files`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
