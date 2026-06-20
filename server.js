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

const RESPONSE_HEADER = Buffer.from('\xff\xff\xff\xffgetServersResponse ', 'latin1');

function splitHostPort(address) {
  const index = address.lastIndexOf(':');
  if (index <= 0 || index === address.length - 1) throw new Error(`Bad address: ${address}`);
  const host = address.slice(0, index);
  const port = Number(address.slice(index + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Bad port: ${address}`);
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
  if (command !== 'getservers') return;

  const response = await buildServerBrowserResponse();
  udp.send(response, remote.port, remote.address);
  console.log(`[MASTER] Sent ${SERVERS.join(', ')} to ${remote.address}:${remote.port}`);
});

udp.bind(MASTER_PORT, HOST, () => {
  console.log(`[MASTER] UDP ${HOST}:${MASTER_PORT}`);
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
  return 'application/octet-stream';
}

function safePublicPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }

  const fullPath = path.join(PUBLIC_DIR, path.normalize(decoded));
  const relative = path.relative(PUBLIC_DIR, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

async function serveStatic(req, res) {
  const filePath = safePublicPath(req.url);
  if (!filePath) return false;

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

function home() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>client.swifly.net</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05060a;color:white;font-family:system-ui}
    main{width:min(850px,calc(100% - 32px));padding:36px;border:1px solid rgba(255,255,255,.13);border-radius:28px;background:rgba(255,255,255,.06)}
    h1{font-size:clamp(42px,8vw,82px);letter-spacing:-.07em;margin:0 0 10px}
    p{color:#aab2ce;font-size:18px;line-height:1.6}
    code{display:inline-block;background:rgba(0,0,0,.35);padding:9px 11px;border-radius:10px;margin:4px;color:#fff}
  </style>
</head>
<body>
  <main>
    <h1>client.swifly.net</h1>
    <p>Swifly server browser + updater manifest host.</p>
    <p><code>/boiii.json</code><code>/boiii-beta.json</code><code>/boiii/*</code><code>/boiii/beta/*</code></p>
    <p>Server browser master: <code>${PUBLIC_HOST}:${MASTER_PORT}</code></p>
    <p>Only listed server: <code>${SERVERS.join(', ')}</code></p>
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
      updateManifest: `https://${PUBLIC_HOST}/boiii.json`,
      betaUpdateManifest: `https://${PUBLIC_HOST}/boiii-beta.json`,
      clientMaster: `${PUBLIC_HOST}:${MASTER_PORT}`,
      servers: SERVERS
    }, null, 2));
    return;
  }

  if (req.url !== '/' && await serveStatic(req, res)) return;

  if (req.url !== '/') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(home());
});

httpServer.listen(HTTP_PORT, HOST, () => {
  console.log(`[HTTP] TCP ${HOST}:${HTTP_PORT}`);
  console.log(`[HTTP] Serving updater files from ${PUBLIC_DIR}`);
});
