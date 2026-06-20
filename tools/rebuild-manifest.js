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

function norm(v) { return v.replace(/\\/g, "/"); }
function ignore(rel) {
  const parts = norm(rel).split("/");
  return parts.some((p) => p.startsWith(".")) || ignoredNames.has(parts[parts.length - 1]);
}
function walk(dir, base, opts = {}) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = norm(path.relative(base, full));
    if (ignore(rel)) continue;
    if (opts.excludePrefix && rel.startsWith(opts.excludePrefix)) continue;
    if (entry.isDirectory()) out.push(...walk(full, base, opts));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
function sha1(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}
function manifest(base, opts = {}) {
  return walk(base, base, opts)
    .sort((a, b) => norm(a).localeCompare(norm(b)))
    .map((file) => [norm(path.relative(base, file)), fs.statSync(file).size, sha1(file)]);
}

const main = manifest(BOIII_DIR, { excludePrefix: "beta/" });
let beta = manifest(BETA_DIR);
if (!beta.length) beta = main;

fs.writeFileSync(path.join(PUBLIC_DIR, "boiii.json"), JSON.stringify(main, null, 2) + "\n");
fs.writeFileSync(path.join(PUBLIC_DIR, "boiii-beta.json"), JSON.stringify(beta, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "boiii.json"), JSON.stringify(main, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "boiii-beta.json"), JSON.stringify(beta, null, 2) + "\n");

const wanted = "data/ui_scripts/server_browser/__init__.lua";
console.log("[manifest] " + wanted + " = " + JSON.stringify(main.find((e) => e[0] === wanted)));
