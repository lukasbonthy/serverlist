# client.swifly.net

This app does both jobs:

1. Server browser master server:
   - Client asks UDP `client.swifly.net:20810`
   - Master returns only `mp1.swifly.net:1154`

2. Updater static host:
   - `https://client.swifly.net/boiii.json`
   - `https://client.swifly.net/boiii-beta.json`
   - `https://client.swifly.net/boiii/<files>`
   - `https://client.swifly.net/boiii/beta/<files>`

## Where to put updater files

Put your manifests here:

```txt
public/boiii.json
public/boiii-beta.json
```

Put your main updater files here:

```txt
public/boiii/
```

Put beta updater files here:

```txt
public/boiii/beta/
```

Example:

```txt
public/boiii.json
public/boiii-beta.json
public/boiii/boiii.exe
public/boiii/ext.dll
public/boiii/data/launcher/main.html
public/boiii/beta/boiii.exe
```

## Run

```bash
npm start
```

## VPS ports

Open:

```txt
UDP 20810
TCP 3000
```

If using Nginx/Caddy, reverse proxy HTTPS traffic to TCP 3000.
