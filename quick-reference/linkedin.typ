#import "template.typ": ink, paper, sand, rule, gold, sun, green, rock, cream, muted, sql
#let deck = json("linkedin.json")
#let total = deck.slides.len()

// 4:5 portrait — LinkedIn renders document posts at 1080 × 1350.
#set document(title: "DuckDB extensions — Query.Farm quick references", author: "Query.Farm",
  keywords: ("DuckDB", "SQL", "extensions", "quick reference"))
#set page(width: 540pt, height: 675pt, margin: (x: 40pt, top: 36pt, bottom: 34pt), fill: paper)
#set text(font: "Noto Sans", size: 15pt, fill: ink)
#set par(leading: 6pt)

#let wordmark(size: 15pt, fill: ink) = grid(columns: (auto, auto), gutter: .45em, align: horizon,
  image("../public/media-kit/logo/mark.svg", height: size * 1.25),
  text(font: "Petrona", weight: 700, size: size, fill: fill)[Query#text(fill: gold)[.]Farm],
)
#let eyebrow(body, fill: gold) = text(size: 10.5pt, weight: 600, fill: fill, tracking: 1.4pt, upper(body))
#let bar = line(length: 100%, stroke: 1.5pt + gold)

// Cover --------------------------------------------------------------------
#page(fill: rock, margin: (x: 44pt, top: 40pt, bottom: 40pt))[
  #set text(fill: cream)
  #grid(columns: (1fr, auto), align: (left + horizon, right + horizon),
    wordmark(size: 16pt, fill: cream), eyebrow("Swipe →", fill: sun))
  #v(40pt)
  #eyebrow("DuckDB / Reference collection", fill: sun)
  #v(10pt)
  #block(par(leading: 8pt, text(font: "Petrona", weight: 600, size: 44pt, tracking: -1pt)[
    #total DuckDB extensions.\
    #text(fill: sun)[One page each.]
  ]))
  #v(14pt)
  #text(size: 17pt, fill: rgb("d8ccb8"))[What each extension is for, and a real query that shows it working.]
  #v(1fr)
  #grid(columns: (1fr,) * 8, gutter: 8pt,
    ..deck.slides.map(s => image("assets/" + s.slug + ".svg", width: 100%)))
  #v(6pt)
]

// Contents -----------------------------------------------------------------
#page[
  #eyebrow("What's inside")
  #v(6pt)
  #text(font: "Petrona", weight: 600, size: 34pt, tracking: -.6pt)[Six kinds of extension]
  #v(4pt)
  #bar
  #v(14pt)
  #for (n, group) in deck.groups.filter(g => g.items.len() > 0).enumerate() {
    if n > 0 { line(length: 100%, stroke: .5pt + rule) }
    block(breakable: false, above: 9pt, below: 9pt,
      grid(columns: (112pt, 1fr), gutter: 8pt,
        [
          #text(font: "Petrona", weight: 600, size: 16pt)[#group.label]
          #v(-2pt)
          #text(size: 11pt, weight: 600, fill: gold)[#group.items.len()]
        ],
        grid(columns: (1fr,) * 3, column-gutter: 8pt, row-gutter: 6pt,
          ..group.items.map(item => grid(columns: (21pt, 1fr), gutter: 6pt, align: horizon,
            image("assets/" + item.slug + ".svg", width: 21pt),
            text(size: 11pt, item.title),
          ))),
      ))
  }
]

// One slide per extension ----------------------------------------------------
#for (i, s) in deck.slides.enumerate() {
  page(footer: context {
    line(length: 100%, stroke: .8pt + rule)
    v(7pt)
    grid(columns: (1fr, auto), align: (left, right),
      text(size: 11pt, fill: green)[query.farm/products/extensions/#s.slug],
      text(size: 11pt, fill: muted)[#(i + 1) / #total],
    )
  }, footer-descent: 12pt, margin: (x: 40pt, top: 36pt, bottom: 58pt))[
    #grid(columns: (1fr, auto), align: (left + horizon, right + horizon),
      wordmark(size: 13pt), eyebrow(s.categoryLabel))
    #v(14pt)
    #grid(columns: (1fr, 74pt), gutter: 16pt, align: horizon,
      [
        #text(font: "Petrona", weight: 600, size: if s.title.len() > 14 { 36pt } else { 44pt }, tracking: -.8pt)[#s.title]
        #v(2pt)
        #text(size: 16pt, fill: muted)[#s.subtitle]
      ],
      image("assets/" + s.slug + ".svg", width: 74pt),
    )
    #v(12pt)
    #bar
    #v(14pt)
    #grid(columns: (1fr, 16pt, 1fr, 16pt, 1fr), align: horizon,
      ..s.flow.enumerate().map(((j, label)) => (
        block(width: 100%, height: 46pt, fill: sand, radius: 3pt, inset: (x: 6pt),
          align(center + horizon, text(size: 12pt, weight: 600, fill: gold, label))),
        if j < 2 { align(center, text(size: 14pt, fill: gold)[→]) } else { [] },
      )).flatten().slice(0, 5),
    )
    #v(16pt)
    #text(size: 13.5pt)[#s.intro]
    #v(14pt)
    #v(1fr)
    #grid(columns: (1fr, auto), align: (left + bottom, right + bottom),
      text(font: "Petrona", weight: 600, size: 19pt)[#s.exampleTitle],
      if s.setup { text(size: 9.5pt, weight: 600, fill: gold, tracking: .8pt)[REQUIRES SETUP] },
    )
    #v(4pt)
    // template.typ's code block has print-sized padding; pad it out on the same fill.
    #block(width: 100%, fill: rock, radius: 5pt, inset: 7pt,
      sql(s.sql, size: if s.sql.split("\n").len() > 9 { 11.5pt } else { 13pt }))
    #v(10pt)
    #v(1fr)
    #text(font: "JetBrains Mono", size: 11.5pt, fill: muted)[INSTALL #s.slug FROM community; LOAD #(s.slug);]
  ]
}

// Closing ------------------------------------------------------------------
#page(fill: rock, margin: (x: 44pt, top: 40pt, bottom: 40pt))[
  #set text(fill: cream)
  #wordmark(size: 16pt, fill: cream)
  #v(1fr)
  #eyebrow("Keep the full set", fill: sun)
  #v(10pt)
  #text(font: "Petrona", weight: 600, size: 42pt, tracking: -.8pt)[Printable reference sheets for every extension.]
  #v(18pt)
  #text(size: 17pt, fill: rgb("d8ccb8"))[Function signatures, setup notes and tested examples. Each extension page also runs its examples live in your browser.]
  #v(28pt)
  #block(width: 100%, fill: rgb("2a221c"), radius: 5pt, inset: 18pt)[
    #text(size: 19pt, weight: 600, fill: sun)[query.farm/products/extensions]
  ]
  #v(1fr)
  #text(size: 12pt, fill: rgb("c6b8a2"))[Open source · Installs with one line from the DuckDB community repository]
]
