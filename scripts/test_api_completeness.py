"""Verification tests for the Griffe -> MDX API reference generator.

Acceptance criterion: **every documented member renders its documentation.** These
tests load the real ``vgi`` Protocol/implementation modules through Griffe and assert
the generator emits a description for every member that has one — attributes (whether
documented in their own docstring, the class ``Attributes:`` section, or the
``__init__`` ``Args:`` section), function parameters, returns, and raises.

Run from the vgi-python checkout so ``vgi`` and ``griffe`` are importable::

    cd ~/Development/vgi-python
    uv run --with griffe --with pytest pytest \
        ~/Development/query-farm-astro-docs-wt/scripts/test_api_completeness.py -v

The generator also runs ``audit_completeness`` on every invocation and exits non-zero
if anything is missing, so a plain regeneration is itself a gate; this file makes the
check a first-class test that can be wired into CI.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import griffe
import pytest

# The documented module surface (mirrors scripts/gen-api.sh + the sidebar).
MODULES = [
    "vgi.scalar_function",
    "vgi.table_function",
    "vgi.table_in_out_function",
    "vgi.table_buffering_function",
    "vgi.aggregate_function",
    "vgi.worker",
    "vgi.client",
    "vgi.arguments",
    "vgi.catalog",
    "vgi.function_storage",
    "vgi.metadata",
    "vgi.table_filter_pushdown",
    "vgi.exceptions",
    "vgi.invocation",
]


def _load_generator() -> ModuleType:
    """Import the hyphenated generator script as a module."""
    path = Path(__file__).with_name("gen-api-mdx.py")
    spec = importlib.util.spec_from_file_location("gen_api_mdx", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def gen() -> ModuleType:
    return _load_generator()


@pytest.fixture(scope="module")
def loaded(gen: ModuleType) -> tuple[list[griffe.Module], dict[str, tuple[str, str]]]:
    modules = [griffe.load(name, allow_inspection=True) for name in MODULES]
    index = gen.build_index(modules)
    return modules, index


def test_every_documented_member_is_rendered(
    gen: ModuleType, loaded: tuple[list[griffe.Module], dict[str, tuple[str, str]]]
) -> None:
    """No member with a docstring description may render blank."""
    modules, index = loaded
    problems = gen.audit_completeness(modules, index)
    assert not problems, "Documented but not rendered:\n" + "\n".join(f"  - {p}" for p in problems)


def test_arrow_type_is_rendered(
    gen: ModuleType, loaded: tuple[list[griffe.Module], dict[str, tuple[str, str]]]
) -> None:
    """Regression: Arg.arrow_type is documented only in __init__ Args; it must render."""
    modules, index = loaded
    arguments = next(m for m in modules if m.canonical_path == "vgi.arguments")
    arg_cls = arguments["Arg"]
    descs = gen.class_member_descriptions(arg_cls)
    rendered = "\n".join(gen.render_attribute(arg_cls["arrow_type"], 4, index, descs.get("arrow_type", "")))
    assert "Explicit Arrow type" in rendered


def test_audit_is_independent_of_the_combiner(
    gen: ModuleType, loaded: tuple[list[griffe.Module], dict[str, tuple[str, str]]]
) -> None:
    """Meta-test: the audit derives expectations from raw Griffe sources, so breaking
    the description combiner is *detected* rather than silently agreed with."""
    modules, index = loaded
    original = gen.class_member_descriptions
    try:
        # Drop the __init__ Args fallback -> attributes documented only there go blank.
        gen.class_member_descriptions = lambda cls: gen.docstring_attributes(cls)
        problems = gen.audit_completeness(modules, index)
    finally:
        gen.class_member_descriptions = original
    assert problems, "audit failed to detect a deliberately broken combiner"
