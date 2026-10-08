#import "template.typ": *
#let entries = json("directory.json")
#show: sheet.with(extension: "DuckDB extension collection", revision: json("edition.json").date + " · Reference collection")
#masthead("DuckDB extensions", "catalog", "The Query.Farm quick reference collection.", page-label: "REFERENCE COLLECTION")

#text(size: 10pt)[#entries.len() extension guides. One consistent reference.]
#v(5pt)
#text(size: 8.5pt)[Install commands, core APIs, practical SQL and usage notes. Page numbers refer to the combined volume. Each title also links to its standalone PDF.]
#v(12pt)

#grid(columns: (1fr, 1fr), gutter: 24pt,
  ..(entries.slice(0, 16), entries.slice(16)).map(group => [
    #for entry in group {
      block(breakable: false, above: 0pt, below: 10pt)[
        #grid(columns: (1fr, auto), gutter: 8pt,
          link(entry.slug + ".pdf")[#text(font: "Petrona", size: 12pt, weight: 600)[#entry.title]],
          text(size: 9pt, fill: gold, str(entry.page)),
        )
        #v(4pt)
        #line(length: 100%, stroke: .4pt + rule)
      ]
    }
  ]),
)
#v(13pt)
#note("Using this collection", [
  Examples marked “Requires setup” need the service, driver or credentials named in the guide. “Manual setup” marks CLI, driver or process-lifecycle steps. Local examples were executed against the builds recorded in each footer; source-reviewed guides identify compatibility limits.
])
#v(7pt)
#text(size: 8pt, fill: green)[#link("https://query.farm/products/extensions/")[Browse the complete extension catalog ↗]]
