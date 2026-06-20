const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

const PUBLIC_HOST = "client.swifly.net";
const PINNED_SERVERS = ["mp1.swifly.net:1154"];
const RAIDMAX_SERVERS_PAGE = "http://api.raidmax.org:5000/servers";
const RAIDMAX_CACHE_SECONDS = 60;

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const BOIII_DIR = path.join(PUBLIC_DIR, "boiii");
const BETA_DIR = path.join(BOIII_DIR, "beta");

let cachedRaidmaxServers = [];
let cachedRaidmaxDebug = {};
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

function getManifests() {
  const main = buildManifest(BOIII_DIR, { excludePrefix: "beta/" });
  let beta = buildManifest(BETA_DIR);
  if (beta.length === 0) beta = main;
  return { main, beta };
}

function sendManifest(res, manifest) {
  // Always make the updater fetch the current manifest.
  // The manifest is generated from the actual files on disk, so file size/hash
  // changes are automatically reflected and will not create stale size mismatch errors.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.type("json").send(JSON.stringify(manifest, null, 2) + "\n");
}

function sendFileIfExists(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(filePath);
  return true;
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      method: options.method || "GET",
      body: options.body,
      headers: {
        "Accept": options.accept || "text/html,application/json,text/plain;q=0.8,*/*;q=0.5",
        "User-Agent": "Swifly-T7-ServerList/3.0",
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}: ${text.slice(0, 180)}`);
    }

    return {
      url: response.url || url,
      text,
      headers: response.headers
    };
  } finally {
    clearTimeout(timeout);
  }
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function htmlUnescape(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function absoluteUrl(url, base) {
  try {
    return new URL(htmlUnescape(url), base).toString();
  } catch {
    return null;
  }
}

function extractIframeUrls(html, base) {
  const urls = [];
  const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let match;

  while ((match = iframeRegex.exec(html))) {
    const url = absoluteUrl(match[1], base);
    if (url) urls.push(url);
  }

  return [...new Set(urls)];
}

function parseGrafanaDashboardUrl(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/d\/([^/]+)\/([^/?#]+)/i);
    if (!match) return null;

    return {
      origin: parsed.origin,
      uid: match[1],
      slug: match[2],
      url: parsed.toString()
    };
  } catch {
    return null;
  }
}

function cleanAddress(value) {
  if (typeof value !== "string") return null;

  let address = value.trim();
  address = address.replace(/^steam:\/\/connect\//i, "");
  address = address.replace(/^\/connect\//i, "");

  try {
    if (/^https?:\/\//i.test(address)) address = new URL(address).host;
  } catch {
    // keep original
  }

  const match = address.match(/^(\[[^\]]+\]|[^:/?#\s]+):(\d{1,5})$/);
  if (!match) return null;

  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  const lowered = address.toLowerCase();
  if (
    lowered.includes("raidmax.org:5000") ||
    lowered.includes("iw4.zip") ||
    lowered.includes("localhost:") ||
    lowered.includes("127.0.0.1:")
  ) return null;

  return address;
}

function valueLooksT7(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return value === 311210;

  const text = String(value).toLowerCase();
  return (
    /\bt7x?\b/.test(text) ||
    /\bboiii\b/.test(text) ||
    /\bbo3\b/.test(text) ||
    /black\s*ops\s*(3|iii)/.test(text) ||
    /blackops3/.test(text) ||
    /call\s*of\s*duty.*black\s*ops\s*(3|iii)/.test(text) ||
    /\b311210\b/.test(text)
  );
}

function objectLooksT7(obj) {
  if (!obj || typeof obj !== "object") return false;
  for (const [key, value] of Object.entries(obj)) {
    if (valueLooksT7(key) || valueLooksT7(value)) return true;
  }
  return false;
}

function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isWebfrontKey(key) {
  const normalized = normalizeKey(key);
  return (
    normalized.includes("webfront") ||
    normalized.includes("website") ||
    normalized.includes("web") ||
    normalized.includes("url") ||
    normalized.includes("link")
  );
}

function isConnectKey(key) {
  const normalized = normalizeKey(key);
  return (
    normalized === "connect" ||
    normalized.includes("connectaddr") ||
    normalized.includes("connectaddress") ||
    normalized.includes("join") ||
    normalized.includes("endpoint")
  );
}

function cleanConnectAddress(value) {
  if (typeof value !== "string") return null;

  let address = value.trim();
  address = address.replace(/^steam:\/\/connect\//i, "");
  address = address.replace(/^\/connect\//i, "");

  // Do NOT turn webfront URLs into game servers. A value like
  // https://88.198.34.154:1624 is the admin webfront, not the BO3 connect port.
  if (/^https?:\/\//i.test(address)) {
    return null;
  }

  return cleanAddress(address);
}

function extractAddressFromObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  // 1. Prefer the actual Grafana/table Connect column.
  for (const [key, value] of Object.entries(obj)) {
    if (!isConnectKey(key)) continue;

    const cleaned = cleanConnectAddress(String(value));
    if (cleaned) return cleaned;
  }

  // 2. Prefer direct known game-address fields, but never Webfront/URL fields.
  const directFields = [
    "address", "addr", "connectAddr", "connectAddress", "endpoint",
    "ip_port", "ipPort", "hostport", "hostPort", "server",
    "server_address", "serverAddress"
  ];

  for (const field of directFields) {
    if (isWebfrontKey(field)) continue;

    const cleaned = cleanConnectAddress(String(obj[field] ?? ""));
    if (cleaned) return cleaned;
  }

  // 3. Host + game port style rows.
  const normalized = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[normalizeKey(key)] = value;
  }

  const host =
    normalized.ip ||
    normalized.host ||
    normalized.hostname ||
    normalized.domain ||
    normalized.serverip;

  const port =
    normalized.connectport ||
    normalized.gameport ||
    normalized.port ||
    normalized.queryport ||
    normalized.netport;

  if (host && port) {
    const cleaned = cleanConnectAddress(`${String(host).trim()}:${Number(port)}`);
    if (cleaned) return cleaned;
  }

  // 4. Last resort: use a non-webfront host:port value from the row.
  for (const [key, value] of Object.entries(obj)) {
    if (isWebfrontKey(key)) continue;

    const cleaned = cleanConnectAddress(String(value));
    if (cleaned) return cleaned;
  }

  return null;
}

function collectT7Servers(value, out = [], contextIsT7 = false) {
  if (!value) return out;

  if (typeof value === "string") {
    const address = cleanAddress(value);
    if (address && contextIsT7) out.push(address);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectT7Servers(item, out, contextIsT7);
    return out;
  }

  if (typeof value === "object") {
    const thisIsT7 = contextIsT7 || objectLooksT7(value);
    const address = extractAddressFromObject(value);

    if (address && thisIsT7) out.push(address);

    for (const [key, child] of Object.entries(value)) {
      collectT7Servers(child, out, thisIsT7 || valueLooksT7(key));
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

function extractT7AddressesFromText(text) {
  const out = [];
  const regex = /(?:steam:\/\/connect\/)?(?:\[[0-9a-f:.]+\]|(?:[a-z0-9.-]+\.[a-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})):\d{2,5}/gi;

  let match;
  while ((match = regex.exec(text))) {
    const address = cleanAddress(match[0]);
    if (!address) continue;

    const start = Math.max(0, match.index - 700);
    const end = Math.min(text.length, match.index + match[0].length + 700);
    const context = text.slice(start, end);

    if (valueLooksT7(context)) out.push(address);
  }

  return out;
}

function flattenPanels(panels, out = []) {
  if (!Array.isArray(panels)) return out;

  for (const panel of panels) {
    if (!panel || typeof panel !== "object") continue;

    if (Array.isArray(panel.panels)) flattenPanels(panel.panels, out);
    else out.push(panel);
  }

  return out;
}

async function fetchGrafanaDatasources(origin, debug) {
  try {
    const dsResponse = await fetchText(`${origin}/api/datasources`, {
      accept: "application/json"
    });
    const datasources = tryJson(dsResponse.text);
    debug.datasourceCount = Array.isArray(datasources) ? datasources.length : 0;
    debug.datasources = Array.isArray(datasources)
      ? datasources.map((ds) => ({ name: ds.name, uid: ds.uid, type: ds.type, id: ds.id }))
      : [];
    return Array.isArray(datasources) ? datasources : [];
  } catch (error) {
    debug.datasourceFetchError = error.message || String(error);
    return [];
  }
}

function variableName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^\$\{?([A-Za-z0-9_:-]+)\}?$/);
  return match ? match[1] : null;
}

function dashboardVariableMap(dashboard) {
  const map = new Map();
  const list = dashboard?.templating?.list || [];

  for (const item of list) {
    if (!item || !item.name) continue;

    const values = [];
    if (item.current) {
      if (Array.isArray(item.current.value)) values.push(...item.current.value);
      else if (item.current.value !== undefined) values.push(item.current.value);

      if (Array.isArray(item.current.text)) values.push(...item.current.text);
      else if (item.current.text !== undefined) values.push(item.current.text);
    }

    if (item.query) values.push(item.query);
    if (item.datasource) values.push(item.datasource);

    map.set(item.name, values.filter((v) => v !== undefined && v !== null));
  }

  return map;
}

function sameText(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function findDatasource(value, datasources) {
  if (!value) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    if (value.uid && !variableName(value.uid)) {
      const byUid = datasources.find((ds) => sameText(ds.uid, value.uid));
      if (byUid) return byUid;

      return {
        uid: value.uid,
        type: value.type || "grafana-postgresql-datasource",
        name: value.name || value.uid
      };
    }

    if (value.name) {
      const byName = datasources.find((ds) => sameText(ds.name, value.name));
      if (byName) return byName;
    }

    if (value.type) {
      const byType = datasources.find((ds) => sameText(ds.type, value.type));
      if (byType) return byType;
    }
  }

  if (typeof value === "string") {
    const byUid = datasources.find((ds) => sameText(ds.uid, value));
    if (byUid) return byUid;

    const byName = datasources.find((ds) => sameText(ds.name, value));
    if (byName) return byName;

    const byType = datasources.find((ds) => sameText(ds.type, value));
    if (byType) return byType;
  }

  return null;
}

function resolveDatasource(raw, panel, target, dashboard, datasources, varMap) {
  const candidates = [
    raw,
    target?.datasource,
    panel?.datasource,
    dashboard?.datasource
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (typeof candidate === "object" && !Array.isArray(candidate)) {
      const uidVar = variableName(candidate.uid);
      if (uidVar && varMap.has(uidVar)) {
        for (const value of varMap.get(uidVar)) {
          const found = findDatasource(value, datasources);
          if (found) return found;
        }
      }

      const found = findDatasource(candidate, datasources);
      if (found) return found;
    }

    if (typeof candidate === "string") {
      const varName = variableName(candidate);
      if (varName && varMap.has(varName)) {
        for (const value of varMap.get(varName)) {
          const found = findDatasource(value, datasources);
          if (found) return found;
        }
      }

      const found = findDatasource(candidate, datasources);
      if (found) return found;
    }
  }

  // If there is only one datasource, use it.
  if (datasources.length === 1) return datasources[0];

  return null;
}

function extractRowsFromGrafanaQueryResult(result) {
  const rows = [];
  const frames = [];

  function findFrames(value) {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      for (const item of value) findFrames(item);
      return;
    }

    if (value.schema && Array.isArray(value.schema.fields) && value.data && Array.isArray(value.data.values)) {
      frames.push(value);
      return;
    }

    for (const child of Object.values(value)) findFrames(child);
  }

  findFrames(result);

  for (const frame of frames) {
    const fields = frame.schema.fields || [];
    const values = frame.data.values || [];
    const rowCount = Math.max(0, ...values.map((col) => Array.isArray(col) ? col.length : 0));

    for (let i = 0; i < rowCount; i++) {
      const row = {};
      for (let f = 0; f < fields.length; f++) {
        const name = fields[f].name || fields[f].config?.displayName || `field_${f}`;
        row[name] = Array.isArray(values[f]) ? values[f][i] : undefined;
      }
      rows.push(row);
    }
  }

  return rows;
}

async function tryGrafanaDashboardApi(grafana, debug) {
  const dashboardApiUrl = `${grafana.origin}/api/dashboards/uid/${encodeURIComponent(grafana.uid)}`;
  debug.grafanaDashboardApi = dashboardApiUrl;

  const dashboardResponse = await fetchText(dashboardApiUrl, {
    accept: "application/json"
  });

  const dashboardJson = tryJson(dashboardResponse.text);
  if (!dashboardJson) {
    debug.dashboardApiResult = "not json";
    return [];
  }

  const dashboard = dashboardJson.dashboard || dashboardJson;
  const panels = flattenPanels(dashboard.panels || []);
  debug.grafanaPanelCount = panels.length;

  const datasources = await fetchGrafanaDatasources(grafana.origin, debug);
  const varMap = dashboardVariableMap(dashboard);

  debug.dashboardVariables = [...varMap.entries()].map(([name, values]) => ({ name, values }));

  const allServers = [];
  const now = Date.now();
  const from = now - 5 * 60 * 1000;

  for (const panel of panels) {
    const targets = Array.isArray(panel.targets) ? panel.targets : [];
    if (!targets.length) continue;

    const panelContextIsT7 =
      valueLooksT7(panel.title) ||
      valueLooksT7(JSON.stringify(panel.fieldConfig || {})) ||
      valueLooksT7(JSON.stringify(panel.options || {}));

    const queries = [];

    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      const resolved = resolveDatasource(target.datasource, panel, target, dashboard, datasources, varMap);

      if (!resolved) {
        debug.unresolvedDatasources = debug.unresolvedDatasources || [];
        debug.unresolvedDatasources.push({
          panel: panel.title || panel.id,
          targetDatasource: target.datasource,
          panelDatasource: panel.datasource
        });
        continue;
      }

      queries.push({
        ...target,
        refId: target.refId || String.fromCharCode(65 + index),
        datasource: {
          uid: resolved.uid,
          type: resolved.type
        },
        datasourceId: resolved.id,
        intervalMs: 30000,
        maxDataPoints: 20000
      });
    }

    if (!queries.length) continue;

    const body = JSON.stringify({
      queries,
      from: String(from),
      to: String(now),
      range: {
        from: new Date(from).toISOString(),
        to: new Date(now).toISOString(),
        raw: { from: "now-5m", to: "now" }
      },
      interval: "30s",
      intervalMs: 30000,
      maxDataPoints: 20000,
      scopedVars: {},
      dashboardUID: grafana.uid
    });

    try {
      const queryResponse = await fetchText(`${grafana.origin}/api/ds/query`, {
        method: "POST",
        accept: "application/json",
        headers: {
          "Content-Type": "application/json",
          "X-Grafana-Org-Id": "1"
        },
        body,
        timeoutMs: 15000
      });

      const queryJson = tryJson(queryResponse.text);
      if (!queryJson) continue;

      const rows = extractRowsFromGrafanaQueryResult(queryJson);
      debug.panelRows = debug.panelRows || [];
      debug.panelRows.push({
        panel: panel.title || panel.id,
        rows: rows.length,
        sampleRow: rows[0] || null
      });

      for (const row of rows) {
        const address = extractAddressFromObject(row);
        if (!address) continue;

        if (panelContextIsT7 || objectLooksT7(row)) {
          allServers.push(address);
        }
      }
    } catch (error) {
      debug.grafanaQueryErrors = debug.grafanaQueryErrors || [];
      if (debug.grafanaQueryErrors.length < 8) {
        debug.grafanaQueryErrors.push({
          panel: panel.title || panel.id,
          error: error.message || String(error),
          queryDatasources: queries.map((q) => q.datasource)
        });
      }
    }
  }

  return dedupeServers(allServers);
}

async function fetchRaidmaxT7Servers(force = false) {
  const now = Date.now();

  if (!force && now - cachedRaidmaxAt < RAIDMAX_CACHE_SECONDS * 1000) {
    return cachedRaidmaxServers;
  }

  const debug = { sourcePage: RAIDMAX_SERVERS_PAGE };

  try {
    const source = await fetchText(RAIDMAX_SERVERS_PAGE);
    debug.finalSourceUrl = source.url;
    debug.sourceContentType = source.headers.get("content-type") || "";

    let servers = [];
    const json = tryJson(source.text);

    if (json) {
      debug.sourceType = "json";
      servers = collectT7Servers(json);
    } else {
      debug.sourceType = "html";
      servers.push(...extractT7AddressesFromText(source.text));

      const iframeUrls = extractIframeUrls(source.text, source.url);
      debug.iframeUrls = iframeUrls;

      for (const iframeUrl of iframeUrls) {
        const iframe = await fetchText(iframeUrl);
        debug.fetchedIframeUrl = iframe.url;

        servers.push(...extractT7AddressesFromText(iframe.text));

        const grafana = parseGrafanaDashboardUrl(iframe.url);
        debug.grafana = grafana;

        if (grafana) {
          try {
            servers.push(...await tryGrafanaDashboardApi(grafana, debug));
          } catch (error) {
            debug.grafanaApiError = error.message || String(error);
          }
        }
      }
    }

    cachedRaidmaxServers = dedupeServers(servers);
    cachedRaidmaxAt = now;
    cachedRaidmaxError = null;
    cachedRaidmaxDebug = {
      ...debug,
      includedCount: cachedRaidmaxServers.length,
      includedServers: cachedRaidmaxServers
    };

    console.log(`RaidMax T7 servers loaded: ${cachedRaidmaxServers.length}`);
    return cachedRaidmaxServers;
  } catch (error) {
    cachedRaidmaxError = error.message || String(error);
    cachedRaidmaxDebug = {
      ...debug,
      error: cachedRaidmaxError,
      includedCount: cachedRaidmaxServers.length,
      includedServers: cachedRaidmaxServers
    };

    console.warn(`RaidMax fetch failed: ${cachedRaidmaxError}`);
    return cachedRaidmaxServers || [];
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
  res.json({ ok: true, service: "client-swifly-net", publicHost: PUBLIC_HOST });
});

app.get("/servers.json", async (_req, res) => {
  const servers = await getMergedServers();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.json({ servers });
});

app.get("/raidmax.json", async (_req, res) => {
  await fetchRaidmaxT7Servers(true);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.json({
    mode: "GRAFANA_CONNECT_COLUMN_T7_ONLY",
    error: cachedRaidmaxError,
    ...cachedRaidmaxDebug
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
      sourcePage: RAIDMAX_SERVERS_PAGE,
      mode: "GRAFANA_CONNECT_COLUMN_T7_ONLY",
      cacheSeconds: RAIDMAX_CACHE_SECONDS,
      includedCount: raidmax.length,
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


app.get("/manifest-debug.json", (_req, res) => {
  const { main, beta } = getManifests();
  const wanted = "data/ui_scripts/server_browser/__init__.lua";
  const mainEntry = main.find((entry) => entry[0] === wanted) || null;
  const betaEntry = beta.find((entry) => entry[0] === wanted) || null;

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.json({
    ok: true,
    note: "Manifest is generated live from public/boiii, so changed file sizes are automatically reflected.",
    checkedFile: wanted,
    mainEntry,
    betaEntry,
    mainFileCount: main.length,
    betaFileCount: beta.length
  });
});

app.get("/force-manifest-refresh", (_req, res) => {
  const { main, beta } = getManifests();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.json({
    ok: true,
    refreshed: true,
    mainFileCount: main.length,
    betaFileCount: beta.length
  });
});

app.get("/boiii.json", (_req, res) => sendManifest(res, getManifests().main));
app.get("/boiii-beta.json", (_req, res) => sendManifest(res, getManifests().beta));

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
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  }
}));

app.use((err, _req, res, _next) => {
  if (err && err.status === 404) return res.status(404).json({ error: "not found" });
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`client.swifly.net site listening on ${HOST}:${PORT}`);
  console.log(`Pinned servers: ${PINNED_SERVERS.join(", ")}`);
  console.log(`RaidMax Connect-column import: ${RAIDMAX_SERVERS_PAGE}`);
  console.log(`Serving updater files from ${BOIII_DIR}`);
});
