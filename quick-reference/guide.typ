#import "template.typ": *
#let slug = sys.inputs.at("extension")
#let data = json("content/" + slug + ".json")
#let meta = json("../src/data/extensions/" + slug + "/augment/metadata.json")
#show: sheet.with(extension: data.title, revision: sys.inputs.at("revision"))

#masthead(data.title, slug, data.subtitle)
#installation(slug)
#v(8pt)

#grid(columns: (1fr, 1fr), gutter: 20pt,
  [
    #section("01", "At a glance")
    #text(size: 8.5pt)[#data.intro]
    #v(7pt)
    #grid(columns: (1fr, 11pt, 1fr, 11pt, 1fr), align: horizon,
      ..data.flow.enumerate().map(((i, label)) => (
        block(width: 100%, fill: sand, inset: (x: 5pt, y: 9pt), radius: 2pt,
          align(center, text(size: 7.5pt, weight: 600, fill: gold, label))),
        if i < 2 { align(center, text(fill: gold)[→]) } else {[]},
      )).flatten().slice(0, 5),
    )
    #v(7pt)
    #section("02", data.at("referenceTitle", default: "Core SQL surface"))
    #for entry in data.reference {
      block(breakable: false, below: 6pt, above: 0pt)[
        #mono(entry.name, size: if entry.name.len() > 47 { 7pt } else { 7.6pt })
        #v(2pt)
        #text(size: 8pt)[#entry.description]
        #v(3pt)
        #line(length: 100%, stroke: .4pt + rule)
      ]
    }
    #v(4pt)
    #section("03", "Keep in mind")
    #for item in data.notes.slice(0, 1) {
      note(item.title, item.body)
      v(4pt)
    }
  ],
  [
    #for (i, example) in data.examples.enumerate() {
      section("0" + str(i + 4), example.title)
      if example.mode != "local" {
        text(size: 7.2pt, weight: 600, fill: gold)[
          #if example.mode == "external" { [REQUIRES SETUP] } else { [MANUAL SETUP] }
        ]
        v(3pt)
      }
      sql(example.sql, size: if calc.max(..example.sql.split("\n").map(line => line.len())) > 48 { 7pt } else { 7.5pt })
      text(size: 8pt)[#example.caption]
      v(5pt)
    }
    #if data.notes.len() > 1 {
      section("0" + str(data.examples.len() + 4), "In practice")
      for item in data.notes.slice(1) {
        note(item.title, item.body)
        v(4pt)
      }
    }
    #docs(slug, source: meta.githubUrl)
  ],
)
