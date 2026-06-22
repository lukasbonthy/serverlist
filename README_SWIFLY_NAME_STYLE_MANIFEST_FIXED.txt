SWIFLY SERVER NAME STYLE + MANIFEST FIX

This zip has the patched server browser Lua and matching manifests.

Patched file:
public/boiii/data/ui_scripts/server_browser/__init__.lua

Manifest entry should be:
["data/ui_scripts/server_browser/__init__.lua", 44399, "08926C36AFAD969ABBC5948B91CB6F44789DB335"]

Updated copies:
- public/boiii.json
- boiii.json
- public/boiii-beta.json
- boiii-beta.json

After uploading/deploying, check:
https://client.swifly.net/manifest-debug.json

It should show actualSize 44399, actualSha1 08926C36AFAD969ABBC5948B91CB6F44789DB335, and matches true.
