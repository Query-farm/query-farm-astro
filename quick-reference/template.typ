#let ink = rgb("211a12")
#let paper = rgb("f7f3ea")
#let sand = rgb("efe9db")
#let rule = rgb("cfc4ad")
#let gold = rgb("7d5714")
#let sun = rgb("d9a441")
#let green = rgb("45632f")
#let rock = rgb("1a1512")
#let cream = rgb("f4ece0")
#let muted = rgb("5d4632")

#let small(body) = text(size: 7.5pt, fill: muted, body)
#let mono(body, size: 8pt) = text(font: "JetBrains Mono", size: size, body)

#let sheet(extension: "", revision: "", pages: 1, body) = {
  set document(title: extension + " — DuckDB quick reference", author: "Query.Farm", keywords: ("DuckDB", extension, "SQL", "quick reference"))
  set page(paper: "us-letter", margin: (x: 30pt, top: 26pt, bottom: 35pt), fill: paper,
    footer: context {
      line(length: 100%, stroke: .6pt + rule)
      v(5pt)
      grid(columns: (1fr, auto), align: (left, right),
        text(size: 6.7pt, fill: muted)[Query.Farm · DuckDB extensions · #revision],
        text(size: 6.7pt, fill: muted)[#counter(page).display() / #pages],
      )
    },
  )
  set text(font: "Noto Sans", size: 8.6pt, fill: ink)
  set par(leading: 3.2pt, spacing: 6pt)
  set block(spacing: 7pt)
  show raw.where(block: false): it => mono(it.text, size: 7.8pt)
  show link: it => underline(stroke: .35pt, offset: 1.4pt, it)
  body
}

#let masthead(name, slug, subtitle, page-label: "QUICK REFERENCE") = {
  grid(columns: (1fr, auto), align: (left, right + horizon),
    grid(columns: (20pt, auto), gutter: 7pt, align: horizon,
      image("../public/media-kit/logo/mark.svg", width: 20pt),
      text(font: "Petrona", weight: 700, size: 18pt)[Query#text(fill: gold)[.]Farm],
    ),
    text(size: 7.2pt, weight: 600, fill: gold, tracking: .8pt)[DUCKDB / #page-label],
  )
  v(15pt)
  grid(columns: (1fr, 62pt), gutter: 14pt, align: horizon,
    [
      #text(font: "Petrona", size: if name.len() > 22 { 28pt } else { 34pt }, weight: 600, tracking: -.7pt)[#name]
      #v(5pt)
      #text(size: 10pt, fill: muted)[#subtitle]
    ],
    image("assets/" + slug + ".svg", width: 62pt),
  )
  v(8pt)
  line(length: 100%, stroke: 1pt + gold)
  v(8pt)
}

#let section(number, title) = {
  v(2pt)
  grid(columns: (19pt, 1fr), align: horizon,
    text(size: 8pt, weight: 600, fill: gold)[#number],
    text(font: "Petrona", size: 15pt, weight: 600)[#title],
  )
  v(5pt)
}

#let sql(source, size: 7.8pt) = block(width: 100%, fill: rock, radius: 3pt, inset: 9pt, breakable: false)[
  #set text(font: "JetBrains Mono", size: size, fill: cream)
  #set par(leading: 3.2pt, spacing: 0pt)
  #show raw: it => text(font: "JetBrains Mono", size: size, it.text)
  // Keep selectable SQL text; a tiny lexer gives the print palette reliable contrast.
  #let tokens = regex("--[^\n]*|'[^']*'|[A-Za-z_][A-Za-z_0-9]*|[0-9]+(?:\.[0-9]+)?|[^A-Za-z_0-9'-]+|.")
  #let keywords = ("SELECT", "FROM", "AS", "WITH", "MATERIALIZED", "INSTALL", "LOAD", "COPY", "TO", "ORDER", "BY", "CREATE", "TABLE", "WHERE", "AND", "FILTER", "TRUE", "FALSE", "FORMAT", "PARQUET", "ROW_GROUP_SIZE", "BETWEEN", "COUNT", "AVG")
  #let lines = source.trim().split("\n")
  #for (i, row) in lines.enumerate() {
    for match in row.matches(tokens) {
      let token = match.text
      let color = if token.starts-with("--") { rgb("c6b8a2") }
        else if token.starts-with("'") { rgb("aecb84") }
        else if upper(token) in keywords { sun }
        else { cream }
      text(fill: color, raw(token, lang: none))
    }
    if i < lines.len() - 1 { linebreak() }
  }
]

#let installation(slug) = grid(columns: (80pt, 1fr), gutter: 10pt, align: horizon,
  text(weight: 600, size: 8.5pt)[Install & load],
  sql("INSTALL " + slug + " FROM community;\nLOAD " + slug + ";", size: 8pt),
)

#let note(title, body) = block(width: 100%, inset: (left: 9pt, right: 9pt, y: 8pt), fill: sand, stroke: (left: 2pt + gold), breakable: false)[
  #text(weight: 600, size: 8.2pt)[#title]
  #v(3pt)
  #text(size: 8pt)[#body]
]

#let reference-table(headers, rows, widths: (1fr, 1fr), size: 7.7pt) = {
  set text(size: size)
  set par(leading: 2.6pt)
  table(columns: widths, inset: (x: 5pt, y: 5pt), stroke: (top: none, bottom: .4pt + rule, left: none, right: none),
    fill: (x, y) => if y == 0 {sand} else {none},
    table.header(..headers.map(h => text(weight: 600, size: 7.2pt, h))),
    ..rows.flatten(),
  )
}

#let docs(slug, source: none) = {
  v(5pt)
  text(size: 7.3pt, fill: green)[
    #link("https://query.farm/products/extensions/" + slug + "/")[Full docs & examples ↗]
    #h(8pt)
    #link(if source == none { "https://github.com/Query-farm/" + slug } else { source })[Source ↗]
  ]
}
