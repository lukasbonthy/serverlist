# Swifly Manifest Fix

The old manifest generator was accidentally skipping `.txt` files.

That breaks files like:

```txt
data/lookup_tables/hash_names.txt
data/lookup_tables/dvar_list.txt
```

## Fix your current server

Copy this file:

```txt
tools/generate-manifest.js
```

into your existing `client-swifly-net-with-manifests/tools/` folder, replacing the old one.

Then run this inside your existing `client-swifly-net-with-manifests` folder:

```bash
npm run manifest
```

Then restart your Node app:

```bash
pkill node
npm start
```

or if using PM2:

```bash
pm2 restart all
```

## Verify

Run:

```bash
grep hash_names public/boiii.json
curl -s https://client.swifly.net/boiii.json | grep hash_names
```

Both should show the same file size and hash.
