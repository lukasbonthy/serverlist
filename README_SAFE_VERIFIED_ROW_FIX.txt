Safe Swifly server browser row fix.

The previous glow/pulse version added extra UI children to a UIHorizontalList row.
That caused the server names to spill into the right details panel.

This version keeps the layout safe:
- [SWIFLY VERIFIED] prefix stays inside the existing server name text box
- built-in RefrigeratorDeluxe font
- cyan Swifly color
- no extra row background/glow elements

Manifest updated:
data/ui_scripts/server_browser/__init__.lua = ['data/ui_scripts/server_browser/__init__.lua', 44891, '7CA1E7051E02D97414EE7BC03F85B469FC1CE8AD']
