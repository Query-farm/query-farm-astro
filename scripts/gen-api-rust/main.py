#!/usr/bin/env python3
"""Generate the vgi-rust API reference MDX from rustdoc JSON.

The Rust counterpart of scripts/gen-api-go/main.go and scripts/gen-api-ts/main.ts.
Like both of those — and unlike vgi-python, where a page is a module — the pages
here are curated topic groups: `vgi` has 25 public modules, which would be 25
thin pages. GROUPS below is the source of truth for which pages exist; keep the
astro.config.mjs sidebar in sync with it.

Two audits gate the run and both exit non-zero:
  - every public documented item lands on a page;
  - every module that exports something belongs to a group, so a new module
    upstream cannot silently vanish from the reference.

Signatures are sliced out of the real source using rustdoc's `span`, rather than
reconstructed from the JSON type trees. Reconstruction is a large amount of work
that produces something subtly unlike what the author wrote; the source already
says it exactly, with their formatting, their lifetimes and their comments.

Usage: gen-api-rust.sh  (which builds the JSON first)
"""

from __future__ import annotations

import json
import os
import re
import sys
import textwrap
from pathlib import Path

SOURCE_BASE = "https://github.com/Query-farm/vgi-rust/blob/main/"

# ── page groups ─────────────────────────────────────────────────────────────

GROUPS: list[dict] = [
    {
        "slug": "scalar",
        "title": "Scalar functions",
        "blurb": "One row in, one value out — the simplest function shape — declared with ArgSpec.",
        "modules": ["function"],
    },
    {
        "slug": "table",
        "title": "Table functions",
        "blurb": "Set-returning producers, and the producer that streams their rows.",
        "modules": ["table_function"],
    },
    {
        "slug": "table-in-out",
        "title": "Table-in-out functions",
        "blurb": "Streaming a relation through batch by batch, calling emit/emit_with as each one is ready.",
        "modules": ["table_in_out"],
    },
    {
        "slug": "buffering",
        "title": "Buffering functions",
        "blurb": "Sink, combine, source — for output that depends on the whole input, via TableBufferingFunction.",
        "modules": ["buffering"],
    },
    {
        "slug": "aggregate",
        "title": "Aggregate functions",
        "blurb": "Per-group accumulation: aggregate_bind, update, combine, and finalize on BoundAggregate.",
        "modules": ["aggregate"],
    },
    {
        "slug": "copy",
        "title": "COPY formats",
        "blurb": "Reading and writing your own format through COPY … FROM / TO, via CopyFromFunction and CopyFromReadContext.",
        "modules": ["copy_from", "copy_to"],
    },
    {
        "slug": "worker",
        "title": "Worker & serving",
        "blurb": "Building a worker, wiring its state, and putting it on a transport.",
        "modules": ["worker", "transport", "dispatch", "wasm_worker", "register", "resume"],
    },
    {
        "slug": "catalog",
        "title": "Catalogs",
        "blurb": "Presenting a worker as a database — schemas, tables, views, and macros — as catalog traits implement them.",
        "modules": ["catalog"],
    },
    {
        "slug": "arguments",
        "title": "Arguments",
        "blurb": "Declaring a signature, and reading the values that arrive, one arg at a time.",
        "modules": ["arguments", "overload"],
    },
    {
        "slug": "cache-control",
        "title": "Cache control",
        "blurb": "Advertising a result as reusable by the client, through the CACHE_ETAG_KEY and CACHE_EXPIRES_KEY result metadata.",
        "modules": ["cache_control"],
    },
    {
        "slug": "pushdown",
        "title": "Pushdown & statistics",
        "blurb": "Receiving the predicates DuckDB pushed toward the scan, and reporting what you know.",
        "modules": ["pushdown", "statistics", "partition"],
    },
    {
        "slug": "storage",
        "title": "State storage",
        "blurb": "State that outlives one call or crosses worker processes, backed by FunctionStorage and FsStorage.",
        "modules": ["storage"],
    },
    {
        "slug": "secrets",
        "title": "Secrets & settings",
        "blurb": "Credentials and session settings a worker declares and reads.",
        "modules": ["secrets", "settings"],
    },
    {
        "slug": "protocol",
        "title": "Protocol & Arrow",
        "blurb": "Wire shapes, the Arrow IPC helpers, and the numeric utilities.",
        "modules": ["protocol", "ipc", "wire", "numeric", "vgi", "generated", "<root>"],
    },
    {
        "slug": "client",
        "title": "Client",
        "blurb": "Calling a VGI worker from Rust, without DuckDB in the middle.",
        "modules": [
            "client",
            "scan",
            "args",
            "auth",
            "cache",
            "exchange",
            "location",
            "pool",
            "wire_call",
        ],
    },
]

# ── helpers ─────────────────────────────────────────────────────────────────


def esc_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def esc_code(s: str) -> str:
    """Escape a code fragment for a raw-HTML block.

    Braces matter as much as angle brackets: MDX reads a bare `{` inside raw
    HTML as a JSX expression, and Rust signatures are full of them.
    """
    return esc_html(s).replace("{", "&#123;").replace("}", "&#125;")


_CODE_SPAN = re.compile(r"`[^`]*`")


def esc_md(s: str) -> str:
    """Escape MDX-significant characters in prose, leaving code spans alone.

    Escaping inside a code span is not merely unnecessary, it is wrong — the
    entity survives into the rendered <code> and the reader sees `Vec&lt;u8&gt;`.
    """
    out, last = [], 0
    for m in _CODE_SPAN.finditer(s):
        out.append(re.sub(r"([<>{}])", r"\\\1", s[last : m.start()]))
        out.append(m.group(0))
        last = m.end()
    out.append(re.sub(r"([<>{}])", r"\\\1", s[last:]))
    return "".join(out)


def yaml_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def code_block(code: str, lang: str = "rust") -> str:
    esc = code.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    return f'<Code lang="{lang}" code={{`{esc}`}} />'


def render_docs(text: str) -> str:
    """Render a rustdoc comment to MDX.

    Fenced code blocks become <Code>; prose is MDX-escaped. They need opposite
    escaping — a fence keeps its braces, a paragraph does not — so they have to
    be separated before either is escaped.

    A bare ``` fence in rustdoc is Rust, and `# ` lines inside one are hidden
    setup that the reader is not meant to see.
    """
    if not text:
        return ""
    out: list[str] = []
    parts = re.split(r"^```(.*)$", text, flags=re.M)
    # parts alternates: prose, fence-info, code, fence-info(close), prose, ...
    i = 0
    in_code = False
    lang = "rust"
    while i < len(parts):
        chunk = parts[i]
        if i % 2 == 1:  # a fence marker line
            if not in_code:
                info = chunk.strip()
                lang = "rust" if info in ("", "rust", "ignore", "no_run", "should_panic") else info
                in_code = True
            else:
                in_code = False
            i += 1
            continue
        if in_code:
            lines = [ln for ln in chunk.split("\n") if not ln.lstrip().startswith("# ")]
            body = "\n".join(lines).strip("\n")
            if body:
                out.append(code_block(body, lang))
                out.append("")
        else:
            prose = chunk.strip()
            if prose:
                out.append(esc_md(prose))
                out.append("")
        i += 1
    return "\n".join(out)


def kind_of(item: dict, path_entry: dict | None) -> str:
    if path_entry and path_entry.get("kind"):
        return path_entry["kind"]
    inner = item.get("inner")
    if isinstance(inner, dict) and inner:
        return next(iter(inner))
    return "item"


def icon_for(kind: str) -> str:
    if kind in ("trait", "struct", "enum", "union"):
        return "class"
    if kind in ("function", "method"):
        return "function"
    return "attribute"


def slice_source(root: Path, span: dict, kind: str) -> str:
    """The declaration as the author wrote it, with function bodies removed."""
    f = root / span["filename"]
    if not f.exists():
        return ""
    lines = f.read_text(errors="replace").split("\n")
    begin, end = span["begin"][0] - 1, span["end"][0]
    text = "\n".join(lines[begin:end]).rstrip()

    # Drop attributes and doc comments — they are rendered separately.
    kept = [ln for ln in text.split("\n") if not ln.lstrip().startswith(("///", "//!", "#["))]
    # Dedent: an impl method is indented in its block, and carrying that into a
    # standalone code sample just looks broken.
    text = textwrap.dedent("\n".join(kept)).strip("\n")

    if kind in ("function", "method"):
        # Cut at the body's opening brace, at depth 0 outside strings.
        depth = 0
        for i, ch in enumerate(text):
            if ch in "(<[":
                depth += 1
            elif ch in ")>]":
                depth -= 1
            elif ch == "{" and depth <= 0:
                return text[:i].rstrip()
        return text
    return text


PER_CRATE: dict[str, dict] = {}


def inherent_methods(index: dict, crate: str, item: dict, root: Path) -> list[dict]:
    """The documented methods of a type's own `impl` blocks.

    A struct's source slice is just its fields — its constructors and builder
    methods live in separate `impl` blocks that the slice never reaches, and
    those are most of what a caller uses (`CacheControl::ttl`,
    `ArgSpec::column`). Traits are the opposite: their methods are inside the
    declaration the slice already shows, so rendering them again would duplicate.
    """
    inner = item.get("inner") or {}
    holder = inner.get("struct") or inner.get("enum")
    if not holder:
        return []

    out: list[dict] = []
    for impl_id in holder.get("impls", []):
        impl_item = index.get(f"{crate}:{impl_id}")
        if not impl_item:
            continue
        impl_inner = (impl_item.get("inner") or {}).get("impl")
        if not impl_inner:
            continue
        # Inherent impls only — a `impl Debug for X` block is noise here.
        if impl_inner.get("trait") is not None:
            continue
        for child_id in impl_inner.get("items", []):
            child = index.get(f"{crate}:{child_id}")
            if not child or not child.get("name") or not child.get("docs"):
                continue
            span = child.get("span")
            out.append(
                {
                    "name": child["name"],
                    "kind": "method",
                    "docs": child.get("docs") or "",
                    "sig": slice_source(root, span, "function") if span else "",
                    "source": (
                        f"{SOURCE_BASE}{span['filename']}#L{span['begin'][0]}" if span else None
                    ),
                }
            )
    out.sort(key=lambda m: m["name"])
    return out


# ── main ────────────────────────────────────────────────────────────────────


def main() -> int:
    root = Path(os.environ.get("VGI_RUST", str(Path.home() / "Development/vgi-rust")))
    out_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    # The public surface spans three crates: `vgi` is the worker framework,
    # `vgi-protocol` owns the wire types it re-exports (CacheControl lives
    # there, not here), and `vgi-client` is the client. rustdoc emits one JSON
    # per crate and records only stubs for the others, so all three are read and
    # merged — with `vgi`'s ids first, since a re-export resolves to the
    # defining crate.
    CRATES = ["vgi", "vgi_protocol", "vgi_client"]
    index: dict = {}
    paths: dict = {}
    found = []
    for crate in CRATES:
        doc = root / f"target/doc/{crate}.json"
        if not doc.exists():
            continue
        data = json.loads(doc.read_text())
        found.append(crate)
        # Namespace ids per crate so they cannot collide.
        for iid, item in data["index"].items():
            index[f"{crate}:{iid}"] = item
        for pid, pe in data["paths"].items():
            paths.setdefault(f"{crate}:{pid}", pe)
        # Keep a per-crate view for impl-child lookups.
        PER_CRATE[crate] = data
    if not found:
        print(
            f"no rustdoc JSON under {root}/target/doc — run gen-api-rust.sh, "
            "which builds it first",
            file=sys.stderr,
        )
        return 1

    module_to_group: dict[str, dict] = {}
    for g in GROUPS:
        for m in g["modules"]:
            module_to_group[m] = g

    collected: dict[str, list[dict]] = {g["slug"]: [] for g in GROUPS}
    unmapped: dict[str, list[str]] = {}
    total = 0

    for iid, item in index.items():
        crate = iid.split(":", 1)[0]
        if item.get("visibility") != "public":
            continue
        if not item.get("docs"):
            continue
        if not item.get("name"):
            continue
        pe = paths.get(f"{crate}:{item.get('id')}")
        kind = kind_of(item, pe)
        if kind == "module":
            continue
        # `path` is ["vgi", <module>, ..., <name>]; anything the crate re-exports
        # from elsewhere is documented on its own page upstream.
        path = pe["path"] if pe else []
        if len(path) < 2:
            continue
        # vgi-protocol's own module names are the ones `vgi` re-exports them
        # under (cache_control, ipc, wire), so its paths group identically.
        # A two-element path is a crate-root item, which has no module of its
        # own — those are grouped under the sentinel "<root>".
        module = path[1] if len(path) > 2 else "<root>"

        g = module_to_group.get(module)
        if g is None:
            unmapped.setdefault(module, []).append(item["name"])
            continue

        span = item.get("span")
        collected[g["slug"]].append(
            {
                "name": item["name"],
                "kind": kind,
                "path": "::".join(path),
                "docs": item.get("docs") or "",
                "sig": slice_source(root, span, kind) if span else "",
                "methods": inherent_methods(index, crate, item, root),
                "source": (
                    f"{SOURCE_BASE}{span['filename']}#L{span['begin'][0]}" if span else None
                ),
            }
        )
        total += 1

    if unmapped:
        print("AUDIT FAILED — public items in modules that belong to no group:", file=sys.stderr)
        for m, names in sorted(unmapped.items()):
            print(f"  {m}: {', '.join(sorted(set(names))[:8])}", file=sys.stderr)
        print("\nAdd each module to a GROUPS entry in scripts/gen-api-rust/main.py.", file=sys.stderr)
        return 1

    out_dir = out_root / "vgi/docs/rust/api"
    out_dir.mkdir(parents=True, exist_ok=True)

    rendered = 0
    for g in GROUPS:
        entries = sorted(collected[g["slug"]], key=lambda e: (e["kind"] != "trait", e["name"]))
        rendered += len(entries)

        body: list[str] = [
            "---",
            f"title: {yaml_str(g['title'])}",
            f"description: {yaml_str(g['blurb'])}",
            "---",
            "import { Code } from '@astrojs/starlight/components';",
            "",
            '<div class="api-module-doc">',
            "",
            '<p class="api-module-doc__label">On this page</p>',
            "",
            esc_md(g["blurb"]),
            "",
            "</div>",
            "",
        ]

        for e in entries:
            icon = icon_for(e["kind"])
            body.append('<div class="api-member">')
            body.append("")
            body.append(f'<a id="{e["name"]}"></a>')
            body.append(
                f'## <span class="api-icon api-icon--{icon}"></span>'
                f'<span class="api-kind-tag api-kind-tag--{icon}">{e["kind"]}</span> `{e["name"]}`'
            )
            body.append("")
            if e["source"]:
                body.append(
                    f'<a class="api-source" href="{e["source"]}" target="_blank" '
                    f'rel="noopener">source</a>'
                )
                body.append("")
            if e["sig"]:
                if "\n" in e["sig"]:
                    body.append(code_block(e["sig"]))
                else:
                    body.append(f'<pre class="api-sig"><code>{esc_code(e["sig"])}</code></pre>')
                body.append("")
            if e["docs"]:
                body.append('<p class="api-section">Description</p>')
                body.append("")
                body.append(render_docs(e["docs"]).rstrip())
                body.append("")

            if e.get("methods"):
                body.append('<p class="api-section">Methods</p>')
                body.append("")
                body.append('<div class="api-members">')
                body.append("")
                for m in e["methods"]:
                    body.append('<div class="api-member">')
                    body.append("")
                    body.append(f'<a id="{e["name"]}.{m["name"]}"></a>')
                    body.append(
                        f'### <span class="api-icon api-icon--method"></span>'
                        f'<span class="api-kind-tag api-kind-tag--method">method</span> '
                        f'`{m["name"]}`'
                    )
                    body.append("")
                    if m["source"]:
                        body.append(
                            f'<a class="api-source" href="{m["source"]}" target="_blank" '
                            f'rel="noopener">source</a>'
                        )
                        body.append("")
                    if m["sig"]:
                        if "\n" in m["sig"]:
                            body.append(code_block(m["sig"]))
                        else:
                            body.append(
                                f'<pre class="api-sig"><code>{esc_code(m["sig"])}</code></pre>'
                            )
                        body.append("")
                    if m["docs"]:
                        body.append(render_docs(m["docs"]).rstrip())
                        body.append("")
                    body.append("</div>")
                body.append("</div>")
                body.append("")

            body.append("</div>")
            body.append("")

        (out_dir / f"{g['slug']}.mdx").write_text("\n".join(body))

    if rendered != total:
        print(f"AUDIT FAILED — collected {total} items but rendered {rendered}.", file=sys.stderr)
        return 1

    print(f"wrote {len(GROUPS)} pages to {out_dir}", file=sys.stderr)
    print(f"rendered {rendered} public documented items", file=sys.stderr)
    print("audits: OK (every item lands on a page; every module has a group)", file=sys.stderr)
    print(
        "sidebar slugs: "
        + ", ".join(f"vgi/docs/rust/api/{g['slug']}" for g in GROUPS),
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
