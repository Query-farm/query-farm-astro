#!/usr/bin/env python3
"""Generate the vgi-java API reference MDX from the Java sources.

The Java counterpart of the Go, TypeScript and Rust generators. Pages are
curated topic groups; GROUPS below is the source of truth for which pages exist,
so keep the astro.config.mjs sidebar in sync with it.

Two audits gate the run and both exit non-zero:
  - every package that declares a public type belongs to a group, so a new
    package upstream cannot silently vanish from the reference;
  - every collected type is rendered.

**Why a source parser rather than javadoc.** The standard doclet emits a linked
HTML site, not data; getting MDX out of it means either a custom doclet (a Java
build step in a JS repo, run against a Gradle project) or scraping generated
HTML. Both are worse than reading the declarations, which is what the Go,
TypeScript and Rust generators already do for the same reason — the source says
exactly what the author wrote, and a signature sliced from it needs no
reconstruction. This parser is deliberately shallow: it finds public type
declarations and their public members, and does not try to understand Java.

Usage: gen-api-java.sh
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

SOURCE_BASE = "https://github.com/Query-farm/vgi-java/blob/main/"

# ── page groups ─────────────────────────────────────────────────────────────

GROUPS: list[dict] = [
    {
        "slug": "scalar",
        "title": "Scalar functions",
        "blurb": "One row in, one value out — the annotation-driven shape.",
        "packages": ["scalar"],
    },
    {
        "slug": "table",
        "title": "Table functions",
        "blurb": "Set-returning producers, and the producer state that streams their rows.",
        "packages": ["table"],
    },
    {
        "slug": "table-in-out",
        "title": "Table-in-out functions",
        "blurb": "Streaming a relation through, batch by batch.",
        "packages": ["tableinout"],
    },
    {
        "slug": "buffering",
        "title": "Buffering functions",
        "blurb": "Sink, combine, source — for output that depends on the whole input.",
        "packages": ["buffering"],
    },
    {
        "slug": "aggregate",
        "title": "Aggregate functions",
        "blurb": "Per-group accumulation with cross-process state combine.",
        "packages": ["aggregate"],
    },
    {
        "slug": "worker",
        "title": "Worker & serving",
        "blurb": "The Worker builder, the transports, and what a worker declares about itself.",
        "packages": ["<root>", "http"],
    },
    {
        "slug": "catalog",
        "title": "Catalogs",
        "blurb": "Presenting a worker as a database: schemas, tables, views, versioning.",
        "packages": ["catalog"],
    },
    {
        "slug": "function",
        "title": "Function metadata & params",
        "blurb": "The shared bind/process parameter types and the metadata every shape declares.",
        "packages": ["function"],
    },
    {
        "slug": "storage",
        "title": "State storage",
        "blurb": "State that outlives one call, or crosses worker processes.",
        "packages": ["storage"],
    },
    {
        "slug": "client",
        "title": "Client",
        "blurb": "Calling a VGI worker from Java, without DuckDB in the middle.",
        "packages": ["client"],
    },
    {
        "slug": "cache-control",
        "title": "Cache control",
        "blurb": "Advertising a result as reusable by the client.",
        "packages": ["cache"],
    },
    {
        "slug": "pushdown",
        "title": "Filter pushdown",
        "blurb": "Receiving the predicates DuckDB pushed toward the scan, and applying them.",
        "packages": ["pushdown"],
    },
    {
        "slug": "types",
        "title": "Arrow helpers",
        "blurb": "Schema caching, per-type scalar helpers, and the type rules the annotations follow.",
        "packages": ["types"],
    },
    {
        "slug": "protocol",
        "title": "Protocol",
        "blurb": "The wire shapes the worker and engine exchange.",
        "packages": ["protocol"],
    },
]

# Packages deliberately not documented: implementation detail, not API.
SKIP_PACKAGES = {"internal"}

# ── helpers ─────────────────────────────────────────────────────────────────


def esc_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def esc_code(s: str) -> str:
    """Escape a code fragment for a raw-HTML block. Braces are JSX in MDX."""
    return esc_html(s).replace("{", "&#123;").replace("}", "&#125;")


_CODE_SPAN = re.compile(r"`[^`]*`")


def esc_md(s: str) -> str:
    out, last = [], 0
    for m in _CODE_SPAN.finditer(s):
        out.append(re.sub(r"([<>{}])", r"\\\1", s[last : m.start()]))
        out.append(m.group(0))
        last = m.end()
    out.append(re.sub(r"([<>{}])", r"\\\1", s[last:]))
    return "".join(out)


def yaml_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def code_block(code: str, lang: str = "java") -> str:
    esc = code.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    return f'<Code lang="{lang}" code={{`{esc}`}} />'


_TAG = re.compile(r"\{@\w+\s+([^}]*)\}")


def clean_javadoc(block: str) -> str:
    """A javadoc comment reduced to its prose.

    Strips the comment furniture and the leading `*`, turns `{@link Foo}` and
    friends into plain code spans, and drops the block tags (`@param`,
    `@return`, …) — those belong to a member's own rendering, not the summary.
    """
    if not block:
        return ""
    body = block.strip()
    body = re.sub(r"^/\*\*?", "", body)
    body = re.sub(r"\*/$", "", body)
    lines = []
    for raw in body.split("\n"):
        line = re.sub(r"^\s*\*\s?", "", raw)
        if line.lstrip().startswith("@"):
            break
        lines.append(line)
    text = "\n".join(lines).strip()
    # {@link Foo#bar} -> `Foo#bar`; {@code x} -> `x`
    text = _TAG.sub(lambda m: "`" + m.group(1).strip() + "`", text)

    # Javadoc prose is HTML. Escaping it (esc_md) would render the tags
    # literally — "\<h2\>compute() signature rules\</h2\>" — so the common
    # ones are converted to Markdown here and only the remainder is escaped.
    text = re.sub(r"<pre>\s*(.*?)\s*</pre>", lambda m: "\n\n```java\n" + m.group(1) + "\n```\n\n",
                  text, flags=re.S)
    text = re.sub(r"<h[1-6]>\s*(.*?)\s*</h[1-6]>", lambda m: "\n\n**" + m.group(1) + "**\n\n",
                  text, flags=re.S)
    text = re.sub(r"<li>\s*", "\n- ", text)
    text = re.sub(r"</li>", "", text)
    text = re.sub(r"</?[uo]l>", "\n", text)
    text = re.sub(r"<code>(.*?)</code>", lambda m: "`" + m.group(1) + "`", text, flags=re.S)
    text = re.sub(r"</?(?:b|strong)>", "**", text)
    text = re.sub(r"</?(?:i|em)>", "*", text)
    # <p> and <br> are javadoc's paragraph markers, not MDX's.
    text = re.sub(r"</?p>", "\n\n", text)
    text = re.sub(r"<br\s*/?>", "\n", text)
    # Collapse the whitespace a wrapped <li> leaves behind.
    text = re.sub(r"\n[ \t]+", "\n  ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# A public type declaration: class / interface / enum / record / @interface.
_TYPE_RE = re.compile(
    r"^(?P<indent>\s*)public\s+(?:(?:static|final|abstract|sealed|non-sealed)\s+)*"
    r"(?P<kind>class|interface|enum|record|@interface)\s+(?P<name>\w+)",
    re.M,
)

# A public member: method, constructor, field, or annotation element.
_MEMBER_RE = re.compile(
    r"^\s{2,}public\s+(?:(?:static|final|abstract|default|synchronized|native)\s+)*"
    r"(?P<sig>[^;{]*?)\s*(?:;|\{)",
    re.M,
)


def javadoc_before(text: str, pos: int) -> str:
    """The javadoc block immediately preceding `pos`, if any."""
    head = text[:pos]
    end = head.rfind("*/")
    if end == -1:
        return ""
    # Only if nothing but whitespace/annotations sits between it and the decl.
    between = head[end + 2 :]
    if re.search(r"[^\s@\w()\"'.,{}\[\]-]", between.replace("\n", " ")):
        return ""
    if len(between.strip()) > 200:
        return ""
    start = head.rfind("/**", 0, end)
    if start == -1:
        return ""
    return head[start : end + 2]


def parse_file(path: Path, root: Path) -> list[dict]:
    text = path.read_text(errors="replace")
    rel = str(path.relative_to(root))
    out: list[dict] = []

    for m in _TYPE_RE.finditer(text):
        # Only top-level and directly-nested public types; deeper nesting is
        # detail (the enclosing type's declaration shows it).
        if len(m.group("indent")) > 4:
            continue
        line = text.count("\n", 0, m.start()) + 1
        decl_end = text.find("{", m.end())
        sig = text[m.start() : decl_end if decl_end != -1 else m.end()].strip()
        sig = re.sub(r"\s+", " ", sig)

        # Members declared inside this type, up to the next type at the same level.
        nxt = _TYPE_RE.search(text, m.end())
        body = text[m.end() : nxt.start() if nxt else len(text)]
        members = []
        for mm in _MEMBER_RE.finditer(body):
            msig = re.sub(r"\s+", " ", mm.group("sig")).strip()
            if not msig or msig.startswith(("class ", "interface ", "enum ", "record ")):
                continue
            mdoc = clean_javadoc(javadoc_before(body, mm.start()))
            members.append({"sig": msig, "docs": mdoc})

        out.append(
            {
                "name": m.group("name"),
                "kind": "annotation" if m.group("kind") == "@interface" else m.group("kind"),
                "sig": sig,
                "docs": clean_javadoc(javadoc_before(text, m.start())),
                "source": f"{SOURCE_BASE}{rel}#L{line}",
                "members": members[:40],
            }
        )
    return out


def icon_for(kind: str) -> str:
    return "class" if kind in ("class", "interface", "enum", "record", "annotation") else "attribute"


# ── main ────────────────────────────────────────────────────────────────────


def main() -> int:
    root = Path(os.environ.get("VGI_JAVA", str(Path.home() / "vgi-java")))
    out_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    src = root / "vgi/src/main/java/farm/query/vgi"
    if not src.exists():
        print(f"missing {src} — set VGI_JAVA to the vgi-java checkout", file=sys.stderr)
        return 1

    pkg_to_group: dict[str, dict] = {}
    for g in GROUPS:
        for p in g["packages"]:
            pkg_to_group[p] = g

    collected: dict[str, list[dict]] = {g["slug"]: [] for g in GROUPS}
    unmapped: dict[str, list[str]] = {}
    total = 0

    for f in sorted(src.rglob("*.java")):
        if f.name == "package-info.java":
            continue
        rel = f.relative_to(src)
        pkg = rel.parts[0] if len(rel.parts) > 1 else "<root>"
        if pkg in SKIP_PACKAGES:
            continue
        types = parse_file(f, root)
        if not types:
            continue
        g = pkg_to_group.get(pkg)
        if g is None:
            unmapped.setdefault(pkg, []).extend(t["name"] for t in types)
            continue
        collected[g["slug"]].extend(types)
        total += len(types)

    if unmapped:
        print("AUDIT FAILED — public types in packages that belong to no group:", file=sys.stderr)
        for p, names in sorted(unmapped.items()):
            print(f"  {p}: {', '.join(sorted(set(names))[:8])}", file=sys.stderr)
        print("\nAdd each package to a GROUPS entry (or SKIP_PACKAGES) in "
              "scripts/gen-api-java/main.py.", file=sys.stderr)
        return 1

    out_dir = out_root / "vgi/docs/java/api"
    out_dir.mkdir(parents=True, exist_ok=True)

    rendered = 0
    for g in GROUPS:
        entries = sorted(collected[g["slug"]], key=lambda e: e["name"])
        rendered += len(entries)

        body = [
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
            body += [
                '<div class="api-member">',
                "",
                f'<a id="{e["name"]}"></a>',
                f'## <span class="api-icon api-icon--{icon}"></span>'
                f'<span class="api-kind-tag api-kind-tag--{icon}">{e["kind"]}</span> `{e["name"]}`',
                "",
                f'<a class="api-source" href="{e["source"]}" target="_blank" rel="noopener">source</a>',
                "",
                f'<pre class="api-sig"><code>{esc_code(e["sig"])}</code></pre>',
                "",
            ]
            if e["docs"]:
                body += ['<p class="api-section">Description</p>', "", esc_md(e["docs"]), ""]
            if e["members"]:
                body += ['<p class="api-section">Members</p>', "", '<div class="api-members">', ""]
                for mem in e["members"]:
                    body += [
                        '<div class="api-member">',
                        "",
                        f'<pre class="api-sig"><code>{esc_code(mem["sig"])}</code></pre>',
                        "",
                    ]
                    if mem["docs"]:
                        body += [esc_md(mem["docs"]), ""]
                    body += ["</div>"]
                body += ["</div>", ""]
            body += ["</div>", ""]

        (out_dir / f"{g['slug']}.mdx").write_text("\n".join(body))

    if rendered != total:
        print(f"AUDIT FAILED — collected {total} types but rendered {rendered}.", file=sys.stderr)
        return 1

    print(f"wrote {len(GROUPS)} pages to {out_dir}", file=sys.stderr)
    print(f"rendered {rendered} public types", file=sys.stderr)
    print("audits: OK (every type lands on a page; every package has a group)", file=sys.stderr)
    print("sidebar slugs: " + ", ".join(f"vgi/docs/java/api/{g['slug']}" for g in GROUPS),
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
