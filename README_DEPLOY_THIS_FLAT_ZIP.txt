DEPLOY THIS ZIP ROOT, NOT A NESTED FOLDER.

This ZIP is flat: package.json is at the root.

Important current manifest entry:
["data/ui_scripts/server_browser/__init__.lua", 43618, "6EAAF7A299CE5D4977E397A930E0C3F30BBE183A"]

After deploy, check:
https://client.swifly.net/manifest-debug.json
https://client.swifly.net/rebuild-manifest-now
https://client.swifly.net/boiii.json

If manifest-debug shows actualSize and mainEntry[1] equal, the manifest is fixed.

If your live downloaded file is 41142 bytes, but this debug says 43618, then you are NOT deploying this zip or you manually changed only the hosted Lua file after deploy.
