# client.swifly.net Render Site

This is the updated Render-ready site for the patched Swifly client.

It serves three things:

## 1. Server browser list

The patched client now reads:

```txt
https://client.swifly.net/servers.json
```

This site returns only:

```json
{
  "servers": ["mp1.swifly.net:1154"]
}
```

## 2. Updater manifest

The updater reads:

```txt
https://client.swifly.net/boiii.json
https://client.swifly.net/boiii-beta.json
```

These manifests are generated automatically from files inside:

```txt
public/boiii
public/boiii/beta
```

## 3. Updater files

Main/latest files are served from:

```txt
https://client.swifly.net/boiii/<file>
```

Beta files are served from:

```txt
https://client.swifly.net/boiii/beta/<file>
```

If `public/boiii/beta` is empty, `/boiii-beta.json` falls back to the main manifest, and `/boiii/beta/<file>` falls back to `/boiii/<file>`.

## Where to put the data folder

Put it here:

```txt
public/boiii/data
```

Example:

```txt
public/boiii/data/lookup_tables/hash_names.txt
public/boiii/data/ui_scripts/server_browser/__init__.lua
public/boiii/ext.dll
public/boiii/boiii.exe
```

## Render settings

Build command:

```txt
npm install
```

Start command:

```txt
npm start
```

Environment variable:

```txt
SERVERS=mp1.swifly.net:1154
PUBLIC_HOST=client.swifly.net
```

## Test URLs

After deploy, these should work:

```txt
https://client.swifly.net/servers.json
https://client.swifly.net/boiii.json
https://client.swifly.net/boiii-beta.json
https://client.swifly.net/boiii/data/lookup_tables/hash_names.txt
```

No UDP is needed for Render anymore because the patched client uses HTTPS `/servers.json`.
