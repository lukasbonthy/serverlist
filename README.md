# client.swifly.net Render Site — RaidMax datasource resolver

No Render env vars needed.

Use:

```txt
Build Command: npm install
Start Command: npm start
```

This version fixes the Grafana `Data source not found` problem by resolving Grafana datasource variables before calling `/api/ds/query`.

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

If it still imports 0, paste the full `/raidmax.json` again, especially:

```txt
datasources
dashboardVariables
unresolvedDatasources
panelRows
grafanaQueryErrors
```

Updater files go here:

```txt
public/boiii
```

The data folder goes here:

```txt
public/boiii/data
```
