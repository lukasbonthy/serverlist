Fixed boiii.json returning [].

Problem:
- Render runs node server.js from /opt/render/project/src/server.js.
- server.js used ROOT = path.resolve(__dirname, "..")
- That made it look for /opt/render/project/public/boiii instead of /opt/render/project/src/public/boiii.
- Since that folder did not exist, the runtime manifest became [].

Fix:
- server.js now uses ROOT = path.resolve(__dirname)
- It now reads /opt/render/project/src/public/boiii correctly.

After deploy:
- https://client.swifly.net/boiii.json?nocache=1 should NOT be []
- It should include data/ui_scripts/server_browser/__init__.lua size 49200.
