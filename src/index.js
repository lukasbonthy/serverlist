const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_HOST = process.env.PUBLIC_HOST || "client.swifly.net";
const CACHE_SECONDS = Number(process.env.CACHE_SECONDS || 0);

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const BOIII_DIR = path.join(PUBLIC_DIR, "boiii");
const BETA_DIR = path.join(BOIII_DIR, "beta");

const SERVERS = (process.env.SERVERS || "mp1.swifly.net:1154")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

let cachedMainManifest = null;
let cachedBetaManifest = null;
let cachedAt = 0;

const ignoredNames = new Set([
  ".gitkeep",
  "PUT_UPDATE_FILES_HERE.txt",
  "PUT_MAIN_UPDATE_FILES_HERE.txt",
  "PUT_BETA_UPDATE_FILES_HERE.txt",
  "README_INSTALL_THIS_PATCH.txt",
  "README_PUT_UPDATER_FILES_HERE.txt"
]);

const ignoredTopFolders = new Set([
  "src",
  "tools"
]);

function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}

function shouldIgnore(relativePath) {
  const normalized = normalizeSlashes(relativePath);
  const parts = normalized.split("/");

  if (parts.some((part) => part.startsWith("."))) {
    return true;
  }

  if (ignoredNames.has(parts[parts.length - 1])) {
    return true;
  }

  if (ignoredTopFolders.has(parts[0])) {
    return true;
  }

  return false;
}

function walkFiles(dir, baseDir, options = {}) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = normalizeSlashes(path.relative(baseDir, full));

    if (shouldIgnore(rel)) {
      continue;
    }

    if (options.excludePrefix && rel.startsWith(options.excludePrefix)) {
      continue;
    }

    if (entry.isDirectory()) {
      out.push(...walkFiles(full, baseDir, options));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }

  return out;
}

function sha1File(file) {
  const hash = crypto.createHash("sha1");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex").toUpperCase();
}

function buildManifest(baseDir, options = {}) {
  const files = walkFiles(baseDir, baseDir, options)
    .sort((a, b) => normalizeSlashes(a).localeCompare(normalizeSlashes(b)));

  return files.map((file) => {
    const rel = normalizeSlashes(path.relative(baseDir, file));
    return [rel, fs.statSync(file).size, sha1File(file)];
  });
}

function getManifests() {
  const now = Date.now();
  if (
    cachedMainManifest &&
    cachedBetaManifest &&
    CACHE_SECONDS > 0 &&
    now - cachedAt < CACHE_SECONDS * 1000
  ) {
    return {
      main: cachedMainManifest,
      beta: cachedBetaManifest
    };
  }

  const main = buildManifest(BOIII_DIR, {
    excludePrefix: "beta/"
  });

  let beta = buildManifest(BETA_DIR);
  if (beta.length === 0) {
    beta = main;
  }

  cachedMainManifest = main;
  cachedBetaManifest = beta;
  cachedAt = now;

  return { main, beta };
}

function sendManifest(res, manifest) {
  res.setHeader("Cache-Control", "no-store");
  res.type("json").send(JSON.stringify(manifest, null, 2) + "\n");
}

function sendFileIfExists(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  res.setHeader("Cache-Control", "no-store");
  res.sendFile(filePath);
  return true;
}

const app = express();

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(cors());
app.use(morgan("tiny"));

app.get("/", (_req, res) => {
  const { main, beta } = getManifests();

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Swifly Client Host</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 42px auto; padding: 0 20px; background: #07080d; color: #fff; }
    a { color: #9bb0ff; }
    code { background: #151927; padding: 3px 7px; border-radius: 7px; }
    .card { background: #111522; border: 1px solid #252c40; border-radius: 18px; padding: 18px; margin: 16px 0; }
  </style>
</head>
<body>
  <h1>client.swifly.net</h1>
  <div class="card">
    <p><strong>Server browser:</strong> <a href="/servers.json"><code>/servers.json</code></a></p>
    <p><strong>Only server:</strong> <code>${SERVERS.join(", ")}</code></p>
  </div>
  <div class="card">
    <p><strong>Main manifest:</strong> <a href="/boiii.json"><code>/boiii.json</code></a> (${main.length} files)</p>
    <p><strong>Beta manifest:</strong> <a href="/boiii-beta.json"><code>/boiii-beta.json</code></a> (${beta.length} files)</p>
    <p><strong>Files:</strong> <code>/boiii/&lt;file&gt;</code></p>
  </div>
</body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "client-swifly-net",
    publicHost: PUBLIC_HOST
  });
});

app.get("/servers.json", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    servers: SERVERS
  });
});

app.get("/status", (_req, res) => {
  const { main, beta } = getManifests();

  res.json({
    ok: true,
    serverList: "/servers.json",
    servers: SERVERS,
    mainManifest: "/boiii.json",
    mainFileCount: main.length,
    betaManifest: "/boiii-beta.json",
    betaFileCount: beta.length,
    fileBase: "/boiii/"
  });
});

app.get("/boiii.json", (_req, res) => {
  sendManifest(res, getManifests().main);
});

app.get("/boiii-beta.json", (_req, res) => {
  sendManifest(res, getManifests().beta);
});

app.get("/boiii/beta/*", (req, res, next) => {
  const requested = req.params[0] || "";
  const betaPath = path.join(BETA_DIR, requested);
  const mainPath = path.join(BOIII_DIR, requested);

  if (sendFileIfExists(res, betaPath)) {
    return;
  }

  if (sendFileIfExists(res, mainPath)) {
    return;
  }

  next();
});

app.use("/boiii", express.static(BOIII_DIR, {
  fallthrough: false,
  dotfiles: "deny",
  etag: true,
  lastModified: true,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));

app.use((err, _req, res, _next) => {
  if (err && err.status === 404) {
    return res.status(404).json({ error: "not found" });
  }

  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`client.swifly.net site listening on ${HOST}:${PORT}`);
  console.log(`Server browser list: ${SERVERS.join(", ")}`);
  console.log(`Serving updater files from ${BOIII_DIR}`);
});
