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
/* The Try button lives in the code block's top toolbar (a flex bar), to the
   left of Copy — never floating over the query text. */
.example-try-button {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
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
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
.example-try-button:hover {
  color: rgb(253, 230, 138);
  background: rgba(15, 23, 20, 0.95);
  border-color: rgba(251, 191, 36, 0.6);
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.15);
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

/** Find the code block's top toolbar (CodeBlock renders one as the element just
 *  before the <pre>), or create one for blocks that lack it (e.g. MDX/Shiki).
 *  The Try button goes in here so it sits in a bar above the query, never over
 *  it. Returns the bar plus whether we created it (so cleanup can remove it). */
function findOrCreateToolbar(pre: HTMLElement): { bar: HTMLElement; created: boolean } {
  const prev = pre.previousElementSibling as HTMLElement | null;
  if (prev && (prev.classList.contains("code-block-toolbar") || prev.querySelector(":scope > .copy-button"))) {
    return { bar: prev, created: false };
  }
  const bar = document.createElement("div");
  bar.className = "code-block-toolbar";
  Object.assign(bar.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "0.25rem",
    padding: "0.375rem 0.5rem",
    background: "rgba(13, 40, 24, 0.8)",
    borderBottom: "1px solid rgba(20, 83, 45, 0.3)",
  });
  pre.parentElement?.insertBefore(bar, pre);
  return { bar, created: true };
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

        const { bar, created } = findOrCreateToolbar(pre);
        // Insert the Try button to the left of the Copy button (both right-
        // aligned in the bar), or at the start if there's no Copy button.
        const copyBtn = bar.querySelector(":scope > .copy-button");
        const id = ++counter;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "example-try-button";
        btn.setAttribute("aria-label", "Run this example in an in-browser shell");
        btn.innerHTML = TRY_LABEL;
        if (copyBtn) bar.insertBefore(btn, copyBtn);
        else bar.insertBefore(btn, bar.firstChild);

        // The shell opens below the whole block (toolbar + code). One reusable
        // container per block, appended/removed on toggle.
        const blockRoot = (pre.closest(".code-block-wrapper") as HTMLElement | null) ?? pre;
        const container = document.createElement("div");

        const close = () => {
          btn.innerHTML = TRY_LABEL;
          setShells((prev) => prev.filter((s) => s.id !== id));
          container.remove();
        };
        const open = () => {
          blockRoot.insertAdjacentElement("afterend", container);
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

        cleanups.push(() => {
          btn.remove();
          if (created) bar.remove();
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
