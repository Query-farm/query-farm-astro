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

import html
import re
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

# Short-name -> canonical-path map, so docstring cross-refs that name a symbol by
# its bare name (``[`BoundStorage`][]``) resolve to its documented page. Populated
# by build_index. First definition wins on collisions (good enough for our surface).
_NAME_INDEX: dict[str, str] = {}

# Documented *class* names, so a plain inline-code mention of a type (``BoundStorage``)
# auto-links to its page even when the docstring didn't use [`X`][] cross-ref syntax.
# Classes only (not methods/functions) to avoid over-linking common words.
_CLASS_NAMES: set[str] = set()

# ── escaping ──────────────────────────────────────────────────────────────


def esc_md(text: str) -> str:
    """Escape chars MDX reads as JSX in Markdown prose, leaving inline code spans alone.

    Splitting on code spans (single or double backtick) is essential: blanket-escaping
    would turn ``a -> b`` / ``list<int>`` *inside* a code span into literal ``-&gt;`` /
    ``&lt;`` (CommonMark doesn't decode entities in code). Outside code we escape a
    stray ``<`` (one not starting a tag) and braces; ``>`` is harmless in MDX prose."""
    parts = re.split(r"(``[^`]+``|`[^`]+`)", text)
    for idx in range(0, len(parts), 2):
        # Outside code spans, docstring prose never carries intentional JSX (the
        # generator emits its own components separately), so escape every '<' and
        # brace — e.g. a literal type like "named_<name>" would otherwise parse as a tag.
        seg = parts[idx].replace("<", "&lt;").replace("{", "&#123;").replace("}", "&#125;")
        parts[idx] = seg
    return "".join(parts)


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


def _resolve_member(obj: griffe.Object | Alias) -> Class | Function | None:
    """The underlying Class/Function for a member or re-export alias (within ``vgi.*``).

    Returns None for anything we don't render directly: attributes, modules, aliases to
    third-party objects (``typing.Any``), or aliases that can't be resolved.
    """
    if isinstance(obj, (Class, Function)):
        return obj
    if isinstance(obj, Alias):
        try:
            target = obj.final_target
        except Exception:  # noqa: BLE001 — unresolvable alias (e.g. typing.TYPE_CHECKING)
            return None
        if isinstance(target, (Class, Function)) and target.canonical_path.split(".", 1)[0] == "vgi":
            return target
    return None


def module_members(mod: Module) -> list[tuple[str, Class | Function, str | None]]:
    """Renderable (display_name, object, alias_path) tuples for a module.

    Modules that define real classes/functions render those and skip aliases (so a
    re-exported helper isn't duplicated onto every page that imports it). A *pure
    re-export package* (``vgi.catalog`` / ``vgi.client`` — no real members, only
    aliases) instead resolves its aliases to their targets, so the page isn't empty.
    """
    reals = [(n, o) for n, o in mod.members.items() if not n.startswith("_") and isinstance(o, (Class, Function))]
    if reals:
        out: list[tuple[str, Class | Function, str | None]] = [(n, o, None) for n, o in reals]
    else:
        out = []
        seen: set[str] = set()
        for name, obj in mod.members.items():
            if name.startswith("_"):
                continue
            real = _resolve_member(obj)
            if real is None or real.canonical_path in seen:
                continue
            seen.add(real.canonical_path)
            out.append((name, real, f"{mod.canonical_path}.{name}"))
    # Alphabetise so the page sections — and thus the sidebar TOC — are easy to scan.
    return sorted(out, key=lambda t: t[0].lower())


def build_index(modules: list[Module]) -> dict[str, tuple[str, str]]:
    """canonical_path -> (page_slug, anchor_id) for everything we document."""
    index: dict[str, tuple[str, str]] = {}

    def add(obj: griffe.Object, slug: str, alias_path: str | None = None) -> None:
        index[obj.canonical_path] = (slug, obj.canonical_path)
        _NAME_INDEX.setdefault(obj.name, obj.canonical_path)
        if isinstance(obj, Class):
            _CLASS_NAMES.add(obj.name)
        if alias_path is not None:  # re-export path also resolves to this page
            index[alias_path] = (slug, obj.canonical_path)

    for mod in modules:
        slug = slug_for(mod.canonical_path)  # one page per module
        for _name, obj, alias_path in module_members(mod):
            add(obj, slug, alias_path)
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


_SOURCE_CACHE: dict[str, list[str]] = {}


def leading_comment(obj: griffe.Object) -> str:
    """The contiguous ``# …`` comment block immediately above an attribute, joined.

    Many dataclasses document fields with leading line comments rather than attribute
    docstrings or an ``Attributes:`` section; Griffe doesn't surface those, so we read
    them from source to use as a last-resort description.
    """
    fp = getattr(obj, "filepath", None)
    lineno = getattr(obj, "lineno", None)
    if fp is None or lineno is None:
        return ""
    key = str(fp)
    src = _SOURCE_CACHE.get(key)
    if src is None:
        try:
            src = Path(fp).read_text().splitlines()
        except OSError:
            src = []
        _SOURCE_CACHE[key] = src
    out: list[str] = []
    i = lineno - 2  # 0-based line directly above the attribute
    while i >= 0 and src[i].strip().startswith("#"):
        out.append(src[i].strip().lstrip("#").strip())
        i -= 1
    out.reverse()
    return " ".join(c for c in out if c).strip()


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


# ── inline docstring markup: cross-refs + code spans ─────────────────────────

# mkdocstrings cross-reference: ``[`Name`][target]`` / ``[`Name`][]`` / ``[text][path]``.
# Optional backticks around the display text mark it as code; an empty ``[]`` target
# means "resolve the display text itself". A balanced pair of *outer* backticks
# (``\`[\`Name\`][]\```) is consumed and dropped — the inner backticks already make
# the link text code, so the outer pair would otherwise turn the whole link literal.
_XREF_RE = re.compile(r"(?P<obt>`?)\[(?P<bt>`?)(?P<text>[^\]`]+)(?P=bt)\]\[(?P<target>[^\]]*)\](?P=obt)")
# A plain inline code span — RST double-backtick (``code``) or Markdown single
# (`code`). Double must be tried first, else the single-backtick branch mis-pairs
# adjacent ``a``, ``b`` literals and wraps the ", " between them in <code>.
_CODE_RE = re.compile(r"``(?P<code2>[^`]+)``|`(?P<code>[^`]+)`")
# Either of the above, matched left-to-right (xref wins since it starts with '[').
_INLINE_RE = re.compile(f"(?P<xref>{_XREF_RE.pattern})|(?P<span>{_CODE_RE.pattern})")


def _resolve_ref(key: str, index: dict[str, tuple[str, str]]) -> tuple[str | None, bool]:
    """Resolve a cross-ref key (full canonical path or bare name) to (url, external)."""
    if key in index:
        return resolve_link(key, index)
    cp = _NAME_INDEX.get(key)
    if cp is not None:
        return resolve_link(cp, index)
    return resolve_link(key, index)  # last chance: external root match


def _xref_html(text: str, target: str, as_code: bool, index: dict[str, tuple[str, str]]) -> str:
    """Render one cross-ref as HTML (code span, linked when the target resolves)."""
    inner = f"<code>{esc_html(text)}</code>" if as_code else esc_html(text)
    url, external = _resolve_ref(target or text, index)
    if not url:
        return inner
    ext = ' class="api-ext" target="_blank" rel="noopener"' if external else ""
    return f"<a href=\"{url}\"{ext}>{inner}</a>"


_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _autolink(name: str, index: dict[str, tuple[str, str]]) -> str | None:
    """URL for a bare class-name code span (``BoundStorage``), or None if not a class."""
    if not _IDENT_RE.match(name) or name not in _CLASS_NAMES:
        return None
    cp = _NAME_INDEX.get(name)
    if cp is None:
        return None
    url, _external = resolve_link(cp, index)
    return url


def render_inline(text: str, index: dict[str, tuple[str, str]]) -> str:
    """Render docstring inline markup to HTML for raw-HTML contexts (``<dd>`` etc.).

    Resolves mkdocstrings cross-refs to links and turns ``code`` spans into
    ``<code>`` — markdown isn't processed inside raw HTML, so we do it here. A code
    span that names a documented class is wrapped in a link to its page.
    """
    parts: list[str] = []
    pos = 0
    for m in _INLINE_RE.finditer(text):
        parts.append(esc_html(text[pos : m.start()]))
        if m.group("xref") is not None:
            parts.append(_xref_html(m.group("text"), m.group("target"), bool(m.group("bt")), index))
        else:
            code = m.group("code2") or m.group("code")
            span = f"<code>{esc_html(code)}</code>"
            url = _autolink(code, index)
            parts.append(f'<a href="{url}">{span}</a>' if url else span)
        pos = m.end()
    parts.append(esc_html(text[pos:]))
    html = "".join(parts)
    # This renders inside a single raw-HTML <dd>, so collapse block structure: a
    # Markdown bullet becomes a line-broken bullet, and soft-wrap newlines become
    # spaces. Leaving raw "\n- " here would break MDX (a list inside raw HTML).
    html = re.sub(r"\n[ \t]*[-*][ \t]+", "<br />• ", html)
    html = re.sub(r"\s*\n\s*", " ", html)
    return html.strip()


def resolve_xrefs_md(text: str, index: dict[str, tuple[str, str]]) -> str:
    """Rewrite mkdocstrings cross-refs in Markdown prose to inline links.

    Leaves all other Markdown (emphasis, code spans, lists) untouched — only the
    ``[ref][target]`` shorthand, which would otherwise render as literal text.
    """

    def repl(m: re.Match[str]) -> str:
        text_, target = m.group("text"), m.group("target")
        disp = f"`{text_}`" if m.group("bt") else text_
        url, _external = _resolve_ref(target or text_, index)
        # A Markdown link whose text is a code span renders as a linked `code`.
        return f"[{disp}]({url})" if url else disp

    return _XREF_RE.sub(repl, text)


# A code span NOT already inside a Markdown link (not preceded by '[' nor followed
# by ']('), so auto-linking doesn't nest a link inside an existing cross-ref link.
_FREE_CODE_RE = re.compile(r"(?<!\[)``(?P<c2>[^`]+)``(?!\]\()|(?<!\[)`(?P<c1>[^`]+)`(?!\]\()")


def autolink_md(text: str, index: dict[str, tuple[str, str]]) -> str:
    """In Markdown prose, link a bare class-name code span to its page."""

    def repl(m: re.Match[str]) -> str:
        name = m.group("c2") or m.group("c1")
        url = _autolink(name, index)
        return f"[`{name}`]({url})" if url else m.group(0)

    return _FREE_CODE_RE.sub(repl, text)


def code_component(code_lines: list[str], lang: str = "python") -> str:
    """Emit a Starlight ``<Code>`` element for a docstring code block.

    Fenced code nested inside our raw-HTML symbol ``<div>``s is not picked up by
    Expressive Code's remark transform, so it renders unhighlighted. The ``<Code>``
    component renders through Expressive Code at runtime (farm theme) regardless of
    nesting. The body is escaped for a JS template literal.
    """
    body = "\n".join(code_lines)
    esc = body.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    return f"<Code lang=\"{lang}\" code={{`{esc}`}} />"


# ── signatures ──────────────────────────────────────────────────────────────


def _param_html(p: griffe.Parameter, index: dict[str, tuple[str, str]]) -> tuple[str, str]:
    """Return (html, plain) for one parameter — plain is used for width estimation."""
    prefix = {"var_positional": "*", "var_keyword": "**"}.get(p.kind.name, "")
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
    """A code-block signature with clickable types, the `*`/`/` separators that
    mark keyword-only / positional-only params, and var-arg prefixes. Wraps if long."""
    parts_html: list[str] = []
    parts_plain: list[str] = []
    seen_varpos = False
    star_done = False
    prev_kind: str | None = None
    for p in fn.parameters:
        if p.name in ("self", "cls"):
            continue
        k = p.kind.name
        if prev_kind == "positional_only" and k != "positional_only":
            parts_html.append("/")
            parts_plain.append("/")
        if k == "keyword_only" and not seen_varpos and not star_done:
            parts_html.append("*")  # bare * — everything after is keyword-only
            parts_plain.append("*")
            star_done = True
        if k == "var_positional":
            seen_varpos = True
        h, pl = _param_html(p, index)
        parts_html.append(h)
        parts_plain.append(pl)
        prev_kind = k
    if prev_kind == "positional_only":
        parts_html.append("/")
        parts_plain.append("/")
    ret = f" -&gt; {link_expr(fn.returns, index)}" if fn.returns is not None else ""
    name = esc_html(fn.name)
    plain_len = len(fn.name) + 2 + sum(len(pl) + 2 for pl in parts_plain) + (len(str(fn.returns)) + 4 if fn.returns else 0)
    if plain_len <= 72 or not parts_html:
        body = f"{name}({', '.join(parts_html)}){ret}"
    else:
        inner = ",\n".join(f"    {h}" for h in parts_html)
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


def docstring_attributes(obj: griffe.Object) -> dict[str, str]:
    """Map attribute-name -> description from a class docstring's ``Attributes:`` section.

    Griffe keeps these on the class docstring rather than on the attribute members,
    so the member blocks would otherwise show no description.
    """
    out: dict[str, str] = {}
    if not obj.docstring:
        return out
    for sec in obj.docstring.parse("google"):
        if sec.kind.value == "attributes":
            for a in sec.value:
                out[a.name] = a.description
    return out


def class_member_descriptions(cls: Class) -> dict[str, str]:
    """Combined attribute descriptions for a class, from every place authors put them.

    Instance/slot attributes are documented in any of three spots and Griffe does not
    merge them onto the member: the class ``Attributes:`` section, the ``__init__``
    ``Args:`` section, or (rarely) the attribute's own docstring. We pull from all of
    them — Attributes first, then __init__ Args — so no documented member renders blank.
    """
    descs = docstring_attributes(cls)
    init = cls.members.get("__init__")
    if isinstance(init, Function):
        for name, desc in docstring_descriptions(init).items():
            if desc and descs.get(name, "") == "":
                descs[name] = desc
    return descs


def _deslug(s: str) -> str:
    """Turn a Griffe admonition kind slug into a Title-case label."""
    s = s.replace("-", " ").replace("_", " ").strip()
    return s[:1].upper() + s[1:] if s else s


def _render_indented_deflist(code: list[str], index: dict[str, tuple[str, str]]) -> list[str]:
    """Render an indented definition list (term line + deeper-indented description).

    ``code`` is already dedented by one level, so a term sits at column 0 and its
    description lines at >=4. Terms and descriptions both run through ``render_inline``
    so cross-refs and code spans resolve. Falls back to prose for stray lines.
    """
    items: list[str] = []
    j, m = 0, len(code)
    while j < m:
        if not code[j].strip():
            j += 1
            continue
        indent = len(code[j]) - len(code[j].lstrip(" "))
        if indent == 0:
            term = code[j].strip()
            desc: list[str] = []
            j += 1
            while j < m and (not code[j].strip() or (len(code[j]) - len(code[j].lstrip(" "))) >= 4):
                if code[j].strip():
                    desc.append(code[j].strip())
                j += 1
            term_html = render_inline(term, index)
            desc_html = render_inline(" ".join(desc), index) if desc else ""
            items.append(f"<dt>{term_html}</dt><dd>{desc_html}</dd>")
        else:  # stray indented line with no term — keep it as its own description row
            items.append(f"<dd>{render_inline(code[j].strip(), index)}</dd>")
            j += 1
    if not items:
        return []
    return ['<dl class="api-deflist api-deflist--doc">' + "".join(items) + "</dl>", ""]


def render_doc_block(text: str, index: dict[str, tuple[str, str]]) -> list[str]:
    """Render a docstring body to MDX, preserving code and taming RST-isms.

    Real-world docstrings mix prose with RST flourishes that Markdown/MDX
    mishandle:
    - indented code blocks (often with no preceding blank line) → would render
      as a proportional-font paragraph; we wrap them in ```python fences.
    - setext underlines (``----`` under a title) → would become a stray, wrongly
      sized heading; we emit the title as a bold label instead.
    - trailing RST ``::`` literal-block markers → trimmed to ``:``.
    Prose is MDX-escaped; code inside fences is left raw.
    """
    def indent_of(s: str) -> int:
        return len(s) - len(s.lstrip(" "))

    lines = text.split("\n")
    out: list[str] = []
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()
        # setext underline → make the previous prose line a bold label
        if stripped and set(stripped) <= {"-", "="} and len(stripped) >= 3 and out and out[-1].strip():
            title = out.pop().strip()
            if out and out[-1] == "":
                out.pop()
            out += ["", f"**{title}**", ""]
            i += 1
            continue
        # Markdown list (ordered or bulleted) at list indent (<=3). Collect the whole
        # list — items AND their indented continuation lines — and emit as Markdown.
        # Without this, a continuation line indented >=4 is mistaken for a code block.
        m_list = re.match(r"^( {0,3})(?:\d+[.)]|[-*+])\s", line)
        if m_list:
            list_indent = len(m_list.group(1))
            block = [line]
            i += 1
            while i < n:
                nxt = lines[i]
                if not nxt.strip():  # blank line — keep, may be intra-list spacing
                    block.append(nxt)
                    i += 1
                    continue
                if indent_of(nxt) > list_indent or re.match(r"^ {0,3}(?:\d+[.)]|[-*+])\s", nxt):
                    block.append(nxt)
                    i += 1
                    continue
                break
            while block and not block[-1].strip():
                block.pop()
            # dedent to the list's own indent so Markdown sees a top-level list.
            for bl in block:
                ded = bl[list_indent:] if len(bl) >= list_indent else bl
                out.append(autolink_md(resolve_xrefs_md(esc_md(ded), index), index))
            out.append("")
            continue
        # RST definition list: a non-indented "term" (e.g. `output_type(params) -> X`)
        # that does NOT end in ':' (that signals a code lead), followed by an
        # indented description. Render the term as monospace code, description as prose.
        if stripped and indent_of(line) == 0 and not line.rstrip().endswith(":"):
            j = i + 1
            while j < n and not lines[j].strip():
                j += 1
            if j < n and indent_of(lines[j]) >= 4:
                desc: list[str] = []
                k = j
                while k < n and (indent_of(lines[k]) >= 4 or not lines[k].strip()):
                    desc.append(lines[k].strip())
                    k += 1
                desc_text = render_inline(" ".join(d for d in desc if d), index)
                out.append(
                    f'<dl class="api-deflist api-deflist--doc"><dt><code>{esc_html(stripped)}</code></dt>'
                    f"<dd>{desc_text}</dd></dl>"
                )
                i = k
                continue
        # indented block: real Python code, OR an indented definition list (a term
        # line + further-indented description, common for "this module provides …").
        if line.startswith("    ") and stripped:
            code: list[str] = []
            while i < n and (lines[i].startswith("    ") or lines[i].strip() == ""):
                code.append("" if lines[i].strip() == "" else lines[i][4:])
                i += 1
            while code and code[0] == "":
                code.pop(0)
            while code and code[-1] == "":
                code.pop()
            block_text = "\n".join(code)
            # Cross-ref syntax or Markdown bold means this is prose, not code.
            if re.search(r"\[`?[^\]`]+`?\]\[", block_text) or "**" in block_text:
                out += _render_indented_deflist(code, index)
            else:
                out += ["", code_component(code), ""]
            continue
        # prose: trim a trailing RST literal-block "::" to ":"
        if line.rstrip().endswith("::"):
            line = line.rstrip()[:-1]
        out.append(autolink_md(resolve_xrefs_md(esc_md(line), index), index))
        i += 1
    return out


def docstring_text_and_meta(
    obj: griffe.Object, index: dict[str, tuple[str, str]]
) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    """Return (summary/body lines, returns lines, [(exc, desc)] raises)."""
    body: list[str] = []
    returns: list[str] = []
    raises: list[tuple[str, str]] = []
    if not obj.docstring:
        return body, returns, raises
    for sec in obj.docstring.parse("google"):
        k = sec.kind.value
        if k == "text":
            body += render_doc_block(sec.value, index)
            body.append("")
        elif k == "admonition":
            a = sec.value
            label = getattr(a, "title", None) or _deslug(getattr(a, "kind", "note"))
            body += ["", f"**{label}**", ""]
            body += render_doc_block(getattr(a, "contents", "") or "", index)
            body.append("")
        elif k == "returns":
            for r in sec.value:
                returns.append(render_inline(r.description, index))
        elif k == "raises":
            for r in sec.value:
                raises.append((str(r.annotation), render_inline(r.description, index)))
    return body, returns, raises


# ── renderers ────────────────────────────────────────────────────────────────


def head_row(level: int, name: str, kind: str, obj: griffe.Object, with_source: bool = True) -> list[str]:
    """A symbol header: a Markdown heading (so Starlight's TOC collects it) carrying a
    CSS-masked Phosphor kind glyph, a short kind tag, and the name + a stable anchor.

    The kind tag is real text, so it flows into the "On this page" TOC entry (e.g.
    "class TableFunctionGenerator") — letting readers see each entry's type there.
    ``with_source=False`` omits the source link (used for class attributes, where it
    only adds vertical noise)."""
    hashes = "#" * level
    icon = f'<span class="api-icon api-icon--{kind}"></span>'
    tag = f'<span class="api-kind-tag api-kind-tag--{kind}">{kind}</span>'
    out = [f'<a id="{obj.canonical_path}"></a>', f"{hashes} {icon}{tag} `{name}`", ""]
    src = source_url(obj)
    if with_source and src:
        out += [f'<a class="api-source" href="{src}" target="_blank" rel="noopener">source</a>', ""]
    return out


def _deflist(rows: list[tuple[str, str]], label: str) -> list[str]:
    """A labeled definition list (term html, description text), as one HTML block."""
    items = "".join((f"<dt>{term}</dt><dd>{desc}</dd>" if term else f"<dd>{desc}</dd>") for term, desc in rows)
    return [f'<div class="api-meta-block"><p class="api-label">{label}</p><dl class="api-deflist">{items}</dl></div>', ""]


def _raises_term(exc: str, index: dict[str, tuple[str, str]]) -> str:
    """Style an exception type as an ``api-ptype`` pill, linking it when the docstring
    wrote it as a cross-ref (``[`SchemaValidationError`][]``) that resolves."""
    m = _XREF_RE.fullmatch(exc.strip())
    if not m:
        return f'<code class="api-ptype">{esc_html(exc)}</code>'
    name = m.group("text")
    pill = f'<code class="api-ptype">{esc_html(name)}</code>'
    url, external = _resolve_ref(m.group("target") or name, index)
    if not url:
        return pill
    ext = ' class="api-ext" target="_blank" rel="noopener"' if external else ""
    return f'<a href="{url}"{ext}>{pill}</a>'


def render_function(fn: Function, level: int, index: dict[str, tuple[str, str]]) -> list[str]:
    kind = "method" if (fn.parent and isinstance(fn.parent, Class)) else "function"
    out = head_row(level, fn.name, kind, fn)
    out.append(signature_html(fn, index))
    out.append("")
    body, returns, raises = docstring_text_and_meta(fn, index)
    out += body
    descs = docstring_descriptions(fn)
    real_params = [p for p in fn.parameters if p.name not in ("self", "cls")]
    # The signature already carries every parameter name + type. The Parameters
    # section adds only what the signature can't: the prose description. So show
    # a row only for params that *have* a description, and drop the section when
    # none do — no restating the bare names.
    described = [(p, descs[p.name]) for p in real_params if descs.get(p.name)]
    if described:
        rows = [(f'<code class="api-pname">{esc_html(p.name)}</code>', render_inline(d, index)) for p, d in described]
        out += _deflist(rows, "Parameters")
    if returns:
        # Griffe splits an under-indented multi-line ``Returns:`` block into one entry
        # per line; they're a single description, so join them back into one row.
        out += _deflist([("", " ".join(returns))], "Returns")
    if raises:
        out += _deflist([(_raises_term(exc, index), desc) for exc, desc in raises], "Raises")
    return out


def render_attribute(
    at: Attribute, level: int, index: dict[str, tuple[str, str]], fallback_desc: str = ""
) -> list[str]:
    out = head_row(level, at.name, "attribute", at, with_source=False)
    if at.annotation is not None:
        out += [f'<p class="api-atype"><code>{link_expr(at.annotation, index)}</code></p>', ""]
    body, _, _ = docstring_text_and_meta(at, index)
    # Attributes are commonly documented in the owning class's ``Attributes:`` section
    # or with a leading ``#`` comment rather than inline; fall back to whichever exists.
    if not any(line.strip() for line in body):
        desc = fallback_desc or leading_comment(at)
        if desc:
            body = render_doc_block(desc, index)
    out += body
    return out


def _summary(obj: griffe.Object, index: dict[str, tuple[str, str]]) -> str:
    """First line of an object's docstring, with cross-refs/code-spans linked, or empty."""
    if not obj.docstring:
        return ""
    first = obj.docstring.value.strip().splitlines()[0] if obj.docstring.value.strip() else ""
    return autolink_md(resolve_xrefs_md(esc_md(first), index), index)


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
        summ = _summary(member, index)
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
    out = ['<div class="api-class">', "", *head_row(level, cls.name, "class", cls)]
    if cls.bases:
        linked = ", ".join(link_expr(b, index) for b in cls.bases)
        out.append(f"<p class=\"api-bases\">Bases: <code>{linked}</code></p>")
        out.append("")
    # Segment the class into labelled sections so the prose description, the
    # attributes, and the methods each read as a distinct, scannable block.
    body, _, _ = docstring_text_and_meta(cls, index)
    if any(line.strip() for line in body):
        out += ['<p class="api-section">Description</p>', ""]
        out += body
    attr_descs = class_member_descriptions(cls)  # Attributes section + __init__ Args fallbacks
    members = [(n, m) for n, m in cls.members.items() if not n.startswith("_") and isinstance(m, (Function, Attribute))]
    attributes = [m for _n, m in members if isinstance(m, Attribute)]
    methods = [m for _n, m in members if isinstance(m, Function)]

    def group_lines(label: str, rendered: list[list[str]]) -> list[str]:
        if not rendered:
            return []
        lines = [f'<p class="api-section">{label}</p>', "", '<div class="api-members">', ""]
        for block in rendered:
            lines += ['<div class="api-member">', "", *block, "", "</div>"]
        lines += ["", "</div>"]
        return lines

    out += group_lines("Attributes", [render_attribute(a, level + 2, index, attr_descs.get(a.name, "")) for a in attributes])
    out += group_lines("Methods", [render_function(f, level + 2, index) for f in methods])
    out += render_inherited(cls, index)
    out += ["", "</div>"]
    return out


def render_module(mod: Module, index: dict[str, tuple[str, str]]) -> str:
    lines = [
        "---",
        f"title: {mod.canonical_path}",
        f"description: API reference for {mod.canonical_path}",
        "---",
        "import { Code } from '@astrojs/starlight/components';",
        "",
    ]
    # The module-level docstring is the page's overview — render it in a labelled panel
    # (offset from the symbol docs) so it's clearly the top-level module documentation.
    body, _, _ = docstring_text_and_meta(mod, index)
    if any(line.strip() for line in body):
        lines += ['<div class="api-module-doc">', "", '<p class="api-module-doc__label">Module overview</p>', "", *body, "", "</div>", ""]
    for _name, obj, _alias in module_members(mod):
        if isinstance(obj, Class):
            lines += render_class(obj, 2, index)
            lines.append("")
        elif isinstance(obj, Function):
            lines += render_function(obj, 2, index)
            lines.append("")
    return "\n".join(lines)


# ── completeness audit ───────────────────────────────────────────────────────
#
# Acceptance criterion: every documented member renders its documentation. The
# audit re-derives each member's expected description straight from Griffe's parsed
# docstring sections — independently of the render path — and asserts the rendered
# block contains it. This is what catches "attribute X has a description in the
# source but renders blank" without hand-spot-checking.


def _normalize_text(s: str) -> str:
    """Strip HTML/Markdown markup so docstring text and rendered HTML compare equal."""
    s = html.unescape(s)
    s = re.sub(r"<[^>]+>", "", s)  # HTML tags
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)  # [text](url) -> text
    s = re.sub(r"\[([^\]]+)\]\[[^\]]*\]", r"\1", s)  # [text][ref] -> text
    s = s.replace("`", "")
    return re.sub(r"\s+", " ", s).strip()


def _is_rendered(expected: str, rendered: str) -> bool:
    """True if the (markup-stripped) expected text appears in the rendered block."""
    exp = _normalize_text(expected)
    if not exp:
        return True
    # Compare on a leading fragment — enough to be distinctive, robust to trailing
    # reflow/escaping differences in long multi-line descriptions.
    fragment = exp[:40]
    return fragment in _normalize_text(rendered)


def audit_completeness(modules: list[Module], index: dict[str, tuple[str, str]]) -> list[str]:
    """Return a list of "documented but not rendered" problems across all modules."""
    problems: list[str] = []

    def check(where: str, expected: str, rendered: str) -> None:
        if expected and not _is_rendered(expected, rendered):
            problems.append(f"{where}: documented but not rendered → {_normalize_text(expected)[:60]!r}")

    def audit_function(fn: Function, where: str) -> None:
        rendered = "\n".join(render_function(fn, 4, index))
        for pname, pdesc in docstring_descriptions(fn).items():
            if pname not in ("self", "cls"):
                check(f"{where}(param {pname})", pdesc, rendered)
        _body, returns, raises = docstring_text_and_meta(fn, index)
        for r in returns:
            check(f"{where}(returns)", r, rendered)
        for exc, desc in raises:
            check(f"{where}(raises {exc})", desc, rendered)

    for mod in modules:
        for _name, obj, _alias in module_members(mod):
            if isinstance(obj, Function):
                audit_function(obj, obj.canonical_path)
            elif isinstance(obj, Class):
                render_descs = class_member_descriptions(obj)  # what the renderer feeds in
                # Independent expectation: derive each attribute's description straight
                # from Griffe's raw sources, NOT from class_member_descriptions — so a
                # bug in that combiner can't hide here by agreeing with the renderer.
                attr_section = docstring_attributes(obj)
                init = obj.members.get("__init__")
                init_args = docstring_descriptions(init) if isinstance(init, Function) else {}
                for mname, member in obj.members.items():
                    if mname.startswith("_"):
                        continue
                    where = f"{mod.canonical_path}.{obj.name}.{mname}"
                    if isinstance(member, Attribute):
                        own = member.docstring.value.strip() if member.docstring else ""
                        expected = own or attr_section.get(mname, "") or init_args.get(mname, "") or leading_comment(member)
                        rendered = "\n".join(render_attribute(member, 4, index, render_descs.get(mname, "")))
                        check(where, expected, rendered)
                    elif isinstance(member, Function):
                        audit_function(member, where)
    return problems


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

    problems = audit_completeness(modules, index)
    if problems:
        print(f"\nCOMPLETENESS AUDIT FAILED — {len(problems)} documented item(s) not rendered:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)
    print("completeness audit: OK (every documented member renders its documentation)")


if __name__ == "__main__":
    main()
