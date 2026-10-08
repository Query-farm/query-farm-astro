#import "template.typ": *
#let examples = json("examples.json").lindel
#show: sheet.with(extension: "Lindel", revision: sys.inputs.at("revision"))

#masthead("Lindel", "lindel", [Many dimensions. One sortable integer.])
#installation("lindel")
#v(8pt)

#grid(columns: (1fr, 1fr), gutter: 20pt,
  [
    #section("01", "The four functions")
    #text(size: 8.3pt)[Encode a fixed-size numeric array into an unsigned integer; decode it with the matching curve.]
    #v(5pt)
    #reference-table(([Function], [Purpose]), (
      (`hilbert_encode(a)`, [Stronger spatial locality]),
      (`morton_encode(a)`, [Bit interleaving / Z-order]),
      (`hilbert_decode(k,n,f,u)`, [Recover Hilbert inputs]),
      (`morton_decode(k,n,f,u)`, [Recover Morton inputs]),
    ), widths: (1.3fr, 1fr), size: 7.6pt)
    #v(5pt)
    #sql(examples.encode)
    #small[Cast explicitly: `UINTEGER[2]` is an ARRAY; an uncast `[10, 20]` is a LIST.]

    #section("02", "Choose your input width")
    #reference-table(([Element type], [Dimensions]), (
      ([`TINYINT` / `UTINYINT`], [1–16]),
      ([`SMALLINT` / `USMALLINT`], [1–8]),
      ([`INTEGER` / `UINTEGER` / `FLOAT`], [1–4]),
      ([`BIGINT` / `UBIGINT` / `DOUBLE`], [1–2]),
    ), widths: (1.9fr, 1fr))
    #v(4pt)
    #text(size: 8pt)[The output uses the smallest unsigned width that fits all component bits:]
    #v(3pt)
    #reference-table(([Input array], [Output]), (
      (`UTINYINT[2]`, `USMALLINT`),
      (`UINTEGER[2]`, `UBIGINT`),
      (`UINTEGER[3]`, `UHUGEINT`),
      (`DOUBLE[2]`, `UHUGEINT`),
    ))
    #v(6pt)
    #note("Prepare meaningful coordinates", [
      For numeric locality across signed or floating values, shift and quantize to nonnegative integers. Direct encoding preserves their bit patterns; it does not normalize numeric distance. Keep precision and units consistent.
    ])
  ],
  [
    #section("03", "Choose a curve")
    #image("assets/curves.svg", width: 100%)
    #grid(columns: (1fr, 1fr), gutter: 12pt,
      [#text(weight: 600, size: 8.3pt)[Hilbert]\
       #text(size: 8pt)[Fewer long jumps; a good starting point for locality.]],
      [#text(weight: 600, size: 8.3pt)[Morton / Z-order]\
       #text(size: 8pt)[Simpler to compute; jumps at quadrant boundaries.]],
    )
    #v(3pt)
    #section("04", "Decode & round-trip")
    #sql(examples.roundtrip)
    #text(size: 8pt)[`n` = dimensions; `f` = return floats; `u` = return unsigned integers. For signed integers use `false, false`; for floats use `true, false`. Preserve the key’s original SQL type. Fixed v1.5 builds support signed 1-D round trips; older 6435106 rejects them.]

    #section("05", "Write a clustered Parquet")
    #sql(examples.parquet, size: 7.5pt)
    #text(size: 8pt)[Read using ordinary predicates on the original columns:]
    #sql(examples.filter, size: 7.5pt)
    #small[The tiny fixture shows syntax. With many row groups, the ordering can improve min/max pruning; benchmark your data and filters. This is a file layout, not an index.]
    #docs("lindel")
  ],
)
