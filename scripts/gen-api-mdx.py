#!/usr/bin/env python3
"""Spike v2: Griffe -> MDX for Starlight, WITH cross-type linking.

Two passes:
  1. build a global index: canonical_path -> (page_slug, anchor_id) for every
     documented class / function / method / attribute across all modules.
  2. render each module to its own MDX page, linkifying every resolvable type
     reference (signatures, bases, attribute types, param/return/raise types)
     to its definition — intra- and cross-page.

Usage: python gen_mdx.py <outdir> vgi.scalar_function vgi.worker ...
"""

from __future__ import annotations

import sys
from pathlib import Path

import griffe
from griffe import Alias, Attribute, Class, Expr, ExprName, Function, Module

# ── config ──────────────────────────────────────────────────────────────────

SOURCE_BASE = "https://github.com/Query-farm/vgi-python/blob/main/"  # + relative_filepath#Llineno

# External packages we deep-link to their docs home (root module -> base URL).
# Everything else (builtins, typing, stdlib) stays plain text to avoid noise.
EXTERNAL_BASES = {
    "vgi_rpc": "https://vgi-rpc-python.query.farm/",
    "pyarrow": "https://arrow.apache.org/docs/python/",
}

# Content-collection slug prefix where the API pages live in query.farm.
SLUG_PREFIX = "vgi/docs/python/api/"

# ── escaping ──────────────────────────────────────────────────────────────


def esc_md(text: str) -> str:
    """Escape chars MDX treats as JSX/expressions in prose."""
    return text.replace("<", "&lt;").replace(">", "&gt;").replace("{", "&#123;").replace("}", "&#125;")


def esc_html(text: str) -> str:
    """Escape for inside raw HTML (signatures/types)."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("{", "&#123;")
        .replace("}", "&#125;")
    )


# ── the cross-reference index ───────────────────────────────────────────────


def slug_for(modname: str) -> str:
    """Filesystem/URL-safe Starlight slug for a module (no dots)."""
    return SLUG_PREFIX + modname.replace(".", "-")


def build_index(modules: list[Module]) -> dict[str, tuple[str, str]]:
    """canonical_path -> (page_slug, anchor_id) for everything we document."""
    index: dict[str, tuple[str, str]] = {}

    def add(obj: griffe.Object, slug: str) -> None:
        index[obj.canonical_path] = (slug, obj.canonical_path)

    for mod in modules:
        slug = slug_for(mod.canonical_path)  # one page per module
        for name, obj in mod.members.items():
            if name.startswith("_") or isinstance(obj, Alias):
                continue
            if isinstance(obj, (Class, Function)):
                add(obj, slug)
            if isinstance(obj, Class):
                for mname, member in obj.members.items():
                    if not mname.startswith("_"):
                        add(member, slug)
    return index


def resolve_link(canonical: str, index: dict[str, tuple[str, str]]) -> tuple[str | None, bool]:
    """Return (url, is_external) for a canonical path, or (None, False) if unlinkable."""
    hit = index.get(canonical)
    if hit is not None:
        slug, anchor = hit
        return f"/{slug}/#{anchor}", False
    root = canonical.split(".", 1)[0]
    base = EXTERNAL_BASES.get(root)
    if base is not None:
        return base, True
    return None, False


def source_url(obj: griffe.Object) -> str | None:
    """GitHub source link for a symbol, or None if location unknown."""
    rel = getattr(obj, "relative_filepath", None)
    if rel is None or obj.lineno is None:
        return None
    return f"{SOURCE_BASE}{rel}#L{obj.lineno}"


# ── linkifying type expressions ─────────────────────────────────────────────


def link_expr(expr: object, index: dict[str, tuple[str, str]]) -> str:
    """Rebuild an annotation as HTML, linking every resolvable name."""
    if expr is None:
        return ""
    if isinstance(expr, str):
        return esc_html(expr)
    if isinstance(expr, ExprName):
        target, external = resolve_link(expr.canonical_path, index)
        name = esc_html(expr.name)
        if not target:
            return name
        ext = ' class="api-ext" target="_blank" rel="noopener"' if external else ""
        return f'<a href="{target}"{ext}>{name}</a>'
    if isinstance(expr, Expr):
        return "".join(link_expr(el, index) for el in expr.iterate(flat=True))
    return esc_html(str(expr))


def code_type(expr: object, index: dict[str, tuple[str, str]]) -> str:
    """A linked type wrapped in <code> for inline use in lists."""
    inner = link_expr(expr, index)
    return f"<code>{inner}</code>" if inner else ""


# ── signatures ──────────────────────────────────────────────────────────────


def _param_html(p: griffe.Parameter, index: dict[str, tuple[str, str]]) -> tuple[str, str]:
    """Return (html, plain) for one parameter — plain is used for width estimation."""
    prefix = {"VAR_POSITIONAL": "*", "VAR_KEYWORD": "**"}.get(p.kind.name, "")
    html = prefix + esc_html(p.name)
    plain = prefix + p.name
    if p.annotation is not None:
        html += f": {link_expr(p.annotation, index)}"
        plain += f": {p.annotation}"
    if p.default is not None:
        html += f" = {esc_html(str(p.default))}"
        plain += f" = {p.default}"
    return html, plain


def signature_html(fn: Function, index: dict[str, tuple[str, str]]) -> str:
    """A code-block-styled signature with clickable types; wraps if long."""
    pairs = [_param_html(p, index) for p in fn.parameters if p.name not in ("self", "cls")]
    ret = f" -&gt; {link_expr(fn.returns, index)}" if fn.returns is not None else ""
    name = esc_html(fn.name)
    # Width estimate from the plain text (no markup), mkdocstrings-style threshold.
    plain_len = len(fn.name) + 2 + sum(len(pl) + 2 for _, pl in pairs) + (len(str(fn.returns)) + 4 if fn.returns else 0)
    if plain_len <= 72 or not pairs:
        body = f"{name}({', '.join(h for h, _ in pairs)}){ret}"
    else:
        inner = ",\n".join(f"    {h}" for h, _ in pairs)
        body = f"{name}(\n{inner},\n){ret}"
    return f'<pre class="api-sig"><code>{body}</code></pre>'


# ── docstrings ──────────────────────────────────────────────────────────────


def docstring_descriptions(obj: griffe.Object) -> dict[str, str]:
    """Map param-name -> description from the parsed Google docstring."""
    out: dict[str, str] = {}
    if not obj.docstring:
        return out
    for sec in obj.docstring.parse("google"):
        if sec.kind.value == "parameters":
            for p in sec.value:
                out[p.name] = p.description
    return out


def docstring_text_and_meta(obj: griffe.Object) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    """Return (summary/body lines, returns lines, [(exc, desc)] raises)."""
    body: list[str] = []
    returns: list[str] = []
    raises: list[tuple[str, str]] = []
    if not obj.docstring:
        return body, returns, raises
    for sec in obj.docstring.parse("google"):
        k = sec.kind.value
        if k == "text":
            body.append(esc_md(sec.value))
            body.append("")
        elif k == "returns":
            for r in sec.value:
                returns.append(esc_md(r.description))
        elif k == "raises":
            for r in sec.value:
                raises.append((str(r.annotation), esc_md(r.description)))
    return body, returns, raises


# ── renderers ────────────────────────────────────────────────────────────────


def anchor(obj: griffe.Object) -> str:
    return f'<a id="{obj.canonical_path}"></a>'


def heading_line(h: str, name: str, kind: str, obj: griffe.Object) -> str:
    """Heading with a kind badge and a right-aligned source link."""
    src = source_url(obj)
    link = f'<a class="api-source" href="{src}" target="_blank" rel="noopener">source</a>' if src else ""
    return f'{h} `{name}` <span class="api-kind">{kind}</span>{link}'


def render_function(fn: Function, level: int, index: dict[str, tuple[str, str]]) -> list[str]:
    h = "#" * level
    kind = "method" if (fn.parent and isinstance(fn.parent, Class)) else "function"
    out = [anchor(fn), heading_line(h, fn.name, kind, fn), ""]
    out.append(signature_html(fn, index))
    out.append("")
    body, returns, raises = docstring_text_and_meta(fn)
    out += body
    # Parameters from the REAL signature (linked), descriptions merged from docstring.
    descs = docstring_descriptions(fn)
    real_params = [p for p in fn.parameters if p.name not in ("self", "cls")]
    if real_params:
        out.append("**Parameters**")
        out.append("")
        for p in real_params:
            t = f" : {code_type(p.annotation, index)}" if p.annotation is not None else ""
            d = f" — {descs[p.name]}" if p.name in descs else ""
            out.append(f"- `{p.name}`{t}{d}")
        out.append("")
    if fn.returns is not None or returns:
        out.append("**Returns**")
        out.append("")
        rt = code_type(fn.returns, index) if fn.returns is not None else ""
        rd = f" — {returns[0]}" if returns else ""
        out.append(f"- {rt}{rd}")
        out.append("")
    if raises:
        out.append("**Raises**")
        out.append("")
        for exc, desc in raises:
            out.append(f"- `{exc}` — {desc}")
        out.append("")
    return out


def render_attribute(at: Attribute, level: int, index: dict[str, tuple[str, str]]) -> list[str]:
    h = "#" * level
    t = f" : {code_type(at.annotation, index)}" if at.annotation is not None else ""
    out = [anchor(at), heading_line(h, at.name, "attribute", at) + t, ""]
    body, _, _ = docstring_text_and_meta(at)
    out += body
    return out


def _summary(obj: griffe.Object) -> str:
    """First line of an object's docstring, escaped, or empty."""
    if not obj.docstring:
        return ""
    first = obj.docstring.value.strip().splitlines()[0] if obj.docstring.value.strip() else ""
    return esc_md(first)


def render_inherited(cls: Class, index: dict[str, tuple[str, str]]) -> list[str]:
    """A collapsed list of inherited public members, labeled by defining class."""
    rows: list[str] = []
    for name, member in cls.inherited_members.items():
        if name.startswith("_"):
            continue
        kind_v = member.kind.value  # proxies through Alias to the real target
        if kind_v not in ("function", "attribute"):
            continue
        kind = "method" if kind_v == "function" else "attribute"
        # Inherited members come back as Aliases pointing at the defining class.
        cp = member.target_path if getattr(member, "is_alias", False) else member.canonical_path
        owner_path = cp.rsplit(".", 1)[0]  # defining class canonical path
        owner_name = owner_path.rsplit(".", 1)[-1]
        url, _ext = resolve_link(owner_path, index)
        owner = f'<a href="{url}">{esc_html(owner_name)}</a>' if url else esc_html(owner_name)
        summ = _summary(member)
        tail = f" — {summ}" if summ else ""
        rows.append(f"- `{name}` <span class=\"api-kind\">{kind}</span> · from {owner}{tail}")
    if not rows:
        return []
    return [
        "<details class=\"api-inherited\">",
        f"<summary>Inherited members ({len(rows)})</summary>",
        "",
        *rows,
        "",
        "</details>",
        "",
    ]


def render_class(cls: Class, level: int, index: dict[str, tuple[str, str]]) -> list[str]:
    h = "#" * level
    out = ['<div class="api-class">', "", anchor(cls), heading_line(h, cls.name, "class", cls), ""]
    if cls.bases:
        linked = ", ".join(link_expr(b, index) for b in cls.bases)
        out.append(f"<p class=\"api-bases\">Bases: <code>{linked}</code></p>")
        out.append("")
    body, _, _ = docstring_text_and_meta(cls)
    out += body

    members = [(n, m) for n, m in cls.members.items() if not n.startswith("_") and isinstance(m, (Function, Attribute))]
    if members:
        out += ['<div class="api-members">', ""]
        for _name, member in members:
            out += ['<div class="api-member">', ""]
            if isinstance(member, Function):
                out += render_function(member, level + 2, index)  # h4 — clearly subordinate to the class h2
            else:
                out += render_attribute(member, level + 2, index)
            out += ["", "</div>"]
        out += ["", "</div>"]
    out += render_inherited(cls, index)
    out += ["", "</div>"]
    return out


def render_module(mod: Module, index: dict[str, tuple[str, str]]) -> str:
    lines = ["---", f"title: {mod.canonical_path}", f"description: API reference for {mod.canonical_path}", "---", ""]
    for name, obj in mod.members.items():
        if name.startswith("_") or isinstance(obj, Alias):
            continue
        if isinstance(obj, Class):
            lines += render_class(obj, 2, index)
            lines.append("")
        elif isinstance(obj, Function):
            lines += render_function(obj, 2, index)
            lines.append("")
    return "\n".join(lines)


def main() -> None:
    outdir = Path(sys.argv[1])
    modnames = sys.argv[2:]
    outdir.mkdir(parents=True, exist_ok=True)
    modules: list[Module] = []
    failures: list[tuple[str, str]] = []
    for name in modnames:
        try:
            modules.append(griffe.load(name, allow_inspection=True))
        except Exception as exc:  # noqa: BLE001 — stress test: report, don't crash
            failures.append((name, f"{type(exc).__name__}: {exc}"))
    index = build_index(modules)
    for mod in modules:
        path = outdir / f"{slug_for(mod.canonical_path)}.mdx"  # e.g. <outdir>/api/vgi-scalar_function.mdx
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(render_module(mod, index))
    print(f"wrote {len(modules)} pages to {outdir}")
    print(f"indexed {len(index)} symbols for cross-linking")
    print("sidebar items:", [slug_for(m.canonical_path) for m in modules])
    if failures:
        print(f"\n{len(failures)} module(s) FAILED to load:")
        for name, err in failures:
            print(f"  - {name}: {err}")


if __name__ == "__main__":
    main()
