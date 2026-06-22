SWIFLY BOLD-ONLY SERVER NAME PATCH — CLEAN FULL ZIP

This zip includes BOTH correct placements because there are two different projects involved.

1) Render updater/site project path:
   public/boiii/data/ui_scripts/server_browser/__init__.lua

2) Swifly-Client source repo path:
   data/ui_scripts/server_browser/__init__.lua

The Lua is the same in both places.

What it does:
- Keeps the real server name unchanged.
- If server name contains "swifly", only the existing name textbox changes.
- Swifly name uses fonts/RefrigeratorDeluxe-Regular.ttf.
- Swifly name becomes cyan.
- Non-Swifly names reset to default.ttf and white.

What it DOES NOT contain:
- No SWIFLY VERIFIED text
- No SWIFLY FEATURED text
- No extra UI elements
- No glow layer
- No pulse animation
- No row background
- No layout/column changes

Manifest entry for Render updater:
data/ui_scripts/server_browser/__init__.lua = ["data/ui_scripts/server_browser/__init__.lua", 44425, "412103E9431060DCFF60B69707959665A33BFC0A"]

After deploying the Render updater/site project, check:
https://client.swifly.net/boiii.json?nocache=1

The line for data/ui_scripts/server_browser/__init__.lua must show:
44425
412103E9431060DCFF60B69707959665A33BFC0A
