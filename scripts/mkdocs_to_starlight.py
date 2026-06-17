#!/usr/bin/env python3
"""Convert a MkDocs Markdown page to a Starlight MDX page.

The Starlight content pipeline here does NOT run Expressive Code over Markdown
fences and does NOT parse GFM pipe tables, so this converter rewrites:

- fenced code blocks      -> <CodeBlock code={`...`} lang="..." tryable={false} />
- ``--8<-- "examples/x"`` -> <CodeBlock code={xSrc} ... /> + a ?raw import
- ``!!!`` / ``???`` admonitions -> <Callout type="..." title="...">…</Callout>
- pipe tables             -> raw <table> … </table>
- ``*.md`` links          -> site-absolute Starlight URLs
- the leading ``# H1``    -> the frontmatter ``title`` (Starlight renders it)

Recurses into admonition bodies so nested fences/tables/links convert too.

Usage: mkdocs_to_starlight.py <in.md> <out.mdx>
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Depth from a content page (…/python/<section>/<page>.mdx) up to src/.
REL = "../../../../../../"

# MkDocs admonition type -> Callout type (Callout supports note/tip/warning/danger/info).
ADMONITION = {
    "note": "note",
    "info": "info",
    "tip": "tip",
    "abstract": "info",
    "summary": "info",
    "question": "info",
    "example": "info",
    "quote": "info",
    "warning": "warning",
    "caution": "warning",
    "attention": "warning",
    "danger": "danger",
    "error": "danger",
    "failure": "danger",
    "bug": "danger",
}

# MkDocs page path (relative to docs/, normalised) -> Starlight URL.
LINK_MAP = {
    "tutorial/index.md": "/vgi/docs/python/tutorial/scalar/",
    "tutorial/scalar.md": "/vgi/docs/python/tutorial/scalar/",
    "tutorial/table.md": "/vgi/docs/python/tutorial/table/",
    "how-to/index.md": "/vgi/docs/python/how-to/function-patterns/",
    "concepts/index.md": "/vgi/docs/python/concepts/lifecycle/",
    "index.md": "/vgi/docs/python/",
    # how-to guides (all re-homed under /how-to/)
    "how-to/function-patterns.md": "/vgi/docs/python/how-to/function-patterns/",
    "how-to/catalogs.md": "/vgi/docs/python/how-to/catalogs/",
    "how-to/state-storage.md": "/vgi/docs/python/how-to/state-storage/",
    "how-to/http-auth.md": "/vgi/docs/python/how-to/http-auth/",
    "how-to/pushdown-and-statistics.md": "/vgi/docs/python/how-to/pushdown-and-statistics/",
    # reference pages (docs/ root in MkDocs) -> /how-to/
    "generator-api.md": "/vgi/docs/python/how-to/generator-api/",
    "aggregate-functions.md": "/vgi/docs/python/how-to/aggregate-functions/",
    "catalog-interface.md": "/vgi/docs/python/how-to/catalog-interface/",
    "shared-storage.md": "/vgi/docs/python/how-to/shared-storage/",
    "authentication.md": "/vgi/docs/python/how-to/authentication/",
    "filter-pushdown.md": "/vgi/docs/python/how-to/filter-pushdown/",
    "column-statistics.md": "/vgi/docs/python/how-to/column-statistics/",
    "metadata.md": "/vgi/docs/python/how-to/metadata/",
    "cli.md": "/vgi/docs/python/how-to/cli/",
    # concepts
    "lifecycle.md": "/vgi/docs/python/concepts/lifecycle/",
    "argument-serialization.md": "/vgi/docs/python/concepts/argument-serialization/",
    # generated API reference (maps mkdocstrings pages to Griffe-generated modules)
    "api/index.md": "/vgi/docs/python/api/vgi-scalar_function/",
    "api/functions.md": "/vgi/docs/python/api/vgi-scalar_function/",
    "api/arguments.md": "/vgi/docs/python/api/vgi-arguments/",
    "api/worker.md": "/vgi/docs/python/api/vgi-worker/",
    "api/client.md": "/vgi/docs/python/api/vgi-client/",
    "api/catalogs.md": "/vgi/docs/python/api/vgi-catalog/",
    "api/storage.md": "/vgi/docs/python/api/vgi-function_storage/",
    "api/metadata.md": "/vgi/docs/python/api/vgi-metadata/",
    "api/filters.md": "/vgi/docs/python/api/vgi-table_filter_pushdown/",
    "api/exceptions.md": "/vgi/docs/python/api/vgi-exceptions/",
}
# api/* pages without a generated counterpart fall back to the worker page.
API_FALLBACK = "/vgi/docs/python/api/vgi-worker/"


def _norm_md(target: str, here: str) -> str:
    """Resolve a relative .md link target (from page `here`, a docs/-relative dir)."""
    anchor = ""
    if "#" in target:
        target, anchor = target.split("#", 1)
        anchor = "#" + anchor
    parts = (here.split("/") if here else []) + target.split("/")
    stack: list[str] = []
    for p in parts:
        if p in ("", "."):
            continue
        if p == "..":
            if stack:
                stack.pop()
        else:
            stack.append(p)
    key = "/".join(stack)
    url = LINK_MAP.get(key)
    if url is None and key.startswith("api/"):
        url = API_FALLBACK
    if url is None:  # unknown — leave a site-absolute guess so it's at least not a .md
        url = "/vgi/docs/python/"
    return url + anchor


def mdx_safe_prose(line: str, here: str) -> str:
    """Make a Markdown prose line safe for MDX: keep real tags and inline code, but
    escape stray ``<`` (e.g. ``(<)``, ``a < b``) and braces that MDX would read as JSX."""
    line = convert_links(line, here)
    parts = re.split(r"(`[^`]*`)", line)  # odd indices are inline-code spans — leave them
    for idx in range(0, len(parts), 2):
        seg = parts[idx]
        seg = re.sub(r"<(?![A-Za-z/!])", "&lt;", seg)  # '<' not starting a tag/close/comment
        seg = seg.replace("{", "&#123;").replace("}", "&#125;")
        parts[idx] = seg
    return "".join(parts)


def convert_links(text: str, here: str) -> str:
    """Rewrite ``[text](foo.md#x)`` links to site-absolute Starlight URLs."""

    def repl(m: re.Match[str]) -> str:
        return f"]({_norm_md(m.group(1), here)})"

    return re.sub(r"\]\(([^)]+\.md(?:#[^)]*)?)\)", repl, text)


def esc_template(code: str) -> str:
    """Escape code for a JS template literal inside ``code={`...`}``."""
    return code.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def slug_to_ident(name: str) -> str:
    """examples/foo_bar.py -> fooBarSrc import identifier."""
    stem = Path(name).stem
    parts = stem.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:]) + "Src"


def indent_of(s: str) -> int:
    return len(s) - len(s.lstrip(" "))


def convert_blocks(lines: list[str], here: str, imports: dict[str, str]) -> list[str]:
    """Convert a list of (already dedented) lines, recursing into admonitions."""
    out: list[str] = []
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()

        # ── admonition: !!! type "Title"  /  ??? type "Title" ──
        m = re.match(r'^(?:!!!|\?\?\?)\+?\s+(\w+)(?:\s+"([^"]*)")?\s*$', line)
        if m:
            kind = ADMONITION.get(m.group(1).lower(), "info")
            title = m.group(2) or m.group(1).title()
            body: list[str] = []
            i += 1
            while i < n and (not lines[i].strip() or indent_of(lines[i]) >= 4):
                body.append(lines[i][4:] if len(lines[i]) >= 4 else lines[i])
                i += 1
            while body and not body[0].strip():
                body.pop(0)
            while body and not body[-1].strip():
                body.pop()
            title_attr = title.replace('"', "&quot;")
            out.append(f'<Callout type="{kind}" title="{title_attr}">')
            out += convert_blocks(body, here, imports)
            out.append("</Callout>")
            out.append("")
            continue

        # ── fenced code block ──
        # Accept info-strings (e.g. ```python test="skip") — keep only the lang word.
        # Matching these is essential: an unrecognised opening fence desyncs the
        # scanner so its closing ``` is read as a new opening, swallowing the rest.
        fence = re.match(r"^```([\w-]*)(?:\s.*)?$", stripped)
        if fence:
            lang = fence.group(1) or "text"
            code: list[str] = []
            i += 1
            while i < n and lines[i].strip() != "```":
                code.append(lines[i])
                i += 1
            i += 1  # consume closing fence
            # dedent by the common leading whitespace (fences nested under a list
            # item carry the list indent into the code text otherwise).
            indents = [indent_of(c) for c in code if c.strip()]
            if indents:
                shift = min(indents)
                code = [c[shift:] if c.strip() else "" for c in code]
            # snippet?
            if len(code) == 1 and "8<--" in code[0]:
                sm = re.search(r'--8<--\s*"([^"]+)"', code[0])
                if sm:
                    path = sm.group(1)
                    ident = slug_to_ident(path)
                    imports[ident] = "/" + path  # examples/x.py -> resolved at emit time
                    out.append(f'<CodeBlock code={{{ident}}} lang="python" tryable={{false}} />')
                    out.append("")
                    continue
            body_code = "\n".join(code)
            out.append(f'<CodeBlock code={{`{esc_template(body_code)}`}} lang="{lang}" tryable={{false}} />')
            out.append("")
            continue

        # ── pipe table: header line + delimiter line ──
        if stripped.startswith("|") and i + 1 < n and re.match(r"^\s*\|?[\s:|-]+\|?\s*$", lines[i + 1]) and "-" in lines[i + 1]:
            def cells(row: str) -> list[str]:
                row = row.strip()
                if row.startswith("|"):
                    row = row[1:]
                if row.endswith("|") and not row.endswith("\\|"):
                    row = row[:-1]
                # Split on unescaped pipes only, then unescape ``\|`` -> ``|`` so a cell
                # like ``int\|None`` (an escaped union type) stays one cell.
                return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", row)]

            header = cells(line)
            i += 2  # skip header + delimiter
            rows: list[list[str]] = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(cells(lines[i]))
                i += 1
            out.append("<table>")
            out.append("<thead>")
            out.append("<tr>" + "".join(f"<th>{md_inline(c, here)}</th>" for c in header) + "</tr>")
            out.append("</thead>")
            out.append("<tbody>")
            for r in rows:
                out.append("<tr>" + "".join(f"<td>{md_inline(c, here)}</td>" for c in r) + "</tr>")
            out.append("</tbody>")
            out.append("</table>")
            out.append("")
            continue

        # ── ordinary line ──
        out.append(mdx_safe_prose(line, here))
        i += 1
    return out


def md_inline(text: str, here: str) -> str:
    """Minimal inline Markdown -> HTML for table cells: code, bold, links.

    Cell text becomes raw HTML inside a JSX/MDX tree, so any literal ``<``, ``>``,
    ``{``, ``}`` (e.g. a type like ``list<int>`` or ``sparse_union<...>``) must be
    entity-escaped first, *before* we wrap spans in real tags.
    """
    text = convert_links(text, here)
    text = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("{", "&#123;")
        .replace("}", "&#125;")
    )
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def split_front_matter(text: str) -> tuple[dict[str, str], str]:
    """Return (frontmatter dict, body) — only `description` is read."""
    fm: dict[str, str] = {}
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            for ln in text[4:end].splitlines():
                if ":" in ln:
                    k, v = ln.split(":", 1)
                    fm[k.strip()] = v.strip().strip('"')
            text = text[end + 5 :]
    return fm, text


def convert(md_path: Path, here: str) -> str:
    """Convert a MkDocs .md file to Starlight MDX text.

    `here` is the source page's directory relative to ``docs/`` (e.g. ``how-to`` or
    ``""`` for a docs-root page) — used to resolve relative ``.md`` links.
    """
    raw = md_path.read_text()
    fm, body = split_front_matter(raw)
    lines = body.splitlines()

    # title from the first H1, which we then drop from the body.
    title = md_path.stem.replace("-", " ").title()
    for idx, ln in enumerate(lines):
        if ln.startswith("# "):
            title = ln[2:].strip()
            del lines[idx]
            break

    imports: dict[str, str] = {}
    converted = convert_blocks(lines, here, imports)
    text = "\n".join(converted)

    # which components are actually used?
    comp_imports = []
    if "<Callout" in text:
        comp_imports.append(f"import Callout from '{REL}components/docs/Callout.astro';")
    if "<CodeBlock" in text:
        comp_imports.append(f"import CodeBlock from '{REL}components/ui/CodeBlock.astro';")
    for ident, path in sorted(imports.items()):
        # path like /examples/calc_worker.py -> src/examples/vgi-python/calc_worker.py
        fname = Path(path).name
        comp_imports.append(f"import {ident} from '{REL}examples/vgi-python/{fname}?raw';")

    desc = fm.get("description", title)
    head = ["---", f"title: {title}", f'description: "{desc}"', "---", ""]
    if comp_imports:
        head += comp_imports
        head.append("")
    # collapse 3+ blank lines
    out = "\n".join(head) + "\n" + text + "\n"
    out = re.sub(r"\n{3,}", "\n\n", out)
    # MDX requires void HTML elements to be self-closing.
    out = re.sub(r"<br\s*>", "<br />", out)
    out = re.sub(r"<hr\s*>", "<hr />", out)
    return out


def main() -> None:
    in_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    here = sys.argv[3] if len(sys.argv) > 3 else ""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(convert(in_path, here))
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
