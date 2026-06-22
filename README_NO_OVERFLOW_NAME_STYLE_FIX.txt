Swifly no-overflow server name style fix

This build is based on your original uploaded __init__.lua and ONLY changes the existing server name textbox.

It removes the broken ideas that caused the server names to fly into the right preview panel:
- no [SWIFLY VERIFIED] prefix
- no extra glow text element
- no extra row background element
- no pulsing driver
- no extra columns in UIHorizontalList

It keeps a safe visual difference:
- Swifly server names use fonts/RefrigeratorDeluxe-Regular.ttf
- Swifly server names are cyan
- non-Swifly rows reset to default font/color

Manifest entry:
data/ui_scripts/server_browser/__init__.lua = ["data/ui_scripts/server_browser/__init__.lua", 44431, "67873615284D8317220A494D1D00AFC19A9C8038"]

After deploy, open:
https://client.swifly.net/boiii.json?nocache=1

Make sure the __init__.lua line matches the size/hash above.
