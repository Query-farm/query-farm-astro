// Command gen-api-go renders the vgi-go API reference as Starlight MDX.
//
// It is the Go counterpart of scripts/gen-api-mdx.py (Griffe -> MDX for
// vgi-python) and deliberately emits the same markup: the same `api-*` CSS
// classes, the same kind icons and kind words, the same anchor-per-symbol
// scheme. Both languages therefore render identically and share every stylesheet
// in src/styles/starlight-api.css.
//
// Two things differ from the Python side, both forced by the language:
//
//   - Python splits pages by module. Go's SDK is ONE package (`vgi`) with ~600
//     exported symbols, so pages are grouped by topic instead — see `groups`
//     below. The grouping is curated rather than derived because the natural
//     unit (a source file) is too fine: 70 files would mean 70 pages.
//   - Go has no docstring sections, so parameter/return prose is whatever the
//     doc comment says. There is nothing to segment into Attributes/Methods
//     beyond what go/doc already separates.
//
// Usage:
//
//	go run ./scripts/gen-api-go <out-dir> [-src <vgi-go checkout>]
package main

import (
	"flag"
	"fmt"
	"go/ast"
	"go/doc"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const (
	repoURL   = "https://github.com/Query-farm/vgi-go"
	urlPrefix = "/vgi/docs/go/api/"
)

// group is one output page: a title, a slug, and the source files whose
// exported symbols land on it.
type group struct {
	Slug  string
	Title string
	Blurb string
	Files []string
}

// Pages, in sidebar order. Every non-test .go file in vgi/ must appear in
// exactly one group — `audit` fails the run otherwise, so a new file cannot be
// silently dropped from the reference.
var groups = []group{
	{"scalar", "Scalar functions", "One row in, one value out — the per-row transform.",
		[]string{"scalar.go", "scalar_dispatch.go", "scalar_helpers.go", "scalar_map.go", "scalar_numeric.go", "scalar_typed.go"}},
	{"table", "Table functions", "Row generators: arguments in, a whole relation out.",
		[]string{"table.go", "table_generate.go", "table_helpers.go", "table_typed.go", "cardinality.go"}},
	{"table-in-out", "Table-in-out functions", "Stream a relation through, batch by batch.",
		[]string{"table_in_out.go", "table_in_out_typed.go"}},
	{"table-buffering", "Buffering functions", "Sink every row, combine, then stream the result back.",
		[]string{"table_buffering.go", "table_buffering_rpc.go"}},
	{"aggregate", "Aggregate functions", "Per-group accumulation — update, combine, finalize — via the AggregateFunction interface.",
		[]string{"aggregate.go", "aggregate_helpers.go", "aggregate_protocol.go", "aggregate_storage.go", "aggregate_streaming.go"}},
	{"copy", "COPY formats", "Custom COPY ... FROM readers and COPY ... TO writers.",
		[]string{"copy_from.go", "copy_from_info.go", "copy_to.go"}},
	{"worker", "Worker & serving", "Registering functions and running a worker over each transport.",
		[]string{"worker.go", "landing.go", "init.go", "init_recipe.go", "gob_init.go", "rehydrate.go", "process.go"}},
	{"catalog", "Catalogs", "Exposing schemas, tables, and views to ATTACH.",
		[]string{"catalog.go", "catalog_info.go", "catalog_macro_info.go", "catalog_table.go", "catalog_table_info.go", "catalog_types.go", "catalog_view_info.go", "attach_catalog_info.go", "attach_option.go", "column_statistics.go", "writable_catalog.go", "writable_functions.go", "writable_handlers.go", "writable_storage.go"}},
	{"arguments", "Arguments", "Declaring, deriving, and binding function arguments.",
		[]string{"arguments.go", "argument_constraints.go", "typed_args.go", "overload.go", "bind.go", "dynamic_to_string.go"}},
	{"cache-control", "Cache control", "Advertising a result as reusable by the client, via the CacheControl struct.",
		[]string{"cache_control.go"}},
	{"filter-pushdown", "Filter pushdown", "Receiving and evaluating pushed-down WHERE predicates.",
		[]string{"filter_pushdown.go", "filter_helpers.go", "filter_helpers_typed.go", "expression_filter.go"}},
	{"storage", "State storage", "Cross-process state: the store, its backends, and state codecs.",
		[]string{"storage.go", "function_storage.go", "function_storage_sqlite.go", "state_serialize.go", "shardkey.go"}},
	{"arrow", "Arrow helpers", "Building and emitting Arrow batches.",
		[]string{"batch_builder.go", "batch_emit.go", "schema_utils.go"}},
	{"protocol", "Protocol & metadata", "Function metadata and the on-the-wire request/response types.",
		[]string{"function.go", "protocol.go", "secrets.go", "crypto.go"}},
	{"observability", "Errors & logging", "Error types and the named structured loggers.",
		[]string{"errors.go", "logging.go"}},
}

// Wire structs are the generated request/response envelopes. They are exported
// because the codec needs them across packages, not because a worker author
// should ever construct one — documenting all 87 would bury the real API.
var wireRE = regexp.MustCompile(`Wire$`)

func main() {
	src := flag.String("src", os.Getenv("HOME")+"/Development/vgi-go", "vgi-go checkout")
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gen-api-go [-src DIR] <out-dir>")
		os.Exit(2)
	}
	outDir := flag.Arg(0)

	pkgDir := filepath.Join(*src, "vgi")
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, pkgDir, func(fi os.FileInfo) bool {
		return !strings.HasSuffix(fi.Name(), "_test.go")
	}, parser.ParseComments)
	must(err)
	astPkg, ok := pkgs["vgi"]
	if !ok {
		fatal("package vgi not found in %s", pkgDir)
	}
	d := doc.New(astPkg, "github.com/Query-farm/vgi-go/vgi", doc.AllDecls)

	if err := audit(pkgDir); err != nil {
		fatal("%v", err)
	}

	// file -> group slug
	fileGroup := map[string]string{}
	for _, g := range groups {
		for _, f := range g.Files {
			fileGroup[f] = g.Slug
		}
	}
	// symbol -> page anchor, for cross-linking [Name] doc references.
	index := map[string]string{}
	for _, t := range d.Types {
		slug := placeType(fset, t, fileGroup)
		if slug == "" {
			continue
		}
		index[t.Name] = urlPrefix + slug + "/#" + t.Name
		// Methods too, so a doc link written as [Worker.RunStdio] lands on the
		// method rather than the top of the type.
		for _, m := range append(append([]*doc.Func{}, t.Methods...), t.Funcs...) {
			index[t.Name+"."+m.Name] = urlPrefix + slug + "/#" + t.Name + "." + m.Name
		}
	}
	for _, f := range d.Funcs {
		if slug := fileOf(fset, f.Decl.Pos(), fileGroup); slug != "" {
			index[f.Name] = urlPrefix + slug + "/#" + f.Name
		}
	}

	// The package doc comment (vgi/doc.go) is the best orientation prose in the
	// SDK and carries most of its [Symbol] cross-references, so it gets its own
	// overview page rather than being dropped with the rest of doc.go.
	writeOverview(outDir, d, index)

	total, skipped := 0, 0
	for _, g := range groups {
		var b strings.Builder
		writeFrontmatter(&b, g)

		types := filterTypes(d.Types, fset, g, &skipped)
		funcs := filterFuncs(d.Funcs, fset, g)
		for _, t := range types {
			renderType(&b, fset, t, index)
			total++
		}
		for _, f := range funcs {
			renderFunc(&b, fset, f, index, 2)
			total++
		}
		path := filepath.Join(outDir, "vgi", "docs", "go", "api", g.Slug+".mdx")
		must(os.MkdirAll(filepath.Dir(path), 0o755))
		must(os.WriteFile(path, []byte(b.String()), 0o644))
	}
	fmt.Printf("wrote %d pages to %s\n", len(groups), outDir)
	fmt.Printf("documented %d symbols; skipped %d *Wire protocol structs\n", total, skipped)
	fmt.Printf("indexed %d symbols for cross-linking\n", len(index))

	if missing := completeness(d, fset, fileGroup); len(missing) > 0 {
		fmt.Fprintf(os.Stderr, "completeness audit FAILED — %d documented symbols render nowhere:\n", len(missing))
		for _, m := range missing {
			fmt.Fprintf(os.Stderr, "  %s\n", m)
		}
		os.Exit(1)
	}
	fmt.Println("completeness audit: OK (every documented exported symbol renders on a page)")
}

// audit fails if a source file is in no group, so adding a file to vgi-go
// forces a decision here rather than silently vanishing from the reference.
func audit(pkgDir string) error {
	entries, err := os.ReadDir(pkgDir)
	if err != nil {
		return err
	}
	known := map[string]bool{}
	for _, g := range groups {
		for _, f := range g.Files {
			known[f] = true
		}
	}
	// Files with no exported API of their own; listing them keeps the audit honest.
	for _, f := range []string{"doc.go"} {
		known[f] = true
	}
	var orphans []string
	for _, e := range entries {
		n := e.Name()
		if !strings.HasSuffix(n, ".go") || strings.HasSuffix(n, "_test.go") {
			continue
		}
		if !known[n] {
			orphans = append(orphans, n)
		}
	}
	if len(orphans) > 0 {
		return fmt.Errorf("these vgi/*.go files belong to no group in gen-api-go/main.go: %s",
			strings.Join(orphans, ", "))
	}
	return nil
}

func completeness(d *doc.Package, fset *token.FileSet, fileGroup map[string]string) []string {
	var missing []string
	for _, t := range d.Types {
		if wireRE.MatchString(t.Name) || !ast.IsExported(t.Name) {
			continue
		}
		if placeType(fset, t, fileGroup) == "" {
			missing = append(missing, "type "+t.Name)
		}
	}
	for _, f := range d.Funcs {
		if !ast.IsExported(f.Name) {
			continue
		}
		if fileOf(fset, f.Decl.Pos(), fileGroup) == "" {
			missing = append(missing, "func "+f.Name)
		}
	}
	sort.Strings(missing)
	return missing
}

func placeType(fset *token.FileSet, t *doc.Type, fileGroup map[string]string) string {
	if wireRE.MatchString(t.Name) {
		return ""
	}
	return fileOf(fset, t.Decl.Pos(), fileGroup)
}

func fileOf(fset *token.FileSet, pos token.Pos, fileGroup map[string]string) string {
	return fileGroup[filepath.Base(fset.Position(pos).Filename)]
}

func filterTypes(all []*doc.Type, fset *token.FileSet, g group, skipped *int) []*doc.Type {
	var out []*doc.Type
	for _, t := range all {
		if !inGroup(fset, t.Decl.Pos(), g) {
			continue
		}
		if wireRE.MatchString(t.Name) {
			*skipped++
			continue
		}
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func filterFuncs(all []*doc.Func, fset *token.FileSet, g group) []*doc.Func {
	var out []*doc.Func
	for _, f := range all {
		if inGroup(fset, f.Decl.Pos(), g) {
			out = append(out, f)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func inGroup(fset *token.FileSet, pos token.Pos, g group) bool {
	base := filepath.Base(fset.Position(pos).Filename)
	for _, f := range g.Files {
		if f == base {
			return true
		}
	}
	return false
}

// yamlStr renders a value as a double-quoted YAML scalar, so colons, hashes and
// leading indicators inside it stay data rather than syntax.
func yamlStr(s string) string {
	return `"` + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`) + `"`
}

func writeOverview(outDir string, d *doc.Package, index map[string]string) {
	var b strings.Builder
	fmt.Fprintf(&b, "---\ntitle: %s\ndescription: %s\n---\n", yamlStr("Package vgi"),
		yamlStr("Overview of the vgi-go package: function shapes, declarative arguments, logging, and errors."))
	fmt.Fprintf(&b, "import { Code } from '@astrojs/starlight/components';\n\n")
	fmt.Fprintf(&b, "<div class=\"api-module-doc\">\n\n<p class=\"api-module-doc__label\">Package overview</p>\n\n%s\n\n</div>\n\n",
		renderDoc(strings.TrimSpace(d.Doc), index))

	fmt.Fprintf(&b, "## Reference pages\n\n<table>\n<thead>\n<tr><th>Page</th><th>Covers</th></tr>\n</thead>\n<tbody>\n")
	for _, g := range groups {
		fmt.Fprintf(&b, "<tr><td><a href=%q>%s</a></td><td>%s</td></tr>\n",
			urlPrefix+g.Slug+"/", htmlEscape(g.Title), htmlEscape(g.Blurb))
	}
	fmt.Fprintf(&b, "</tbody>\n</table>\n")

	path := filepath.Join(outDir, "vgi", "docs", "go", "api", "index.mdx")
	must(os.MkdirAll(filepath.Dir(path), 0o755))
	must(os.WriteFile(path, []byte(b.String()), 0o644))
}

func writeFrontmatter(b *strings.Builder, g group) {
	// Both quoted: a blurb like "Per-group accumulation: update, combine" is a
	// YAML mapping otherwise, and the frontmatter parse fails at build time.
	fmt.Fprintf(b, "---\ntitle: %s\ndescription: %s\n---\n", yamlStr(g.Title), yamlStr(g.Blurb))
	fmt.Fprintf(b, "import { Code } from '@astrojs/starlight/components';\n\n")
	fmt.Fprintf(b, "<div class=\"api-module-doc\">\n\n<p class=\"api-module-doc__label\">On this page</p>\n\n%s\n\n</div>\n\n", g.Blurb)
}

func renderType(b *strings.Builder, fset *token.FileSet, t *doc.Type, index map[string]string) {
	kind := "class"
	if isInterface(t) {
		kind = "class"
	}
	fmt.Fprintf(b, "<div class=\"api-class\">\n\n")
	fmt.Fprintf(b, "<a id=%q></a>\n", t.Name)
	fmt.Fprintf(b, "## <span class=\"api-icon api-icon--%s\"></span><span class=\"api-kind-tag api-kind-tag--%s\">%s</span> `%s`\n\n",
		kind, kind, goKind(t), t.Name)
	writeSource(b, fset, t.Decl.Pos())
	writeSig(b, declString(fset, t.Decl))

	if doc := strings.TrimSpace(t.Doc); doc != "" {
		fmt.Fprintf(b, "<p class=\"api-section\">Description</p>\n\n%s\n\n", renderDoc(doc, index))
	}
	if len(t.Methods) > 0 || len(t.Funcs) > 0 {
		fmt.Fprintf(b, "<p class=\"api-section\">Methods</p>\n\n<div class=\"api-members\">\n\n")
		ms := append([]*doc.Func{}, t.Funcs...)
		ms = append(ms, t.Methods...)
		sort.Slice(ms, func(i, j int) bool { return ms[i].Name < ms[j].Name })
		for _, m := range ms {
			renderFunc(b, fset, m, index, 4)
		}
		fmt.Fprintf(b, "</div>\n\n")
	}
	fmt.Fprintf(b, "</div>\n\n")
}

func renderFunc(b *strings.Builder, fset *token.FileSet, f *doc.Func, index map[string]string, level int) {
	kind, hashes := "function", strings.Repeat("#", level)
	if f.Recv != "" {
		kind = "method"
	}
	fmt.Fprintf(b, "<div class=\"api-member\">\n\n")
	anchor := f.Name
	if f.Recv != "" {
		anchor = strings.TrimPrefix(f.Recv, "*") + "." + f.Name
	}
	fmt.Fprintf(b, "<a id=%q></a>\n", anchor)
	fmt.Fprintf(b, "%s <span class=\"api-icon api-icon--%s\"></span><span class=\"api-kind-tag api-kind-tag--%s\">%s</span> `%s`\n\n",
		hashes, kind, kind, kind, f.Name)
	writeSource(b, fset, f.Decl.Pos())
	writeSig(b, declString(fset, f.Decl))
	if d := strings.TrimSpace(f.Doc); d != "" {
		fmt.Fprintf(b, "%s\n\n", renderDoc(d, index))
	}
	fmt.Fprintf(b, "</div>\n")
}

// writeSig renders a declaration's signature. A one-liner (most funcs) gets the
// same `<pre class="api-sig">` slab the Python pages use, so the two languages
// look alike. A multi-line one (every struct and interface) has to go through
// Starlight's <Code> instead: raw HTML in MDX may not contain a blank line, and
// a Go struct body routinely does. It gains syntax highlighting as a bonus.
func writeSig(b *strings.Builder, sig string) {
	if strings.Contains(sig, "\n") {
		fmt.Fprintf(b, "<Code lang=\"go\" code={`%s`} />\n\n", backtickSafe(sig))
		return
	}
	fmt.Fprintf(b, "<pre class=\"api-sig\"><code>%s</code></pre>\n\n", htmlEscape(sig))
}

func writeSource(b *strings.Builder, fset *token.FileSet, pos token.Pos) {
	p := fset.Position(pos)
	fmt.Fprintf(b, "<a class=\"api-source\" href=\"%s/blob/main/vgi/%s#L%d\" target=\"_blank\" rel=\"noopener\">source</a>\n\n",
		repoURL, filepath.Base(p.Filename), p.Line)
}

func goKind(t *doc.Type) string {
	if isInterface(t) {
		return "interface"
	}
	if ts, ok := firstTypeSpec(t); ok {
		switch ts.Type.(type) {
		case *ast.StructType:
			return "struct"
		case *ast.FuncType:
			return "func type"
		}
	}
	return "type"
}

func isInterface(t *doc.Type) bool {
	ts, ok := firstTypeSpec(t)
	if !ok {
		return false
	}
	_, is := ts.Type.(*ast.InterfaceType)
	return is
}

func firstTypeSpec(t *doc.Type) (*ast.TypeSpec, bool) {
	for _, s := range t.Decl.Specs {
		if ts, ok := s.(*ast.TypeSpec); ok {
			return ts, true
		}
	}
	return nil, false
}

// declString renders a declaration's signature only — the body and any doc
// comment are dropped, and a struct/interface keeps its field list so the page
// shows what the type actually contains.
func declString(fset *token.FileSet, decl ast.Node) string {
	var b strings.Builder
	switch d := decl.(type) {
	case *ast.FuncDecl:
		clean := *d
		clean.Body = nil
		clean.Doc = nil
		_ = printer.Fprint(&b, fset, &clean)
	case *ast.GenDecl:
		clean := *d
		clean.Doc = nil
		_ = printer.Fprint(&b, fset, &clean)
	default:
		_ = printer.Fprint(&b, fset, decl)
	}
	return strings.TrimSpace(b.String())
}

// godocRef matches godoc's [Symbol] cross-reference syntax.
var godocRef = regexp.MustCompile(`\[([A-Z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)?)\]`)

// renderDoc converts a Go doc comment to MDX: indented blocks become <Code>,
// [Symbol] references become links, and the rest is escaped for MDX safety.
func renderDoc(s string, index map[string]string) string {
	lines := strings.Split(s, "\n")
	var out []string
	var code []string
	flush := func() {
		if len(code) == 0 {
			return
		}
		body := strings.Join(code, "\n")
		out = append(out, fmt.Sprintf("<Code lang=\"go\" code={`%s`} />\n", backtickSafe(body)))
		code = nil
	}
	for _, ln := range lines {
		switch {
		case strings.HasPrefix(ln, "\t") || strings.HasPrefix(ln, "    "):
			code = append(code, strings.TrimPrefix(strings.TrimPrefix(ln, "\t"), "    "))
		case strings.TrimSpace(ln) == "" && len(code) > 0:
			code = append(code, "")
		default:
			flush()
			// "# Heading" in a Go doc comment is a section header.
			if h := strings.TrimSpace(ln); strings.HasPrefix(h, "# ") {
				out = append(out, "**"+mdEscape(strings.TrimPrefix(h, "# "))+"**\n")
				continue
			}
			out = append(out, linkRefs(mdEscape(ln), index))
		}
	}
	flush()
	return strings.TrimSpace(strings.Join(out, "\n"))
}

// linkRefs turns godoc's [Symbol] doc links into MDX links.
//
// Only names that actually resolve are touched. Go uses the same brackets for
// generic type parameters, so `TypedScalarFunc[A]` in a doc comment is a
// signature, not a reference — rewriting it would corrupt the very thing the
// sentence is describing. Anything unresolved is left exactly as written.
func linkRefs(s string, index map[string]string) string {
	return godocRef.ReplaceAllStringFunc(s, func(m string) string {
		name := strings.Trim(m, "[]")
		if href, ok := index[name]; ok { // exact: Type.Method or a bare name
			return fmt.Sprintf("[`%s`](%s)", name, href)
		}
		if base := strings.SplitN(name, ".", 2)[0]; base != name {
			if href, ok := index[base]; ok { // method we do not render; link the type
				return fmt.Sprintf("[`%s`](%s)", name, href)
			}
		}
		return m
	})
}

// mdEscape neutralises the characters MDX would treat as JSX. Angle brackets in
// prose (Go generics, "<nil>") and braces are the two that actually bite.
//
// Inline code spans are left alone. Markdown already makes their contents
// literal, so escaping there is not merely unnecessary — it is wrong: the
// entity survives into the rendered <code> and the reader sees
// "struct&#123;&#125;" where the doc comment said "struct{}".
func mdEscape(s string) string {
	var b strings.Builder
	for {
		open := strings.IndexByte(s, '`')
		if open < 0 {
			b.WriteString(escapeJSX(s))
			return b.String()
		}
		closeIdx := strings.IndexByte(s[open+1:], '`')
		if closeIdx < 0 { // unbalanced backtick: treat the rest as prose
			b.WriteString(escapeJSX(s))
			return b.String()
		}
		b.WriteString(escapeJSX(s[:open]))
		b.WriteString(s[open : open+1+closeIdx+1]) // the span, verbatim
		s = s[open+1+closeIdx+1:]
	}
}

func escapeJSX(s string) string {
	s = strings.ReplaceAll(s, "{", "&#123;")
	s = strings.ReplaceAll(s, "}", "&#125;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

// htmlEscape prepares text for a raw-HTML block inside MDX. Braces matter as
// much as angle brackets here: MDX reads `{` inside JSX as the start of an
// expression, and every Go struct signature contains one.
func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "{", "&#123;")
	s = strings.ReplaceAll(s, "}", "&#125;")
	return s
}

// backtickSafe keeps a doc-comment code block from closing the MDX template
// literal it is embedded in.
func backtickSafe(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "`", "\\`")
	s = strings.ReplaceAll(s, "${", "\\${")
	return s
}

func must(err error) {
	if err != nil {
		fatal("%v", err)
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "gen-api-go: "+format+"\n", args...)
	os.Exit(1)
}
