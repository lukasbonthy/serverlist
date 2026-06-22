Swifly featured name patch from original Lua

This starts from the original uploaded __init__(5).lua.

What changed:
- Only the existing server-name textbox was modified.
- Swifly rows display as: >> SWIFLY FEATURED <<
- Swifly rows use fonts/RefrigeratorDeluxe-Regular.ttf
- Swifly rows are cyan.
- Non-Swifly rows reset to default font/white.

What was NOT added:
- No extra UI elements
- No glow layers
- No row backgrounds
- No pulse animation
- No verified prefix
- No longer original server name that can overflow

Manifest entry:
data/ui_scripts/server_browser/__init__.lua = ["data/ui_scripts/server_browser/__init__.lua", 44423, "A250230CE5767B7F4B6FC944EE593A1244B9E9D1"]

After deploy:
Open https://client.swifly.net/boiii.json?nocache=1
Confirm this same size/hash appears.
