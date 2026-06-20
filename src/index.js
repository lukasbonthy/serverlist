const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

// No Render env spam. Change these here if you need to.
const PUBLIC_HOST = "client.swifly.net";
const PINNED_SERVERS = ["mp1.swifly.net:1154"];
const RAIDMAX_URL = "http://api.raidmax.org:5000/servers";
const RAIDMAX_CACHE_SECONDS = 60;

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const BOIII_DIR = path.join(PUBLIC_DIR, "boiii");
const BETA_DIR = path.join(BOIII_DIR, "beta");

let cachedMainManifest = null;
let cachedBetaManifest = null;

let cachedRaidmaxServers = [];
let cachedRaidmaxSkipped = [];
let cachedRaidmaxAt = 0;
let cachedRaidmaxError = null;

const ignoredNames = new Set([
  ".gitkeep",
  "PUT_UPDATE_FILES_HERE.txt",
  "PUT_FILES_HERE_NOTE.txt",
  "PUT_MAIN_UPDATE_FILES_HERE.txt",
  "PUT_BETA_UPDATE_FILES_HERE.txt",
  "README_INSTALL_THIS_PATCH.txt",
  "README_PUT_UPDATER_FILES_HERE.txt"
]);

function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}

function shouldIgnore(relativePath) {
  const normalized = normalizeSlashes(relativePath);
  const parts = normalized.split("/");
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

    if (entry.isDirectory()) {
      out.push(...walkFiles(full, baseDir, options));
    } else if (entry.isFile()) {
      out.push(full);
    }
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

function getManifests() {
  cachedMainManifest = buildManifest(BOIII_DIR, { excludePrefix: "beta/" });

  cachedBetaManifest = buildManifest(BETA_DIR);
  if (cachedBetaManifest.length === 0) {
    cachedBetaManifest = cachedMainManifest;
  }

  return {
    main: cachedMainManifest,
    beta: cachedBetaManifest
  };
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

function cleanAddress(value) {
  if (typeof value !== "string") return null;

  let address = value.trim();
  address = address.replace(/^steam:\/\/connect\//i, "");
  address = address.replace(/^\/connect\//i, "");

  try {
    if (/^https?:\/\//i.test(address)) {
      address = new URL(address).host;
    }
  } catch {
    // Keep original.
  }

  const match = address.match(/^(\[[^\]]+\]|[^:/?#\s]+):(\d{1,5})$/);
  if (!match) return null;

  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return address;
}

function valueLooksT7(value) {
  if (value === null || value === undefined) return false;

  if (typeof value === "number") {
    // BO3 Steam app id.
    return value === 311210;
  }

  const text = String(value).toLowerCase();
  return (
    /\bt7x?\b/.test(text) ||
    /\bboiii\b/.test(text) ||
    /\bbo3\b/.test(text) ||
    /black\s*ops\s*(3|iii)/.test(text) ||
    /blackops3/.test(text) ||
    /call\s*of\s*duty.*black\s*ops\s*(3|iii)/.test(text)
  );
}

function keyLooksT7(key) {
  return valueLooksT7(key);
}

const gameMarkerFields = [
  "game",
  "gameName",
  "game_name",
  "gamename",
  "app",
  "appName",
  "app_name",
  "appid",
  "appId",
  "app_id",
  "steam_appid",
  "steamAppId",
  "folder",
  "platform",
  "protocolName",
  "protocol_name",
  "client",
  "clientName",
  "client_name",
  "network",
  "mod",
  "modName",
  "mod_name"
];

function objectLooksT7(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;

  for (const field of gameMarkerFields) {
    if (Object.prototype.hasOwnProperty.call(obj, field) && valueLooksT7(obj[field])) {
      return true;
    }
  }

  return false;
}

function extractAddressFromObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const directFields = [
    "address",
    "addr",
    "connectAddr",
    "connectAddress",
    "endpoint",
    "ip_port",
    "ipPort",
    "hostport",
    "hostPort",
    "server",
    "server_address",
    "serverAddress"
  ];

  for (const field of directFields) {
    const cleaned = cleanAddress(obj[field]);
    if (cleaned) return cleaned;
  }

  const host =
    obj.ip ||
    obj.host ||
    obj.hostname ||
    obj.domain ||
    obj.serverIp ||
    obj.serverIP ||
    obj.server_ip;

  const port =
    obj.port ||
    obj.gamePort ||
    obj.game_port ||
    obj.queryPort ||
    obj.query_port ||
    obj.net_port;

  if (host && port) {
    return cleanAddress(`${String(host).trim()}:${Number(port)}`);
  }

  return null;
}

function rememberSkip(value, reason) {
  if (cachedRaidmaxSkipped.length >= 50) return;

  let preview;
  try {
    preview = JSON.stringify(value).slice(0, 300);
  } catch {
    preview = String(value).slice(0, 300);
  }

  cachedRaidmaxSkipped.push({ reason, preview });
}

function collectT7Servers(value, out = [], contextIsT7 = false) {
  if (!value) return out;

  if (typeof value === "string") {
    const address = cleanAddress(value);
    if (address && contextIsT7) {
      out.push(address);
    } else if (address) {
      rememberSkip(value, "Skipped address because it had no T7/BO3 marker");
    }
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectT7Servers(item, out, contextIsT7);
    }
    return out;
  }

  if (typeof value === "object") {
    const thisObjectIsT7 = contextIsT7 || objectLooksT7(value);
    const address = extractAddressFromObject(value);

    if (address) {
      if (thisObjectIsT7) {
        out.push(address);
      } else {
        rememberSkip(value, "Skipped server because its game marker was not T7/BO3/BOIII");
      }
    }

    for (const [key, child] of Object.entries(value)) {
      const childContextIsT7 = thisObjectIsT7 || keyLooksT7(key);
      collectT7Servers(child, out, childContextIsT7);
    }
  }

  return out;
}

function dedupeServers(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const server = cleanAddress(value);
    if (!server) continue;

    const key = server.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(server);
  }

  return out;
}

async function fetchRaidmaxT7Servers(force = false) {
  const now = Date.now();

  if (!force && now - cachedRaidmaxAt < RAIDMAX_CACHE_SECONDS * 1000) {
    return cachedRaidmaxServers;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  cachedRaidmaxSkipped = [];

  try {
    const response = await fetch(RAIDMAX_URL, {
      headers: {
        "Accept": "application/json, text/plain;q=0.8, */*;q=0.5",
        "User-Agent": "Swifly-T7-ServerList/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`RaidMax returned HTTP ${response.status}`);
    }

    const text = await response.text();
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }

    cachedRaidmaxServers = dedupeServers(collectT7Servers(parsed));
    cachedRaidmaxAt = now;
    cachedRaidmaxError = null;

    console.log(`RaidMax T7 servers loaded: ${cachedRaidmaxServers.length}`);
    return cachedRaidmaxServers;
  } catch (error) {
    cachedRaidmaxError = error.message || String(error);
    console.warn(`RaidMax fetch failed: ${cachedRaidmaxError}`);

    // Keep old cached T7 servers if RaidMax is temporarily down.
    return cachedRaidmaxServers || [];
  } finally {
    clearTimeout(timeout);
  }
}

async function getMergedServers(forceRaidmax = false) {
  const raidmax = await fetchRaidmaxT7Servers(forceRaidmax);
  return dedupeServers([...PINNED_SERVERS, ...raidmax]);
}

const app = express();

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(cors());
app.use(morgan("tiny"));

app.get("/", async (_req, res) => {
  const { main, beta } = getManifests();
  const raidmax = await fetchRaidmaxT7Servers();
  const servers = await getMergedServers();

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
    <p><strong>Client server list:</strong> <a href="/servers.json"><code>/servers.json</code></a></p>
    <p><strong>Total listed:</strong> <code>${servers.length}</code></p>
    <p><strong>RaidMax T7 imported:</strong> <code>${raidmax.length}</code></p>
    <p><strong>Pinned server:</strong> <code>${PINNED_SERVERS.join(", ")}</code></p>
  </div>
  <div class="card">
    <p><strong>Main manifest:</strong> <a href="/boiii.json"><code>/boiii.json</code></a> (${main.length} files)</p>
    <p><strong>Beta manifest:</strong> <a href="/boiii-beta.json"><code>/boiii-beta.json</code></a> (${beta.length} files)</p>
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

app.get("/servers.json", async (_req, res) => {
  const servers = await getMergedServers();
  res.setHeader("Cache-Control", "no-store");
  res.json({ servers });
});

app.get("/raidmax.json", async (_req, res) => {
  const servers = await fetchRaidmaxT7Servers(true);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    url: RAIDMAX_URL,
    mode: "T7_ONLY",
    includedCount: servers.length,
    error: cachedRaidmaxError,
    includedServers: servers,
    skippedExamples: cachedRaidmaxSkipped
  });
});

app.get("/status", async (_req, res) => {
  const { main, beta } = getManifests();
  const raidmax = await fetchRaidmaxT7Servers();
  const merged = await getMergedServers();

  res.json({
    ok: true,
    serverList: "/servers.json",
    pinnedServers: PINNED_SERVERS,
    raidmax: {
      url: RAIDMAX_URL,
      mode: "T7_ONLY",
      cacheSeconds: RAIDMAX_CACHE_SECONDS,
      includedCount: raidmax.length,
      skippedExampleCount: cachedRaidmaxSkipped.length,
      error: cachedRaidmaxError
    },
    totalServers: merged.length,
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

  if (sendFileIfExists(res, betaPath)) return;
  if (sendFileIfExists(res, mainPath)) return;

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
  console.log(`Pinned servers: ${PINNED_SERVERS.join(", ")}`);
  console.log(`RaidMax T7-only import: ${RAIDMAX_URL}`);
  console.log(`Serving updater files from ${BOIII_DIR}`);
});
