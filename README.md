# client.swifly.net Render Site — RaidMax Connect Column Fix

No Render env vars needed.

Use:

```txt
Build Command: npm install
Start Command: npm start
```

This version fixes the big issue from the RaidMax/Grafana table:

```txt
Webfront = admin website address
Connect = real game server address
```

The old zip accidentally grabbed Webfront addresses like:

```txt
88.198.34.154:1624
```

But the client needs Connect addresses like:

```txt
88.198.34.154:28094
```

This version prefers the `Connect` column and avoids `Webfront`, `URL`, `Website`, and `Link` fields.

The patched Swifly client reads:

```txt
https://client.swifly.net/servers.json
```

Test after deploy:

```txt
https://client.swifly.net/servers.json
https://client.swifly.net/raidmax.json
https://client.swifly.net/status
```

If something still looks off, check `/raidmax.json` and look at `panelRows.sampleRow`.


## Manifest auto-fix

This version serves `/boiii.json` and `/boiii-beta.json` from the actual files in `public/boiii` every request.

That means if you replace:

```txt
public/boiii/data/ui_scripts/server_browser/__init__.lua
```

with a bigger/smaller file, the manifest reports the new size and SHA1 automatically after redeploy/restart.

Useful checks:

```txt
https://client.swifly.net/manifest-debug.json
https://client.swifly.net/boiii.json
```

For the pinned server browser file, `/manifest-debug.json` should show an entry like:

```json
["data/ui_scripts/server_browser/__init__.lua", 43618, "6EAAF7A299CE5D4977E397A930E0C3F30BBE183A"]
```

The client still verifies size/hash for safety. The fix is that the server now keeps the manifest synced so changed file sizes do not break the updater.
