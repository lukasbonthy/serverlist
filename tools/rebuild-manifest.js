const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const BOIII_DIR = path.join(PUBLIC_DIR, "boiii");
const BETA_DIR = path.join(BOIII_DIR, "beta");

const ignoredNames = new Set([
  ".gitkeep",
  "PUT_UPDATE_FILES_HERE.txt",
  "PUT_FILES_HERE_NOTE.txt",
  "PUT_MAIN_UPDATE_FILES_HERE.txt",
  "PUT_BETA_UPDATE_FILES_HERE.txt",
  "README_INSTALL_THIS_PATCH.txt",
  "README_PUT_UPDATER_FILES_HERE.txt",
  "README_MANIFEST_FIX.txt",
  "MANIFEST_FIXED_README.txt"
]);

function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}

function shouldIgnore(relativePath) {
  const parts = normalizeSlashes(relativePath).split("/");
  if (parts.some((part) => part.startsWith("."))) return true;
  return ignoredNames.has(parts[parts.length - 1]);
}

function walkFiles(dir, baseDir, options = {}) {
  if (!fs.existsSync(dir)) return [];

  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = normalizeSlashes(path.relative(baseDir, full));

    if (shouldIgnore(rel)) continue;
    if (options.excludePrefix && rel.startsWith(options.excludePrefix)) continue;

    if (entry.isDirectory()) out.push(...walkFiles(full, baseDir, options));
    else if (entry.isFile()) out.push(full);
  }

  return out;
}

function sha1File(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

function buildManifest(baseDir, options = {}) {
  return walkFiles(baseDir, baseDir, options)
    .sort((a, b) => normalizeSlashes(a).localeCompare(normalizeSlashes(b)))
    .map((file) => {
      const rel = normalizeSlashes(path.relative(baseDir, file));
      return [rel, fs.statSync(file).size, sha1File(file)];
    });
}

const main = buildManifest(BOIII_DIR, { excludePrefix: "beta/" });
let beta = buildManifest(BETA_DIR);
if (beta.length === 0) beta = main;

fs.writeFileSync(path.join(PUBLIC_DIR, "boiii.json"), JSON.stringify(main, null, 2) + "\n");
fs.writeFileSync(path.join(PUBLIC_DIR, "boiii-beta.json"), JSON.stringify(beta, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "boiii.json"), JSON.stringify(main, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "boiii-beta.json"), JSON.stringify(beta, null, 2) + "\n");

const wanted = "data/ui_scripts/server_browser/__init__.lua";
const entry = main.find((item) => item[0] === wanted);
console.log("[manifest] rebuilt");
console.log("[manifest] " + wanted + " = " + JSON.stringify(entry));
