# client.swifly.net

This zip includes the actual updater manifests now.

## Client updater URLs

The client should use:

```txt
https://client.swifly.net/boiii.json
https://client.swifly.net/boiii-beta.json
https://client.swifly.net/boiii/<files>
https://client.swifly.net/boiii/beta/<files>
```

## Files already included

```txt
public/boiii.json
public/boiii-beta.json
```

## Add your updater files here

Main/latest files:

```txt
public/boiii/
```

Beta files:

```txt
public/boiii/beta/
```

Example:

```txt
public/boiii/boiii.exe
public/boiii/ext.dll
public/boiii/data/launcher/main.html
public/boiii/beta/boiii.exe
```

## Regenerate manifest after adding files

After you add/change files, run:

```bash
npm run manifest
```

That updates:

```txt
public/boiii.json
public/boiii-beta.json
```

with the real sizes and SHA1 hashes.

## Start

```bash
npm start
```

## Ports

```txt
TCP 3000   website/updater host
UDP 20810  server browser master
```

The server browser only returns:

```txt
mp1.swifly.net:1154
```

Important: if you upload different files than the manifest says, the updater will fail with a size/hash mismatch. Run `npm run manifest` after uploading files.
