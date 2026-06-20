This version forces /boiii.json to be generated live by server.js.

Render commands:
Build Command: npm install
Start Command: npm start

Do not use: npm run rebuild-manifest && node src/index.js as the build command.

Current server_browser manifest entry from this zip:
["data/ui_scripts/server_browser/__init__.lua", 43618, "6EAAF7A299CE5D4977E397A930E0C3F30BBE183A"]

After deploy:
1. Open https://client.swifly.net/manifest-debug.json
2. Make sure matches is true.
3. Open https://client.swifly.net/boiii.json and search server_browser/__init__.lua.

If /manifest-debug.json does not exist, Render is still running an old deployment or wrong service.
