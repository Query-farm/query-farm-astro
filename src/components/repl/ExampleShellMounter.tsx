/**
 * Mounts per-example "Try" buttons on an extension page.
 *
 * Rendered as an Astro React island (so the React runtime/preamble is present),
 * it scans the server-rendered SQL code blocks, attaches a small ▶ Try button to
 * each, and — on click — renders an isolated ExampleShell into a container placed
 * right below that block via a React portal. The engine boots once and is shared;
 * each shell runs in its own sandbox session (see src/lib/repl/duckdb-boot.ts).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ExampleShell from "./ExampleShell";

const STYLE_ID = "example-shell-style";
const ATTACHED = "exampleShellAttached";

const PLAY_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="13 2 3 14 11 14 11 22 21 10 13 10 13 2"></polygon></svg>';
const HIDE_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const TRY_LABEL = `<span class="example-try-icon">${PLAY_ICON}</span><span>Try it in your browser</span>`;
const HIDE_LABEL = `<span class="example-try-icon">${HIDE_ICON}</span><span>Hide</span>`;

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
@media (prefers-reduced-motion: reduce) {
  .example-try-button { transition: none; }
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

function getSql(pre: HTMLElement): string {
  return (pre.querySelector("code")?.textContent ?? pre.textContent ?? "").trim();
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
 *  a dark one, so it counts as dark too. */
function isOnDarkGround(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  for (let depth = 0; node && depth < 6; depth++) {
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
    return { bar: prev, cleanup: () => {} };
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
    padding: "0.375rem 0.5rem",
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

/** MDX code blocks get their Copy button from a separate inline script that runs
 *  on DOMContentLoaded, appended *inside* the `<pre>` and positioned over the
 *  code. Once this component adds a toolbar, that leaves the two controls in
 *  different places. Move Copy into the bar so they read as one cluster.
 *
 *  The button may not exist yet — the two scripts race, and which lands first
 *  varies — so watch briefly for it rather than checking once and giving up. */
function adoptProseCopyButton(pre: HTMLElement, bar: HTMLElement): () => void {
  let observer: MutationObserver | null = null;

  const move = (btn: HTMLElement): void => {
    // Its stylesheet rule is `.prose pre .copy-btn`, so moving it out of the
    // <pre> drops every one of those declarations and the browser's default
    // button chrome shows through. Restate the shape inline, matching the Copy
    // button CodeBlock renders in its own toolbar.
    Object.assign(btn.style, {
      position: "static",
      margin: "0",
      display: "inline-flex",
      alignItems: "center",
      gap: "0.25rem",
      padding: "0.25rem 0.625rem",
      fontSize: "13px",
      fontWeight: "500",
      lineHeight: "1.4",
      color: "#c6b8a2",
      background: "transparent",
      border: "1px solid transparent",
      borderRadius: "0.375rem",
      cursor: "pointer",
    });
    bar.appendChild(btn);
  };

  const existing = pre.querySelector<HTMLElement>(":scope > .copy-btn");
  if (existing) {
    move(existing);
  } else {
    observer = new MutationObserver(() => {
      const btn = pre.querySelector<HTMLElement>(":scope > .copy-btn");
      if (!btn) return;
      move(btn);
      observer?.disconnect();
      observer = null;
    });
    observer.observe(pre, { childList: true });
  }

  return () => observer?.disconnect();
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
  /** Raw check-fixtures.sql for this extension, run once per session to seed
   *  the sample tables the examples reference. Null when the extension has none. */
  fixtures?: string | null;
}

export default function ExampleShellMounter({ extensionName, installSource, fixtures }: Props) {
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

        // The top toolbar still exists (and still hosts Copy — for MDX blocks
        // that means adopting a copy button that lands there asynchronously),
        // but Try no longer lives in it: a small pill up there competed with
        // Copy and the title for attention and went unnoticed.
        const { bar, cleanup: restoreToolbar } = findOrCreateToolbar(pre);
        const stopAdopting = adoptProseCopyButton(pre, bar);
        const id = ++counter;
        const blockRoot = (pre.closest(".code-block-wrapper") as HTMLElement | null) ?? pre;

        // Try now gets its own bar directly under the block — a full-width,
        // unmissable button rather than a toolbar pill.
        const runBar = document.createElement("div");
        runBar.className = "example-run-bar";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "example-try-button";
        if (isOnDarkGround(blockRoot)) btn.classList.add("is-on-dark");
        btn.setAttribute("aria-label", "Run this example in an in-browser shell");
        btn.innerHTML = TRY_LABEL;
        runBar.appendChild(btn);
        blockRoot.insertAdjacentElement("afterend", runBar);

        // The shell opens below the run bar. One reusable container per
        // block, appended/removed on toggle.
        const container = document.createElement("div");

        const close = () => {
          btn.innerHTML = TRY_LABEL;
          setShells((prev) => prev.filter((s) => s.id !== id));
          container.remove();
        };
        const open = () => {
          runBar.insertAdjacentElement("afterend", container);
          btn.innerHTML = HIDE_LABEL;
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
          runBar.remove();
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
  }, [extensionName, installSource, fixtures]);

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
