Query.Farm blog readability prototypes

Run from the repository root:
  python3 -m http.server 4397 --bind 127.0.0.1 --directory design/blog-readability

Open http://127.0.0.1:4397/ in Safari.

The comparison uses a captured copy of the published Flight/VGI article and its
production stylesheets. No production source styles are changed. The snapshot
removes production JavaScript; links open separately. Images and Google Fonts
still load from their original hosts, so the preview needs internet access.

A / Clear green (recommended): retain #45632f; medium weight, solid 1.5px underline.
B / Editorial blue: use #245ca2 with the same weight and underline.
C / Soft highlight: clear green with a pale green #e2ead7 background.

All proposals default to consistent #302e2b body ink, including regular paragraphs,
paragraphs after headings, bold text, list items, table text, and headings. The
toggle isolates this change. The production font, size, spacing and paper remain
the same. Captions, section labels, syntax highlighting and other specialized
content retain their production styles.

Use the section menu to compare the opening, mixed heading/emphasis, inline code,
and dense links. The panes synchronize by paragraph position. Uncheck Side by side
for a full-width article. Mobile shows the proposed article at its normal width.
The URL preserves the chosen treatment and controls.

To refresh the article snapshot:
  node design/blog-readability/capture.mjs

Implementation candidates are isolated in treatments.css. Applying a choice to
the site should be a separate, deliberate edit to src/pages/blog/[slug].astro and
any relevant shared prose styling in src/styles/global.css.
