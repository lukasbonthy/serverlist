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
