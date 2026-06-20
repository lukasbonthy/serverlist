# client.swifly.net Render Site — RaidMax Grafana T7 Only

No Render env vars needed.

Use:

```txt
Build Command: npm install
Start Command: npm start
```

The patched Swifly client reads:

```txt
https://client.swifly.net/servers.json
```

This version understands that:

```txt
http://api.raidmax.org:5000/servers
```

is an HTML page, not a JSON API. It follows the embedded Grafana iframe and tries Grafana's dashboard/data API.

It returns:

```txt
mp1.swifly.net:1154
+
ONLY RaidMax servers that have T7 / BO3 / BOIII markers
```

## Test after deploy

```txt
https://client.swifly.net/servers.json
https://client.swifly.net/raidmax.json
https://client.swifly.net/status
```

`/raidmax.json` shows debug info including the iframe URL, Grafana API attempt, and included servers.

## Updater files

Updater files go here:

```txt
public/boiii
```

The data folder goes here:

```txt
public/boiii/data
```
