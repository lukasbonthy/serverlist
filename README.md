# client.swifly.net Render Site — T7 Only

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

This site returns:

```txt
mp1.swifly.net:1154
+
ONLY RaidMax servers that are marked as T7 / BO3 / BOIII
```

It fetches RaidMax from:

```txt
http://api.raidmax.org:5000/servers
```

Non-T7 servers from RaidMax are skipped.

## Test after deploy

```txt
https://client.swifly.net/servers.json
https://client.swifly.net/raidmax.json
https://client.swifly.net/status
```

`/raidmax.json` shows which servers were included and examples of skipped entries.

## Updater files

Updater files go here:

```txt
public/boiii
```

The data folder goes here:

```txt
public/boiii/data
```
