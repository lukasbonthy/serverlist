'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const mainDir = path.join(publicDir, 'boiii');
const betaDir = path.join(publicDir, 'boiii', 'beta');

const ignoredNames = new Set([
  '.gitkeep',
  'PUT_MAIN_UPDATE_FILES_HERE.txt',
  'PUT_BETA_UPDATE_FILES_HERE.txt',
  'README_PUT_UPDATER_FILES_HERE.txt'
]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, base, options = {}) {
  if (!(await exists(dir))) {
    return [];
  }

  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredNames.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(base, fullPath).replaceAll(path.sep, '/');

    if (options.excludePrefix && relativePath.startsWith(options.excludePrefix)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await walk(fullPath, base, options));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

async function sha1(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha1').update(data).digest('hex').toUpperCase();
}

async function buildManifest(baseDir, options = {}) {
  const files = await walk(baseDir, baseDir, options);
  const manifest = [];

  for (const relativePath of files) {
    const fullPath = path.join(baseDir, relativePath);
    const stat = await fs.stat(fullPath);
    manifest.push([relativePath, stat.size, await sha1(fullPath)]);
  }

  return manifest;
}

async function main() {
  const mainManifest = await buildManifest(mainDir, {
    excludePrefix: 'beta/'
  });

  const betaManifest = await buildManifest(betaDir);

  await fs.mkdir(publicDir, { recursive: true });

  await fs.writeFile(
    path.join(publicDir, 'boiii.json'),
    JSON.stringify(mainManifest, null, 2) + '\n'
  );

  await fs.writeFile(
    path.join(publicDir, 'boiii-beta.json'),
    JSON.stringify(betaManifest, null, 2) + '\n'
  );

  console.log(`Wrote public/boiii.json with ${mainManifest.length} files`);
  console.log(`Wrote public/boiii-beta.json with ${betaManifest.length} files`);

  const hashNames = mainManifest.find((file) => file[0] === 'data/lookup_tables/hash_names.txt');
  if (hashNames) {
    console.log(`hash_names.txt size: ${hashNames[1]}`);
    console.log(`hash_names.txt sha1: ${hashNames[2]}`);
  } else {
    console.log('WARNING: data/lookup_tables/hash_names.txt was not found in public/boiii');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
