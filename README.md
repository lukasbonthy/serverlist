# client.swifly.net Server List

This is the Node.js server-list site for Swifly.

The client should use:

```txt
client.swifly.net:20810
```

This master server only returns:

```txt
mp1.swifly.net:1154
```

## Run

```bash
npm start
```

## Production

Point `client.swifly.net` to the VPS running this.

Open:

```txt
UDP 20810
TCP 3000
```

The website runs on TCP `3000`.
The actual in-game server browser uses UDP `20810`.
