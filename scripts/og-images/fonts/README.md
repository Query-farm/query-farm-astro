# OG image fonts

Static-weight instances of the two site typefaces, for `satori` to rasterize
into generated Open Graph images (`scripts/og-images/render.mjs`). Committed
here rather than fetched at build time, same reasoning as the usage snapshots
in `generated/usage.json`: a production build must be deterministic and
offline.

Both families ship from Google Fonts as **variable** fonts only (weight axis,
no static cuts) — see `google/fonts` repo, `ofl/petrona/Petrona[wght].ttf` and
`ofl/commissioner/Commissioner[FLAR,VOLM,slnt,wght].ttf`. Satori does not
interpolate variable axes, so each weight actually used on an OG card was
pinned to a static instance with `fonttools`:

```sh
python3 -m venv .fontenv && .fontenv/bin/pip install fonttools brotli
.fontenv/bin/python3 -m fontTools.varLib.instancer -o Petrona-600.ttf Petrona[wght].ttf wght=600
.fontenv/bin/python3 -m fontTools.varLib.instancer -o Petrona-700.ttf Petrona[wght].ttf wght=700
.fontenv/bin/python3 -m fontTools.varLib.instancer -o Commissioner-400.ttf 'Commissioner[FLAR,VOLM,slnt,wght].ttf' wght=400 slnt=0 FLAR=0 VOLM=0
.fontenv/bin/python3 -m fontTools.varLib.instancer -o Commissioner-500.ttf 'Commissioner[FLAR,VOLM,slnt,wght].ttf' wght=500 slnt=0 FLAR=0 VOLM=0
.fontenv/bin/python3 -m fontTools.varLib.instancer -o Commissioner-600.ttf 'Commissioner[FLAR,VOLM,slnt,wght].ttf' wght=600 slnt=0 FLAR=0 VOLM=0
```

Both fonts are SIL Open Font License 1.1 (see the `OFL.txt` alongside each
family in google/fonts) — redistribution as part of this repo's tooling is
permitted.
