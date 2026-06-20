'use strict';

const dgram = require('node:dgram');
const dns = require('node:dns').promises;
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const HOST = process.env.HOST || '0.0.0.0';
const HTTP_PORT = Number(process.env.PORT || 3000);
const MASTER_PORT = Number(process.env.MASTER_PORT || 20810);
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'client.swifly.net';
const PUBLIC_DIR = path.join(__dirname, 'public');

const SERVERS = (process.env.SERVERS || 'mp1.swifly.net:1154')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);

// BO3/T7 connectionless UDP response.
// Client expects raw entries after "getServersResponse":
// 4 IPv4 bytes + 2-byte port + backslash separator.
const RESPONSE_HEADER = Buffer.from('\xff\xff\xff\xffgetServersResponse ', 'latin1');

function splitHostPort(address) {
  const index = address.lastIndexOf(':');
  if (index <= 0 || index === address.length - 1) {
    throw new Error(`Bad address: ${address}`);
  }

  const host = address.slice(0, index);
  const port = Number(address.slice(index + 1));

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Bad port: ${address}`);
  }

  return { host, port };
}

async function resolveIPv4(host) {
  if (net.isIPv4(host)) return host;
  const result = await dns.lookup(host, { family: 4 });
  return result.address;
}

async function encodeServer(address) {
  const { host, port } = splitHostPort(address);
  const ip = await resolveIPv4(host);
  const parts = ip.split('.').map(Number);

  if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255)) {
    throw new Error(`Invalid IPv4 for ${address}: ${ip}`);
  }

  const entry = Buffer.alloc(7);
  entry[0] = parts[0];
  entry[1] = parts[1];
  entry[2] = parts[2];
  entry[3] = parts[3];
  entry.writeUInt16BE(port, 4);
  entry[6] = 0x5c;
  return entry;
}

async function buildServerBrowserResponse() {
  const entries = [];

  for (const server of SERVERS) {
    try {
      entries.push(await encodeServer(server));
    } catch (error) {
      console.error(`[MASTER] Skipping ${server}: ${error.message}`);
    }
  }

  return Buffer.concat([RESPONSE_HEADER, ...entries]);
}

function commandFromPacket(packet) {
  const hasHeader =
    packet.length >= 4 &&
    packet[0] === 0xff &&
    packet[1] === 0xff &&
    packet[2] === 0xff &&
    packet[3] === 0xff;

  const offset = hasHeader ? 4 : 0;
  return packet.toString('latin1', offset).split(/\s+/)[0].toLowerCase();
}

const udp = dgram.createSocket('udp4');

udp.on('message', async (packet, remote) => {
  const command = commandFromPacket(packet);

  if (command !== 'getservers') {
    console.log(`[MASTER] Ignored "${command || 'unknown'}" from ${remote.address}:${remote.port}`);
    return;
  }

  const response = await buildServerBrowserResponse();
  udp.send(response, remote.port, remote.address);
  console.log(`[MASTER] Sent ${SERVERS.join(', ')} to ${remote.address}:${remote.port}`);
});

udp.on('error', (error) => {
  console.error('[MASTER] UDP error:', error);
});

udp.bind(MASTER_PORT, HOST, () => {
  console.log(`[MASTER] Listening on UDP ${HOST}:${MASTER_PORT}`);
  console.log(`[MASTER] Returning only: ${SERVERS.join(', ')}`);
});

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.dll' || ext === '.exe') return 'application/octet-stream';
  if (ext === '.cfg' || ext === '.txt' || ext === '.lua' || ext === '.gsc') return 'text/plain; charset=utf-8';

  return 'application/octet-stream';
}

function safePublicPath(urlPath) {
  let decoded;

  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }

  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, normalized);
  const relative = path.relative(PUBLIC_DIR, fullPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return fullPath;
}

async function serveStatic(req, res) {
  const filePath = safePublicPath(req.url);

  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('bad path');
    return true;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return false;

    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Content-Length': stat.size,
      'Cache-Control': 'no-store'
    });

    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderHome() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Swifly Client Host</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Inter, system-ui, Segoe UI, sans-serif;
      color: #f8f9ff;
      background:
        radial-gradient(circle at 20% 20%, rgba(90, 120, 255, .28), transparent 380px),
        radial-gradient(circle at 80% 10%, rgba(150, 80, 255, .18), transparent 360px),
        #05060a;
    }
    main {
      width: min(920px, calc(100% - 32px));
      padding: 42px;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 30px;
      background: linear-gradient(145deg, rgba(255,255,255,.09), rgba(255,255,255,.04));
      box-shadow: 0 28px 100px rgba(0,0,0,.55);
    }
    .pill {
      display: inline-flex;
      padding: 9px 13px;
      border-radius: 999px;
      background: rgba(150,170,255,.13);
      border: 1px solid rgba(150,170,255,.25);
      color: #dbe1ff;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 22px 0 12px;
      font-size: clamp(44px, 9vw, 92px);
      line-height: .88;
      letter-spacing: -.08em;
    }
    p { color: #aab2ce; line-height: 1.65; font-size: 18px; max-width: 740px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 28px; }
    .box {
      padding: 18px;
      border-radius: 18px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.11);
    }
    .label {
      color: #aab2ce;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .13em;
      margin-bottom: 10px;
    }
    code {
      display: inline-flex;
      max-width: 100%;
      overflow-wrap: anywhere;
      padding: 9px 11px;
      border-radius: 12px;
      background: rgba(0,0,0,.28);
      border: 1px solid rgba(255,255,255,.09);
      color: white;
      font-family: Consolas, monospace;
      font-size: 14px;
    }
    a { color: #cbd4ff; text-decoration: none; }
    @media (max-width: 700px) { main { padding: 28px; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <div class="pill">Swifly Client Host</div>
    <h1>client.swifly.net</h1>
    <p>This host serves both the Swifly server browser master and updater files.</p>
    <div class="grid">
      <div class="box">
        <div class="label">Server browser master</div>
        <code>${htmlEscape(PUBLIC_HOST)}:${MASTER_PORT}</code>
      </div>
      <div class="box">
        <div class="label">Only listed server</div>
        <code>${htmlEscape(SERVERS.join(', '))}</code>
      </div>
      <div class="box">
        <div class="label">Main manifest</div>
        <code>https://${htmlEscape(PUBLIC_HOST)}/boiii.json</code>
      </div>
      <div class="box">
        <div class="label">Beta manifest</div>
        <code>https://${htmlEscape(PUBLIC_HOST)}/boiii-beta.json</code>
      </div>
    </div>
    <p>Status: <a href="/servers.json">/servers.json</a> · <a href="/health">/health</a></p>
  </main>
</body>
</html>`;
}

const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (req.url === '/servers.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      domain: PUBLIC_HOST,
      clientMaster: `${PUBLIC_HOST}:${MASTER_PORT}`,
      updateManifest: `https://${PUBLIC_HOST}/boiii.json`,
      betaUpdateManifest: `https://${PUBLIC_HOST}/boiii-beta.json`,
      servers: SERVERS
    }, null, 2));
    return;
  }

  if (req.url !== '/' && await serveStatic(req, res)) {
    return;
  }

  if (req.url !== '/') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(renderHome());
});

httpServer.listen(HTTP_PORT, HOST, () => {
  console.log(`[HTTP] Site/static updater host listening on http://${HOST}:${HTTP_PORT}`);
  console.log(`[HTTP] Put updater files in: ${PUBLIC_DIR}`);
});
