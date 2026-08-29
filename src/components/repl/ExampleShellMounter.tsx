/**
 * Mounts per-example "Try" buttons on an extension page.
 *
 * Rendered as an Astro React island (so the React runtime/preamble is present),
 * it scans the server-rendered SQL code blocks, attaches a run control to each,
 * and — on click — renders an isolated ExampleShell below that block via a React
 * portal. Extension pages use a compact toolbar icon; narrative pages can keep
 * the larger CTA row. The engine boots once and is shared; each shell runs in
 * its own sandbox session (see src/lib/repl/duckdb-boot.ts).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ExampleShell from "./ExampleShell";

const STYLE_ID = "example-shell-style";
const ATTACHED = "exampleShellAttached";

const PLAY_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>';
const HIDE_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const TRY_LABEL = `<span class="example-try-icon">${PLAY_ICON}</span><span>Try it in your browser</span>`;
const HIDE_LABEL = `<span class="example-try-icon">${HIDE_ICON}</span><span>Hide</span>`;
const RUN_ICON_LABEL = `<span class="example-toolbar-icon">${PLAY_ICON}</span><span>Run via WASM</span>`;
const CLOSE_ICON_LABEL = `<span class="example-toolbar-icon">${HIDE_ICON}</span><span>Hide</span>`;

const STYLE = `
/* The Try button used to live as a small pill inside the code block's top
   toolbar, next to Copy — it read as a secondary/technical control there and
   got missed. It now sits centred on its own bar directly under the block:
   a rounded pill in the same fill Button.astro's primary variant uses, with
   the play icon in a soft circular chip and a lift on hover — the same
   "designed CTA" language as every other button on the site, not a flat
   mono bar. .example-run-bar itself is a plain DOM node (created here with
   document.createElement, not JSX), which is exactly what lets an unrelated
   island — LiveTrainBoard.tsx, for its second "live board" button — portal
   its own button into this same bar rather than opening a second row: the
   flex-wrap/gap above is sized for that, not just this component's own
   single button. */
.example-run-bar {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}
.example-try-button {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 9px 20px 9px 10px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.005em;
  line-height: 1.3;
  border-radius: 999px;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease,
    box-shadow 220ms ease, transform 180ms ease;
  /* Light ground: field-700 fill / white text, 5.1:1+ on paper — the same
     solid primary the rest of the site uses for its main call to action. */
  color: #fff;
  background: #45632f;
  border: 1px solid #45632f;
  box-shadow: 0 1px 2px rgba(26, 21, 18, 0.10), 0 10px 22px -12px rgba(69, 99, 47, 0.65);
}
.example-try-button:hover {
  background: #33501f;
  border-color: #33501f;
  box-shadow: 0 2px 4px rgba(26, 21, 18, 0.12), 0 14px 26px -12px rgba(51, 80, 31, 0.7);
  transform: translateY(-1px);
}
.example-try-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(26, 21, 18, 0.10);
}
/* Dark ground (code always sits on rock-900 — brief §3): the light-mode fill
   reads muddy there, so this matches Button.astro's own darkVariants.primary —
   a lighter field-600 fill, hover lightens further to field-400 and the label
   flips to ink so it stays readable against the lighter fill. */
.example-try-button.is-on-dark {
  background: #5f7a3c;
  border-color: #5f7a3c;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 22px -12px rgba(95, 122, 60, 0.55);
}
.example-try-button.is-on-dark:hover {
  background: #7a9a54;
  border-color: #7a9a54;
  color: #1a1512;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35), 0 14px 26px -12px rgba(122, 154, 84, 0.6);
}
.example-try-button:focus-visible {
  outline: 2px solid #45632f;
  outline-offset: 2px;
}
.example-try-button.is-on-dark:focus-visible {
  outline-color: #7a9a54;
}
/* The play/hide glyph sits in its own soft chip rather than bare inline —
   the small circular backdrop is what keeps a text-sized icon from reading
   as an afterthought next to a 14px label. */
.example-try-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
}
.example-try-button.is-on-dark .example-try-icon {
  background: rgba(26, 21, 18, 0.16);
}
.example-try-button.is-on-dark:hover .example-try-icon {
  background: rgba(26, 21, 18, 0.22);
}
.example-try-icon svg { display: block; }
.example-toolbar-run-button {
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}
.example-toolbar-run-button[aria-expanded="true"] {
  color: #e9e1d3;
  background: #2a2420;
}
.example-toolbar-icon,
.example-toolbar-icon svg {
  display: block;
}
@media (prefers-reduced-motion: reduce) {
  .example-try-button,
  .example-toolbar-run-button { transition: none; }
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

/**
 * Extract runnable SQL from a code block. Two renderers feed this component:
 * CodeBlock.astro (Prism, hand-authored examples) puts the whole snippet in a
 * single text node, where `.textContent` is exactly the source string.
 * Expressive Code (MDX/Markdown fences — cookbook.mdx, technical-details.mdx)
 * instead lays out each line as its own block-level `.ec-line` div with no
 * literal "\n" between them; the line break is CSS, not a character, so
 * `.textContent` there runs every line together while still preserving each
 * line's own indentation — which is exactly the "no spacing" bug this guards
 * against. Rejoin on "\n" whenever that per-line structure is present.
 */
function getSql(pre: HTMLElement): string {
  const code = pre.querySelector("code");
  if (!code) return (pre.textContent ?? "").trim();

  const lines = code.querySelectorAll(":scope > .ec-line");
  if (lines.length > 0) {
    return Array.from(lines).map((line) => line.textContent ?? "").join("\n").trim();
  }

  return (code.textContent ?? "").trim();
}

/** Relative luminance (WCAG) of a computed `rgb()`/`rgba()` string, or null when
 *  the colour is fully transparent or unparseable. */
function luminanceOf(color: string): number | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  if (parts.length > 3 && parts[3] === 0) return null; // transparent — keep looking
  const [r, g, b] = parts.slice(0, 3).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** True when the nearest painted ancestor background is dark. The Try button
 *  sits directly under a code block this component does not own (CodeBlock.astro
 *  renders it), so which fill it should take — light-mode field-700 or the
 *  lighter dark-mode field-600 — has to be measured rather than assumed. See
 *  the contrast law in DESIGN_BRIEF.md §3.
 *
 *  Dark is the default: code always sits on rock-900 (brief §3), so a toolbar
 *  attached to a code block is dark unless it measurably isn't. A gradient
 *  ground can't be sampled from a computed style, and around code it is always
 *  a dark one, so it counts as dark too.
 *
 *  The walk goes 20 levels up, not 6: every ancestor between an Expressive
 *  Code block's run bar and the real page background is transparent (the
 *  .expressive-code wrapper, .prose, the doc section, the two-column grid,
 *  <main> itself) — the actual bg-soil-50 doesn't land until <body>, 7 levels
 *  up from the block. The old 6-deep cap hit its limit first and fell through
 *  to the dark default, so this button read as dark-ground styled even after
 *  moving outside the code frame onto the page's own paper background. */
function isOnDarkGround(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  for (let depth = 0; node && depth < 20; depth++) {
    const cs = getComputedStyle(node);
    if (cs.backgroundImage && cs.backgroundImage.includes("gradient")) return true;
    const lum = luminanceOf(cs.backgroundColor);
    if (lum !== null) return lum < 0.18;
    node = node.parentElement;
  }
  return true;
}

/** Find the code block's top toolbar (CodeBlock renders one as the element just
 *  before the <pre>), or create one for blocks that lack it (e.g. MDX/Shiki).
 *  The Try button goes in here so it sits in a bar above the query, never over
 *  it. Returns the bar plus an undo for whatever we had to change.
 *
 *  A created bar has to be *joined* to the block below it, not merely placed
 *  above it. MDX code blocks are styled by the prose rules — 8px rounding, a
 *  rock-800 border, and `margin-top: 1.5rem` — so a bar inserted as a previous
 *  sibling landed 24px clear of the code with both boxes separately rounded,
 *  reading as a stray slab rather than the block's own toolbar. So the bar takes
 *  over the block's top margin and rounding, and the `<pre>` gives up its top
 *  corners and border for as long as the bar is there. */
function findOrCreateToolbar(pre: HTMLElement): { bar: HTMLElement; cleanup: () => void } {
  const prev = pre.previousElementSibling as HTMLElement | null;
  if (prev && (prev.classList.contains("code-block-toolbar") || prev.querySelector(":scope > .copy-button"))) {
    const controls = prev.querySelector<HTMLElement>(":scope > .code-block-controls");
    return { bar: controls ?? prev, cleanup: () => {} };
  }

  const preStyle = getComputedStyle(pre);
  const restore = {
    marginTop: pre.style.marginTop,
    borderTopLeftRadius: pre.style.borderTopLeftRadius,
    borderTopRightRadius: pre.style.borderTopRightRadius,
    borderTopWidth: pre.style.borderTopWidth,
  };

  const bar = document.createElement("div");
  bar.className = "code-block-toolbar";
  Object.assign(bar.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "0.25rem",
    padding: "0.25rem 0.5rem",
    // Code always sits on rock-900; the bar above it is rock-950 with a
    // rock-800 rule, matching the .panel-head shape on the dark side.
    background: "#100d0a",
    border: `1px solid ${preStyle.borderTopColor || "#2a2420"}`,
    borderBottom: "1px solid #2a2420",
    // Inherit the block's own top rounding and top margin, so the pair reads as
    // one box sitting where the code block used to sit.
    borderTopLeftRadius: preStyle.borderTopLeftRadius,
    borderTopRightRadius: preStyle.borderTopRightRadius,
    marginTop: preStyle.marginTop,
  });

  pre.style.marginTop = "0";
  pre.style.borderTopLeftRadius = "0";
  pre.style.borderTopRightRadius = "0";
  pre.style.borderTopWidth = "0";

  pre.parentElement?.insertBefore(bar, pre);

  return {
    bar,
    cleanup: () => {
      bar.remove();
      pre.style.marginTop = restore.marginTop;
      pre.style.borderTopLeftRadius = restore.borderTopLeftRadius;
      pre.style.borderTopRightRadius = restore.borderTopRightRadius;
      pre.style.borderTopWidth = restore.borderTopWidth;
    },
  };
}

/** MDX code blocks (technical-details.mdx, cookbook.mdx) render through
 *  Expressive Code, which ships its own "Copy to clipboard" button — a `.copy`
 *  div (an aria-live region plus the `<button>`) rendered as a *sibling* of
 *  `<pre>` inside the wrapping `<figure class="frame">`, absolutely
 *  positioned over the code's top-right corner. Left alone, that reads as a
 *  second, differently-styled control floating apart from the toolbar this
 *  component builds for the Copy button CodeBlock.astro blocks already have —
 *  two affordances for one action, worse on narrow screens where they can
 *  visually collide. Adopt it into the shared toolbar instead of adding a
 *  competing button of our own: move the whole `.copy` div (not just the
 *  button) so its aria-live announcement and click wiring — both written
 *  assuming they stay put in the figure — keep working, and only override the
 *  positioning that assumed it too.
 *
 *  Server-rendered, so it's already in the DOM by the time this runs — no
 *  need to watch for it. CodeBlock.astro blocks have no `.copy` sibling
 *  (there's nothing to adopt), so this is a no-op for them; they keep their
 *  own toolbar button untouched.
 *
 *  On a hover-capable device, Expressive Code's own stylesheet hides this
 *  button by default (`opacity: 0`) and reveals it on hovering the frame,
 *  focusing a sibling before it in DOM order, or showing its "Copied!"
 *  toast — floating unlabelled over the code, hide-until-hover avoids
 *  permanent visual clutter. None of that reasoning survives the move: it
 *  now lives in an always-visible toolbar (like CodeBlock.astro's own Copy
 *  button, never hidden), sits *before* `<pre>` in the new DOM order (so
 *  the focus-a-sibling reveal can't fire for anything after it), and
 *  hide-by-default there just reads as broken rather than tidy. Force it
 *  permanently visible instead of relying on any of those triggers.
 *
 *  Extension prose overrides that icon-only touch control with the same text
 *  "Copy" action CodeBlock.astro renders. Do not pin a square size here: that
 *  would override the text control and recreate the tall mobile toolbar. */
function adoptProseCopyButton(pre: HTMLElement, bar: HTMLElement): () => void {
  const copyWrapper = pre.parentElement?.querySelector<HTMLElement>(":scope > .copy") ?? null;
  if (copyWrapper) {
    const originalParent = copyWrapper.parentNode;
    const originalNextSibling = copyWrapper.nextSibling;
    const originalWrapperStyle = copyWrapper.getAttribute("style");
    const btn = copyWrapper.querySelector<HTMLElement>("button");
    const originalButtonStyle = btn?.getAttribute("style") ?? null;
    Object.assign(copyWrapper.style, {
      position: "static",
      inset: "auto",
      margin: "0",
    });
    if (btn) btn.style.opacity = "1";
    bar.appendChild(copyWrapper);

    return () => {
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent?.insertBefore(copyWrapper, originalNextSibling);
      } else {
        originalParent?.appendChild(copyWrapper);
      }
      if (originalWrapperStyle === null) copyWrapper.removeAttribute("style");
      else copyWrapper.setAttribute("style", originalWrapperStyle);
      if (btn) {
        if (originalButtonStyle === null) btn.removeAttribute("style");
        else btn.setAttribute("style", originalButtonStyle);
      }
    };
  }
  return () => {};
}

interface OpenShell {
  id: number;
  container: HTMLElement;
  sql: string;
  onClose: () => void;
}

interface Props {
  extensionName: string;
  installSource: string;
  /** Put a compact run icon beside Copy instead of a repeated CTA below each
   *  block. The below-block control remains the default for narrative pages
   *  whose bespoke examples portal additional actions into that row. */
  controls?: "below" | "toolbar";
  /** Raw check-fixtures.sql for this extension, run once per session to seed
   *  the sample tables the examples reference. Null when the extension has none. */
  fixtures?: string | null;
}

export default function ExampleShellMounter({
  extensionName,
  installSource,
  fixtures,
  controls = "below",
}: Props) {
  const [shells, setShells] = useState<OpenShell[]>([]);

  useEffect(() => {
    ensureStyle();
    const cleanupByBlock = new Map<HTMLElement, () => void>();
    let counter = 0;

    const attachExamples = (root: ParentNode = document) => {
      root
      .querySelectorAll<HTMLElement>('pre[data-language="sql"]')
      .forEach((pre) => {
        if (pre.dataset[ATTACHED] === "true") return;
        const sql = getSql(pre);
        if (!sql) return;
        pre.dataset[ATTACHED] = "true";

        // Both rendering paths expose one toolbar. MDX blocks get one here and
        // donate Expressive Code's own wired copy control to it; CodeBlock.astro
        // already supplied the toolbar and text Copy button.
        const { bar, cleanup: restoreToolbar } = findOrCreateToolbar(pre);
        const stopAdopting = adoptProseCopyButton(pre, bar);
        const id = ++counter;
        // The shell (and, on narrative pages, its run bar) goes immediately
        // after whichever element is the whole visual block. For CodeBlock.astro
        // blocks that's .code-block-wrapper; for Expressive Code blocks
        // (MDX/Markdown fences) <pre> only reaches its toolbar-and-code
        // portion — its actual parent is <figure class="frame">, which draws
        // its own box-shadow around that whole figure. Landing the run bar as
        // a plain sibling of <pre> left it inside that figure, still inside
        // the shadowed frame the code sits in, floating in unstyled space
        // below it rather than clearly being its own control on the page.
        const blockRoot =
          (pre.closest(".code-block-wrapper") as HTMLElement | null) ??
          (pre.closest("figure.frame") as HTMLElement | null) ??
          pre;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-expanded", "false");

        let runBar: HTMLElement | null = null;
        if (controls === "toolbar") {
          btn.className = "code-toolbar-button example-toolbar-run-button";
          btn.setAttribute("aria-label", "Run this example via WebAssembly");
          btn.title = "Run via WASM";
          btn.innerHTML = RUN_ICON_LABEL;
          bar.appendChild(btn);
        } else {
          // Narrative pages keep the larger CTA row: bespoke examples such as
          // the live train board portal a second action into this same node.
          runBar = document.createElement("div");
          runBar.className = "example-run-bar";
          btn.className = "example-try-button";
          if (isOnDarkGround(blockRoot.parentElement ?? blockRoot)) btn.classList.add("is-on-dark");
          btn.setAttribute("aria-label", "Run this example in an in-browser shell");
          btn.innerHTML = TRY_LABEL;
          runBar.appendChild(btn);
          blockRoot.insertAdjacentElement("afterend", runBar);
        }

        // One reusable shell container per block, appended/removed on toggle.
        const container = document.createElement("div");

        const close = () => {
          btn.innerHTML = controls === "toolbar" ? RUN_ICON_LABEL : TRY_LABEL;
          btn.setAttribute("aria-expanded", "false");
          if (controls === "toolbar") {
            btn.setAttribute("aria-label", "Run this example via WebAssembly");
            btn.title = "Run via WASM";
          }
          setShells((prev) => prev.filter((s) => s.id !== id));
          container.remove();
        };
        const open = () => {
          const shellAnchor = controls === "toolbar" ? blockRoot : runBar;
          shellAnchor?.insertAdjacentElement("afterend", container);
          btn.innerHTML = controls === "toolbar" ? CLOSE_ICON_LABEL : HIDE_LABEL;
          btn.setAttribute("aria-expanded", "true");
          if (controls === "toolbar") {
            btn.setAttribute("aria-label", "Hide the in-browser shell");
            btn.title = "Hide browser shell";
          }
          setShells((prev) =>
            prev.some((s) => s.id === id) ? prev : [...prev, { id, container, sql, onClose: close }],
          );
          container.scrollIntoView({ behavior: "smooth", block: "nearest" });
        };

        btn.addEventListener("click", () => {
          if (container.parentElement) close();
          else open();
        });

        cleanupByBlock.set(pre, () => {
          close();
          runBar?.remove();
          btn.remove();
          stopAdopting();
          restoreToolbar();
          delete pre.dataset[ATTACHED];
        });
      });
    };

    const detachExamples = (root: HTMLElement) => {
      for (const [pre, cleanup] of cleanupByBlock) {
        if (!root.contains(pre)) continue;
        cleanup();
        cleanupByBlock.delete(pre);
      }
    };

    const onContentLoaded = (event: Event) => {
      const root = (event as CustomEvent<{ root?: HTMLElement }>).detail?.root;
      attachExamples(root ?? document);
    };
    const onContentWillUnload = (event: Event) => {
      const root = (event as CustomEvent<{ root?: HTMLElement }>).detail?.root;
      if (root) detachExamples(root);
    };

    attachExamples();
    document.addEventListener('qf:content-loaded', onContentLoaded);
    document.addEventListener('qf:content-will-unload', onContentWillUnload);

    return () => {
      document.removeEventListener('qf:content-loaded', onContentLoaded);
      document.removeEventListener('qf:content-will-unload', onContentWillUnload);
      cleanupByBlock.forEach(cleanup => cleanup());
      cleanupByBlock.clear();
    };
  }, [extensionName, installSource, fixtures, controls]);

  return (
    <>
      {shells.map((s) =>
        createPortal(
          <ExampleShell
            extensionName={extensionName}
            installSource={installSource}
            fixtures={fixtures}
            sql={s.sql}
            onClose={s.onClose}
          />,
          s.container,
          String(s.id),
        ),
      )}
    </>
  );
}
