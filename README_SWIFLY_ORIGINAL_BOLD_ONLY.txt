Swifly original Lua + bold-only server name

Built from the original uploaded __init__(5).lua.

What this does:
- Keeps the real server name text unchanged.
- If server name contains "swifly", only changes the existing name textbox to:
  - fonts/RefrigeratorDeluxe-Regular.ttf
  - cyan RGB color
- Non-Swifly rows reset to default.ttf and white.

What this DOES NOT include:
- No SWIFLY VERIFIED text
- No SWIFLY FEATURED text
- No extra UI elements
- No glow layer
- No pulse animation
- No background overlay
- No layout/column changes

Manifest entry:
data/ui_scripts/server_browser/__init__.lua = ["data/ui_scripts/server_browser/__init__.lua", 44406, "1297B0C5A57C7C709592037252517C0AE5694CC2"]

After deploy, check:
https://client.swifly.net/boiii.json?nocache=1

Search for:
data/ui_scripts/server_browser/__init__.lua

Expected size/hash:
44406
1297B0C5A57C7C709592037252517C0AE5694CC2
