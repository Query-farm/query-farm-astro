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
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="13 2 3 14 11 14 11 22 21 10 13 10 13 2"></polygon></svg>';
const HIDE_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const TRY_LABEL = `${PLAY_ICON}<span>Try using WASM</span>`;
const HIDE_LABEL = `${HIDE_ICON}<span>Hide</span>`;

const STYLE = `
.example-try-button {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  font-family: inherit;
  /* Amber "preview chip" of the live shell it opens — borrows the shell's dark
     surface (#0f1714) and duck-amber accent so it stands out from the green
     code block and signals "this opens the interactive thing". */
  color: rgb(252, 211, 77);
  background: rgba(15, 23, 20, 0.85);
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 0.25rem;
  backdrop-filter: blur(4px);
  cursor: pointer;
  z-index: 10;
  transition: color 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
.example-try-button:hover {
  color: rgb(253, 230, 138);
  background: rgba(15, 23, 20, 0.95);
  border-color: rgba(251, 191, 36, 0.6);
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.15);
}
.example-try-button[data-offset-copy="true"] { right: 5.75rem; }
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

/** Return a position:relative ancestor to anchor the button against, wrapping
 *  the <pre> if it has no positioned parent (e.g. MDX/Shiki blocks). */
function positionedHost(pre: HTMLElement): HTMLElement {
  const parent = pre.parentElement;
  if (parent && getComputedStyle(parent).position !== "static") return parent;
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  pre.replaceWith(wrap);
  wrap.appendChild(pre);
  return wrap;
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
    const cleanups: Array<() => void> = [];
    let counter = 0;

    document
      .querySelectorAll<HTMLElement>('pre[data-language="sql"]')
      .forEach((pre) => {
        if (pre.dataset[ATTACHED] === "true") return;
        const sql = getSql(pre);
        if (!sql) return;
        pre.dataset[ATTACHED] = "true";

        const host = positionedHost(pre);
        const hasCopy = !!host.querySelector(":scope > .copy-button");
        const id = ++counter;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "example-try-button";
        btn.setAttribute("aria-label", "Run this example in an in-browser shell");
        if (hasCopy) btn.dataset.offsetCopy = "true";
        btn.innerHTML = TRY_LABEL;

        // One reusable container per block, appended/removed on toggle. Its
        // presence in the DOM is the source of truth for open vs closed.
        const container = document.createElement("div");

        const close = () => {
          btn.innerHTML = TRY_LABEL;
          setShells((prev) => prev.filter((s) => s.id !== id));
          container.remove();
        };
        const open = () => {
          host.insertAdjacentElement("afterend", container);
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

        host.appendChild(btn);
        cleanups.push(() => {
          btn.remove();
          container.remove();
          delete pre.dataset[ATTACHED];
        });
      });

    return () => cleanups.forEach((fn) => fn());
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
