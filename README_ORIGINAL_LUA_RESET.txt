Swifly original Lua reset

This build restores the server browser Lua from the original uploaded __init__(5).lua.

Restored file:
public/boiii/data/ui_scripts/server_browser/__init__.lua

Manifest entry:
data/ui_scripts/server_browser/__init__.lua = ["data/ui_scripts/server_browser/__init__.lua", 43618, "6EAAF7A299CE5D4977E397A930E0C3F30BBE183A"]

Kept:
- server.js root/path fix so boiii.json does not return []
- existing app/server structure from the working deploy zip

Removed:
- Swifly verified prefix
- glow
- pulse
- row background
- cyan font override
- any custom server-name styling added after the original file

After deploy, check:
https://client.swifly.net/boiii.json?nocache=1

Then search for:
data/ui_scripts/server_browser/__init__.lua
