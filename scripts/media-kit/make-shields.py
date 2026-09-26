"""Build the media kit's shield badges (public/media-kit/shields/*.svg).

Each badge is a dark label box and a gold "query.farm" box with the Strata Sun disc, set in
Noto Sans Bold at 11.5px. The font is embedded as a WOFF2 subset of just the glyphs a badge
uses (a few KB), so the label renders in the brand face on any host that allows fonts in
an SVG, with a system-sans fallback where it doesn't.

Box widths follow the text: the label box is 10px, the label, then the badge's own right
padding; the value box is 39px (disc and gap), "query.farm", then its padding. Those paddings
were carried over from the Commissioner-era badges when Noto Sans replaced it, so the
proportions are unchanged.

    uv run --with fonttools --with brotli python scripts/media-kit/make-shields.py
"""
import base64
import io
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(__file__).resolve().parents[2] / "public" / "media-kit" / "shields"
SOURCE = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth,wght%5D.ttf"
SIZE = 11.5
VALUE = "query.farm"
VALUE_PAD = 23  # right padding after "query.farm"
# file stem → (label, right padding after the label)
BADGES = {
    "built-with-query-farm": ("built with", 24),
    "powered-by-haybarn": ("powered by haybarn", 29),
    "vgi-worker": ("vgi worker", 24),
    "duckdb-extension": ("duckdb extension", 25),
}


def main() -> None:
    with urllib.request.urlopen(SOURCE) as response:
        variable = response.read()
    bold = instancer.instantiateVariableFont(TTFont(io.BytesIO(variable)), {"wght": 700, "wdth": 100})
    buffer = io.BytesIO()
    bold.save(buffer)
    source = buffer.getvalue()
    cmap, hmtx, upm = bold.getBestCmap(), bold["hmtx"], bold["head"].unitsPerEm

    def width(text: str) -> float:
        return sum(hmtx[cmap[ord(char)]][0] for char in text) * SIZE / upm

    for stem, (label, label_pad) in BADGES.items():
        font = TTFont(io.BytesIO(source))
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["kern", "liga"]
        subsetter = subset.Subsetter(options)
        subsetter.populate(text=label + VALUE)
        subsetter.subset(font)
        woff2 = io.BytesIO()
        font.save(woff2)
        data = base64.b64encode(woff2.getvalue()).decode()

        left = round(10 + width(label) + label_pad)
        right = round(39 + width(VALUE) + VALUE_PAD)
        total = left + right
        ident = stem.replace("-", "") + "svg"
        family = "Noto Sans,Verdana,DejaVu Sans,Geneva,sans-serif"
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="21" role="img" aria-label="{label}: {VALUE}">
  <title>{label}: {VALUE}</title>
  <defs>
    <style>
      @font-face {{
        font-family: 'Noto Sans';
        font-weight: 700;
        src: url(data:font/woff2;base64,{data}) format('woff2');
      }}
    </style>
    <clipPath id="{ident}-disc"><circle cx="8" cy="8" r="8"/></clipPath>
    <linearGradient id="{ident}-value" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a9762e"/>
      <stop offset="1" stop-color="#7d5714"/>
    </linearGradient>
    <linearGradient id="{ident}-sheen" x2="0" y2="100%">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/>
      <stop offset=".5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="{ident}-round"><rect x=".5" y=".5" width="{total - 1}" height="20" rx="3.5"/></clipPath>
  </defs>
  <g clip-path="url(#{ident}-round)">
    <rect width="{left}" height="21" fill="#211a12"/>
    <rect x="{left}" width="{right}" height="21" fill="url(#{ident}-value)"/>
    <rect width="{total}" height="21" fill="url(#{ident}-sheen)"/>
  </g>
  <rect x=".5" y=".5" width="{total - 1}" height="20" rx="3.5" fill="none" stroke="#000" stroke-opacity=".25"/>
  <g font-family="{family}" font-size="{SIZE}" font-weight="700" text-rendering="geometricPrecision">
    <text x="10" y="14.5" fill="#f4ece0">{label}</text>
  </g>

    <g clip-path="url(#{ident}-disc)" transform="translate({left + 10} 2.5)">
      <circle cx="8" cy="8" r="8.6" fill="#f4ece0" opacity=".6"/>
      <rect x="0" y="0"    width="16" height="4" fill="#F0C877"/>
      <rect x="0" y="4"    width="16" height="4" fill="#D9A441"/>
      <rect x="0" y="8"    width="16" height="4" fill="#A9762E"/>
      <rect x="0" y="12"   width="16" height="4" fill="#7A5230"/>
    </g>
  <g font-family="{family}" font-size="{SIZE}" font-weight="700" text-rendering="geometricPrecision">
    <text x="{left + 39}" y="14.5" fill="#f4ece0">{VALUE}</text>
  </g>
</svg>
'''
        (OUT / f"{stem}.svg").write_text(svg)
        print(f"{stem}.svg: {total}px wide (label box {left}), {len(woff2.getvalue())} bytes of font")


main()
