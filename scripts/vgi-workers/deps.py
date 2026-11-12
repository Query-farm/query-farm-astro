#!/usr/bin/env python3
"""Generate the VGI worker inventory with dependencies, at each worker's latest release.

The list of workers comes from inventory.toml ([include]). For each one this reads the
build manifest *at the latest release tag* (git show, so local checkouts and their
uncommitted changes are never touched) and records:

  - language, release tag/date, catalog name
  - VGI SDK + vgi-rpc versions (and arrow for Rust), and drift from the newest SDK release
  - direct dependencies with version specs
  - system packages the CI workflows / Dockerfile install (build tooling filtered out)

    deps.py [--dev ~/Development] [--out ~/Development/vgi-workers-inventory]

writes <out>.json and <out>.md. A repo without a local clone is cloned bare into a cache.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
INVENTORY = HERE / "inventory.toml"
CACHE = Path.home() / ".cache" / "vgi-deps"

SDK_REPOS = {"Rust": "vgi-rust", "Go": "vgi-go", "Python": "vgi-python", "TypeScript": "vgi-typescript",
             "Java": "vgi-java"}
# CI/Docker packages that only build or test the worker, not things it needs at runtime.
BUILD_ONLY = {
    "ninja-build", "ccache", "bison", "flex", "autoconf", "autoconf-archive", "automake", "libtool",
    "pkg-config", "cmake", "llvm", "upx", "curl", "ca-certificates", "git", "build-essential", "gcc",
    "g++", "make", "unzip", "zip", "wget", "xz-utils", "gnupg", "protobuf-compiler", "python3",
    "python3-pip", "python3-venv", "tar", "gzip", "jq", "sudo", "tzdata", "file", "libc6-dev",
    "libstdc++6",
}


def sh(*cmd: str, cwd: Path | None = None) -> str:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def repo_dir(dev: Path, repo: str) -> Path:
    local = dev / repo
    if (local / ".git").exists():
        subprocess.run(["git", "-C", str(local), "fetch", "--tags", "--quiet", "origin"], capture_output=True)
        return local
    bare = CACHE / f"{repo}.git"
    if bare.exists():
        subprocess.run(["git", "-C", str(bare), "fetch", "--tags", "--quiet", "--force", "origin",
                        "+refs/heads/*:refs/heads/*"], capture_output=True)
    else:
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--bare", "--quiet", f"https://github.com/Query-farm/{repo}.git",
                        str(bare)], capture_output=True)
    return bare


class Tree:
    """Files of a repo at one ref."""

    def __init__(self, path: Path, ref: str) -> None:
        self.path, self.ref = path, ref
        self.files = sh("git", "-C", str(path), "ls-tree", "-r", "--name-only", ref).split("\n")

    def read(self, name: str) -> str:
        return sh("git", "-C", str(self.path), "show", f"{self.ref}:{name}")

    def find(self, pattern: str) -> list[str]:
        rx = re.compile(pattern)
        return [f for f in self.files if f and rx.search(f)]


# --------------------------------------------------------------------------- per-language manifests


def rust(t: Tree) -> dict:
    deps: dict[str, str] = {}
    for f in t.find(r"(^|/)Cargo\.toml$"):
        if "wasm" in f or "/tests/" in f:
            continue
        try:
            doc = tomllib.loads(t.read(f))
        except tomllib.TOMLDecodeError:
            continue
        for table in (doc.get("workspace", {}).get("dependencies", {}), doc.get("dependencies", {})):
            for k, v in table.items():
                spec = v if isinstance(v, str) else (v.get("version") or ("path" if "path" in v else ""))
                if spec and not (isinstance(v, dict) and v.get("workspace")):
                    deps.setdefault(k, spec)
    # locked versions of the SDK crates
    locked = {}
    lock = t.read("Cargo.lock")
    for m in re.finditer(r'name = "([^"]+)"\nversion = "([^"]+)"', lock):
        if m[1] in ("vgi", "vgi-rpc", "arrow-array", "arrow"):
            locked.setdefault(m[1], m[2])
    sdk = locked.get("vgi") or deps.get("vgi")
    return {"sdk": sdk, "rpc": locked.get("vgi-rpc") or deps.get("vgi-rpc"),
            "arrow": locked.get("arrow-array") or locked.get("arrow"),
            "deps": {k: v for k, v in deps.items() if k not in ("vgi", "vgi-rpc") and v != "path"}}


def go(t: Tree) -> dict:
    mod = t.read("go.mod")
    deps = {}
    block = re.findall(r"require\s*\((.*?)\)", mod, re.S)
    lines = [ln for b in block for ln in b.split("\n")] + re.findall(r"^require[ \t]+([^(\s][^\n]*)$", mod, re.M)
    for ln in lines:
        ln = ln.strip()
        if not ln or ln.startswith("//") or "// indirect" in ln:
            continue
        parts = ln.split()
        if len(parts) >= 2:
            deps[parts[0]] = parts[1]
    sdk = deps.pop("github.com/Query-farm/vgi-go", None)
    rpc = deps.pop("github.com/Query-farm/vgi-rpc-go", None)
    gov = re.search(r"^go\s+(\S+)", mod, re.M)
    return {"sdk": sdk, "rpc": rpc, "toolchain": f"go {gov[1]}" if gov else None, "deps": deps}


def _pyname(spec: str) -> tuple[str, str]:
    m = re.match(r"\s*([A-Za-z0-9_.\-]+)(\[[^\]]*\])?\s*(.*)", spec)
    return (m[1].lower(), (m[3] or "").split(";")[0].strip()) if m else (spec, "")


def python(t: Tree) -> dict:
    try:
        doc = tomllib.loads(t.read("pyproject.toml"))
    except tomllib.TOMLDecodeError:
        doc = {}
    proj = doc.get("project", {})
    deps = dict(_pyname(s) for s in proj.get("dependencies", []))
    extras = {k: [_pyname(s)[0] for s in v] for k, v in proj.get("optional-dependencies", {}).items()}
    sdk = deps.pop("vgi-python", None)
    rpc = deps.pop("vgi-rpc", None)
    return {"sdk": sdk, "rpc": rpc, "toolchain": f"python {proj['requires-python']}" if proj.get("requires-python") else None,
            "deps": deps, "extras": extras}


def typescript(t: Tree) -> dict:
    try:
        doc = json.loads(t.read("package.json") or "{}")
    except json.JSONDecodeError:
        doc = {}
    def resolved(table: dict) -> dict:
        out = {}
        for k, v in table.items():  # resolve aliases: "vgi": "npm:@query-farm/vgi@^0.49"
            m = re.match(r"npm:(@?[^@]+)@(.*)", v)
            k, v = (m[1], m[2]) if m else (k, v)
            out.setdefault(k, v)
        return out

    deps = resolved(doc.get("dependencies", {}))
    dev = resolved(doc.get("devDependencies", {}))  # a bundled worker (e.g. Cloudflare) keeps its SDK here
    sdk = deps.pop("@query-farm/vgi", None) or dev.get("@query-farm/vgi")
    rpc = deps.pop("@query-farm/vgi-rpc", None) or dev.get("@query-farm/vgi-rpc")
    return {"sdk": sdk, "rpc": rpc, "deps": deps}


def java(t: Tree) -> dict:
    deps: dict[str, str] = {}
    for f in t.find(r"(^|/)build\.gradle(\.kts)?$"):
        src = t.read(f)
        vars_ = dict(re.findall(r'val\s+(\w+)\s*=\s*"([^"]+)"', src))
        vars_.update(re.findall(r'(\w+)\s*=\s*["\']([0-9][^"\']*)["\']', src))
        for m in re.finditer(r'(?:implementation|api|runtimeOnly)\s*\(?\s*["\']([^:"\']+):([^:"\']+):([^"\']+)["\']', src):
            v = re.sub(r"\$\{?(\w+)\}?", lambda x: vars_.get(x[1], x[0]), m[3])
            deps[f"{m[1]}:{m[2]}"] = v
    for f in t.find(r"(^|/)pom\.xml$"):
        src = t.read(f)
        for m in re.finditer(r"<dependency>\s*<groupId>([^<]+)</groupId>\s*<artifactId>([^<]+)</artifactId>\s*(?:<version>([^<]+)</version>)?", src):
            deps[f"{m[1]}:{m[2]}"] = m[3] or ""
    sdk = deps.pop("farm.query:vgi", None)
    rpc = deps.pop("farm.query:vgirpc", None)
    return {"sdk": sdk, "rpc": rpc, "deps": deps}


PARSERS = {"Rust": rust, "Go": go, "Python": python, "TypeScript": typescript, "Java": java}


def system_packages(t: Tree) -> list[str]:
    pkgs: set[str] = set()
    for f in t.find(r"^\.github/workflows/.*\.ya?ml$") + t.find(r"(^|/)Dockerfile[^/]*$"):
        src = t.read(f).replace("\\\n", " ")
        for m in re.finditer(r"(?:apt-get|apt|brew|apk)\s+(?:-\S+\s+)*(?:install|add)\s+([^\n&|;]+)", src):
            for p in m[1].split():
                if p.startswith(("-", "$")) or "=" in p and not p.split("=")[0]:
                    continue
                p = p.split("=")[0]
                if p and p not in BUILD_ONLY and re.match(r"^[a-z0-9][a-z0-9.+\-]*$", p):
                    pkgs.add(p)
    return sorted(pkgs)


def language_of(t: Tree, gh_lang: str | None) -> str | None:
    if "Cargo.toml" in t.files:
        return "Rust"
    if "go.mod" in t.files:
        return "Go"
    if t.find(r"(^|/)build\.gradle(\.kts)?$|(^|/)pom\.xml$"):
        return "Java"
    if "pyproject.toml" in t.files:
        return "Python"
    if "package.json" in t.files:
        return "TypeScript"
    return gh_lang


def bare_version(spec: str | None) -> str | None:
    m = re.search(r"\d+\.\d+(?:\.\d+)?", spec or "")
    return m[0] if m else None


def vkey(v: str | None) -> tuple:
    return tuple(int(x) for x in (v or "0").split("."))


def sdk_behind(spec: str | None, newest: str | None) -> bool:
    """Whether the declared SDK requirement can't reach the newest release.

    Exact pins, Go/Java versions, npm ^0.x / ~ ranges and Python upper bounds are compared
    against the newest release; an open-ended Python ``>=`` floats, so it isn't behind.
    """
    if not spec or not newest:
        return False
    s = spec.strip()
    if s.startswith(">=") and "<" not in s:
        return False
    upper = re.search(r"<\s*(\d+\.\d+(?:\.\d+)?)", s)
    if upper:
        return vkey(newest) >= vkey(upper[1])
    return vkey(bare_version(s)) < vkey(newest)


# --------------------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dev", type=Path, default=Path.home() / "Development")
    ap.add_argument("--out", type=Path, default=Path.home() / "Development" / "vgi-workers-inventory")
    args = ap.parse_args()

    inv = tomllib.loads(INVENTORY.read_text())
    gh = {r["name"]: r for r in json.loads(sh("gh", "repo", "list", "Query-farm", "--limit", "1000", "--json",
                                              "name,latestRelease,visibility,primaryLanguage") or "[]")}
    latest_sdk = {lang: bare_version(((gh.get(repo) or {}).get("latestRelease") or {}).get("tagName"))
                  for lang, repo in SDK_REPOS.items()}

    workers = []
    for repo, opts in sorted(inv["include"].items()):
        g = gh.get(repo, {})
        rel = g.get("latestRelease") or {}
        rec: dict = {"repo": repo, "catalog": (opts or {}).get("catalog") or repo.removeprefix("vgi-"),
                     "visibility": (g.get("visibility") or "").lower() or None,
                     "release": rel.get("tagName"), "released_at": (rel.get("publishedAt") or "")[:10] or None}
        path = repo_dir(args.dev, repo)
        ref = rel.get("tagName") or "HEAD"
        t = Tree(path, ref)
        if not t.files[0]:
            ref, t = "HEAD", Tree(path, "HEAD")
        rec["read_at"] = ref
        lang = language_of(t, (g.get("primaryLanguage") or {}).get("name"))
        rec["language"] = lang
        info = PARSERS[lang](t) if lang in PARSERS else {"deps": {}}
        rec.update(info)
        rec["system"] = system_packages(t)
        cur, newest = bare_version(info.get("sdk")), latest_sdk.get(lang)
        rec["sdk_latest"] = newest
        rec["sdk_behind"] = sdk_behind(info.get("sdk"), newest)
        workers.append(rec)
        print(f"{repo:32} {lang or '?':10} {ref:10} sdk {info.get('sdk')}", file=sys.stderr)

    now = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()
    out = {"generated_at": now, "source": "scripts/vgi-workers/inventory.toml + each repo at its latest release",
           "sdk_latest": latest_sdk, "workers": workers}
    args.out.with_suffix(".json").write_text(json.dumps(out, indent=1) + "\n")
    args.out.with_suffix(".md").write_text(render_md(out))
    print(f"wrote {args.out}.json and .md ({len(workers)} workers)", file=sys.stderr)


def render_md(d: dict) -> str:
    ws = d["workers"]
    by_lang: dict[str, int] = {}
    for w in ws:
        by_lang[w["language"] or "?"] = by_lang.get(w["language"] or "?", 0) + 1
    L = [
        "# VGI workers: inventory and dependencies",
        "",
        f"Generated {d['generated_at']} by `query-farm-astro/scripts/vgi-workers/deps.py` from "
        "`inventory.toml`, reading each repo at its latest release tag. Do not edit by hand; rerun the script.",
        "",
        f"{len(ws)} workers: " + ", ".join(f"{n} {k}" for k, n in sorted(by_lang.items(), key=lambda x: -x[1])) + ".",
        "",
        "Newest SDK releases: " + ", ".join(f"{k} {v}" for k, v in d["sdk_latest"].items()) + ".",
        "",
        "⚠ = the declared SDK requirement can't reach the newest SDK release. System packages are what CI or the "
        "Dockerfile installs (build-only tooling filtered out); a worker can need more than CI shows.",
        "",
        "| Worker | Lang | Release | SDK | vgi-rpc | System packages | Direct dependencies |",
        "|---|---|---|---|---|---|---|",
    ]
    for w in ws:
        rel = w["release"] or f"unreleased ({w['visibility']})"
        sdk = (w.get("sdk") or "—") + (" ⚠" if w["sdk_behind"] else "")
        deps = ", ".join(f"{k} {v}".strip() for k, v in sorted(w.get("deps", {}).items())) or "—"
        L.append(f"| {w['repo']} | {w['language'] or '?'} | {rel} | {sdk} | {w.get('rpc') or '—'} | "
                 f"{', '.join(w['system']) or '—'} | {deps.replace('|', '/')} |")
    behind = [w["repo"] for w in ws if w["sdk_behind"]]
    L += ["", f"## Behind the newest SDK ({len(behind)})", "", ", ".join(behind) or "None.", ""]
    return "\n".join(L)


if __name__ == "__main__":
    main()
