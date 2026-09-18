---
title: "A SQL WHERE Clause for Taste"
description: "I pointed DuckDB at Hacker News and at Jev, TypeSafe's decision model, and asked it to score 500 stories against one sentence about what I like. It took 17 seconds and cost less than a penny."
pubDate: 2026-09-18
author: "Rusty Conover"
tags: ["DuckDB", "VGI", "SQL", "TypeSafe", "Jev"]
heroImage: "/media/posts/a-where-clause-for-taste/social.png"
leadVisual:
  src: "/blog/a-where-clause-for-taste/taste-bezier-lead.svg"
  alt: ""
  width: 720
  height: 156
---

Hacker News gives out its 500 newest submissions from one API endpoint. Most of them are not for me. Which ones *are* depends entirely on who I am, and I can't write that down as a `LIKE` pattern.

So I wrote it down as a sentence, and put the sentence in the query.

## The whole program

```sql
ATTACH 'typesafe' (TYPE vgi,
  LOCATION 'uvx --from git+https://github.com/Query-farm/vgi-typesafe vgi-typesafe');

ATTACH 'hackernews' (TYPE vgi,
  LOCATION 'uvx --from git+https://github.com/Query-farm/vgi-hackernews vgi-hackernews');

CREATE SECRET (TYPE typesafe, api_key 'ts-...');

SELECT title, url, interesting.noul
FROM
  (SELECT title, url FROM hackernews.new_stories LIMIT 500) hn_stories,
  typesafe.ask(hn_stories,
    questions => {
      'interesting': {
          'type': 'noul',
          'instructions': 'Is this story interesting to someone who in data and databases
                          (i.e. DuckDB) but also appreciates distributed systems, python,
                          apache arrow'
          }
        }
    )
WHERE interesting.noul > 0.50
ORDER BY interesting.noul DESC
LIMIT 20;
```

That's it. Two `ATTACH` statements, a secret, one query.

<div class="query-result" role="region" aria-label="Result: the twenty highest-scoring Hacker News stories" tabindex="0">
  <div class="query-result__label">result · top 20 of 500 · observed 18 September 2026</div>
  <table>
    <thead><tr><th>title</th><th>noul</th></tr></thead>
    <tbody>
      <tr><td><a href="https://www.parseable.com/blog/how-parseable-handles-100-million-time-series">Handling 100M time series with Arrow, Parquet, and object storage</a></td><td>0.88</td></tr>
      <tr><td><a href="https://zimzi.substack.com/p/clickhouse-permission-system-has">ClickHouse permission system has a trivial bypass</a></td><td>0.80</td></tr>
      <tr><td><a href="https://medium.com/scalar-engineering/no-more-free-lunch-for-consistency-across-microservices-74662331813e">No More Free Lunch for Consistency Across Microservices</a></td><td>0.78</td></tr>
      <tr><td><a href="https://github.com/clarkzjw/IMC26-Starlink-Aviation">Measuring Starlink Aviation Around the World</a></td><td>0.77</td></tr>
      <tr><td><a href="https://arxiv.org/abs/2608.15994">Building an Integrated Vector Database System in PostgreSQL</a></td><td>0.76</td></tr>
      <tr><td><a href="https://github.com/rrrlasse/memlz">World's fastest compression library just doubled its speed</a></td><td>0.76</td></tr>
      <tr><td><a href="https://github.com/orangecoding/fredy">Fredy: Letting an LLM create a search without letting it invent the data</a></td><td>0.75</td></tr>
      <tr><td><a href="https://www.snowflake.com/en/blog/engineering/postgresql-19-release-delay-feature-reverts/">What Is Happening with PostgreSQL 19?</a></td><td>0.75</td></tr>
      <tr><td><a href="https://planetscale.com/blog/introducing-tin">Tin: full-text search for Postgres</a></td><td>0.74</td></tr>
      <tr><td><a href="https://techcrunch.com/2026/09/17/un-turns-to-google-to-make-its-global-data-ready-for-ai-agents/">UN turns to Google to make its global data ready for AI agents</a></td><td>0.73</td></tr>
      <tr><td><a href="https://e360.yale.edu/features/germany-us-climate-data">Why Germany Is Building an Ark for U.S. Climate Data</a></td><td>0.73</td></tr>
      <tr><td><a href="https://www.cncf.io/blog/2026/09/17/opentelemetry-everywhere-migrating-a-metrics-platform-at-scale/">OpenTelemetry everywhere: Migrating a metrics platform at scale</a></td><td>0.71</td></tr>
      <tr><td><a href="https://arstechnica.com/gadgets/2026/09/iran-strikes-on-amazon-data-centers-caused-permanent-loss-of-customer-data/">Iran strikes on Amazon data centers caused permanent loss of customer data</a></td><td>0.70</td></tr>
      <tr><td><a href="https://theconsensus.dev/p/2026/09/13/query-plan-rewriting-in-postgresql.html">Query Plan Rewriting in PostgreSQL</a></td><td>0.70</td></tr>
      <tr><td><a href="https://www.netnod.se/blog/telstra-outage-night-network-decided-year-was-2006">Telstra outage: The night a network decided the year was 2006</a></td><td>0.70</td></tr>
      <tr><td><a href="https://www.tigrisdata.com/blog/objgit-packfiles/">You can run Git on object storage if you re-make packfiles</a></td><td>0.70</td></tr>
      <tr><td><a href="https://arxiv.org/abs/2605.19407">A Bitter Lesson for Data Filtering</a></td><td>0.69</td></tr>
      <tr><td><a href="https://lwn.net/Articles/1090385/">A Pause for the Python JIT</a></td><td>0.69</td></tr>
      <tr><td><a href="https://ossie.apache.org/">Apache Ossie – (incubating) universal standard for semantic data</a></td><td>0.68</td></tr>
      <tr><td><a href="https://scry.io/">Show HN: Scry, programmable internet search w/ congestion pricing</a></td><td>0.68</td></tr>
    </tbody>
  </table>
</div>

I'd read most of that. And look at the instructions again — there's a verb missing in the first line, a stray "i.e.", and no capital letters worth speaking of. I typed it once and never went back. Prompt engineering did not enter into it.

## There is no install step

`LOCATION` is a command, not a URL. DuckDB runs it. [uv](https://docs.astral.sh/uv/) fetches the worker from GitHub, builds it into an environment, and starts talking [VGI](/vgi/) to it over stdio. Second run, it's already built.

<figure>
  <img src="/blog/a-where-clause-for-taste/query-flow.svg" alt="DuckDB on one machine spawns two VGI workers as subprocesses and exchanges Apache Arrow batches with them over stdio. The Hacker News worker calls the public Hacker News API, returning 500 stories in 1.8 seconds. The TypeSafe worker makes 500 HTTPS requests, eight at a time, to the TypeSafe API running jev-1.13.0, taking about 16 seconds and costing $0.007." loading="lazy" width="760" height="380" />
  <figcaption>Two <code>ATTACH</code> statements build all of this. The workers are subprocesses, not services.</figcaption>
</figure>

This is why a two-worker query is worth typing at all. No service to stand up, no container, nothing left running when the query ends — [`vgi-hackernews`](https://github.com/Query-farm/vgi-hackernews) and [`vgi-typesafe`](https://github.com/Query-farm/vgi-typesafe) are subprocesses that speak Arrow, and they exit with the query.

Let's be honest about "nothing installed", though, because it isn't quite true. You never run an install command, but uv keeps everything it builds — `uv cache dir` will tell you where, and if you have been using uv for a while that directory is not nothing. What you get for it is a warm start of under a second. `uv cache clean` is the uninstaller.

I ran this in [`haybarn-cli`](/products/haybarn/) (`uvx haybarn-cli`), which autoloads the `vgi` extension when you `ATTACH`. In the DuckDB CLI, install it yourself first:

```sql
INSTALL vgi FROM community;
LOAD vgi;
```

## Hang on, what's Jev?

<p>
  <img src="/blog/a-where-clause-for-taste/typesafe-ai-logo.png" alt="TypeSafe AI" width="300" height="72" loading="lazy" />
</p>

Fair question, since it shipped about a week ago. [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) is [TypeSafe AI](https://typesafe.ai/)'s first **System One** model, and it is not a chatbot. It doesn't write. It can't write. There is no prose in it anywhere.

Their framing is the [Kahneman](https://en.wikipedia.org/wiki/Thinking,_Fast_and_Slow) one. System Two is the deliberate, slow, show-your-working reasoning that frontier LLMs do so well. System One is the fast judgement you make before you've finished reading the sentence. Jev only does the second kind, and gives up text generation entirely to do it. TypeSafe's own summary: *"Think of Jev as a frontier-intelligence function call: unstructured state in, typed probabilistic decisions out."*

You hand it some state and a typed question. It hands back a typed answer with a probability attached. Nothing in between.

<figure>
  <img src="/blog/a-where-clause-for-taste/what-jev-does.svg" alt="Left column, System Two: a prompt asking for JSON only, then tokens generated one at a time, then a code-fenced JSON block followed by a chatty sign-off, then a stage that strips the fence, parses, validates, and retries when the model apologises instead. Right column, System One: state plus a typed noul question whose answers are enumerated before the model runs, one parallel pass taking 70 to 500 milliseconds, and the number 0.88 returned directly as a DOUBLE, ready for a WHERE clause." loading="lazy" width="760" height="360" />
  <figcaption>The left column is what "just give me JSON" actually costs you. The right column is why <code>interesting.noul</code> is already a <code>DOUBLE</code>.</figcaption>
</figure>

The type safety isn't a validation layer bolted on afterwards — every possible answer is enumerated *before* the model runs, because you supplied the list. There's no room in the output space for a value outside the declared type. Nothing to strip, nothing to parse, nothing to retry when it returns ` ```json ` with an apology attached.

It comes in three flavours, and you can mix them in one call:

- [**choice**](https://docs.typesafe.ai/primitives/choice) — pick one of these options. Returns the pick, a confidence, and the full probability distribution over your options.
- [**noul**](https://docs.typesafe.ai/primitives/noul) — is this claim true? Returns a number from 0 to 1.
- [**score**](https://docs.typesafe.ai/primitives/score) — put this on the rubric I described. Returns a position on your scale.

The name is a joke about [William Stanley Jevons](https://en.wikipedia.org/wiki/William_Stanley_Jevons), the Victorian economist who worked out in [*The Coal Question*](https://en.wikipedia.org/wiki/The_Coal_Question) that making steam engines more efficient made Britain burn *more* coal, not less. Cheaper fuel, more uses for it. That's the [Jevons paradox](https://en.wikipedia.org/wiki/Jevons_paradox), and [TypeSafe's version](https://typesafe.ai/blog/introducing-system-one-models-and-jev) is: "Every order of magnitude drop in the cost of intelligence unlocks orders of magnitude more use cases." We'll come back to it, because I proved it on myself before the day was out.

It's fast enough that the demo is [playing Doom](https://www.theregister.com/ai-and-ml/2026/09/16/typesafe-ai-debuts-model-for-machines-that-plays-doom/5296711) at ten decisions a second. I'm using it to sort a reading list, which is a bit like buying a Formula One car to get to the shops.

## `noul` gives you a probability, not a verdict

This is the part that matters for SQL.

A classifier that answers `true` or `false` has already made your decision for you, at a threshold some stranger picked. `noul` hands back a number and stays out of it. Where you cut is your business — which means it's an ordinary comparison operator, and it can go in `ORDER BY` too.

Here's how the 500 stories spread out:

<figure>
  <img src="/blog/a-where-clause-for-taste/noul-distribution.svg" alt="Histogram of interest probability across 500 Hacker News stories in ten-point buckets: 4 stories at 0.1, 76 at 0.2, 140 at 0.3, 134 at 0.4, 92 at 0.5, 38 at 0.6, 14 at 0.7 and 2 at 0.8. A marked threshold line sits between the 0.4 and 0.5 buckets." loading="lazy" width="760" height="320" />
  <figcaption>Median 0.42, best 0.88, worst 0.16. <code>noul &gt; 0.50</code> keeps 134 stories — about a quarter of the feed. Twelve land on exactly 0.50 and get cut by the strict inequality.</figcaption>
</figure>

Nothing scored above 0.88 and nothing below 0.16, which is what calibration looks like when the question is "would this person enjoy this" rather than "is this a cat". The bottom of the list is the best part:

<div class="query-result" role="region" aria-label="Result: the eight lowest-scoring stories" tabindex="0">
  <div class="query-result__label">result · lowest 8 of 500</div>
  <table>
    <thead><tr><th>title</th><th>noul</th></tr></thead>
    <tbody>
      <tr><td>Hjfjhg</td><td>0.16</td></tr>
      <tr><td>ICE-style immigration raids won't be used in Australia, minister says</td><td>0.17</td></tr>
      <tr><td>Free Unlimited AI Text to Speech – No Sign Up</td><td>0.18</td></tr>
      <tr><td>iPhone 18 Pro Camera Review: Dunton, Colorado</td><td>0.19</td></tr>
      <tr><td>Extreme Alarm Clocks (2025)</td><td>0.20</td></tr>
      <tr><td>PPPlayer – An open-source music player built with Flutter</td><td>0.20</td></tr>
      <tr><td>She's Leaving Me Because I Never Called Her Beautiful</td><td>0.20</td></tr>
      <tr><td>Nestbalm</td><td>0.21</td></tr>
    </tbody>
  </table>
</div>

Somebody submitted a story called `Hjfjhg`. It scored 0.16 — not zero. Even keyboard mash gets a little benefit of the doubt, which is either very generous or very Bayesian. Meanwhile "She's Leaving Me Because I Never Called Her Beautiful" ranks below a Flutter music player, and I can't argue.

The interesting zone is the middle, where twelve stories landed on exactly 0.50. That's the model shrugging:

<div class="query-result" role="region" aria-label="Result: stories clustered near the threshold" tabindex="0">
  <div class="query-result__label">result · a sample from the 0.47–0.54 pile-up</div>
  <table>
    <thead><tr><th>title</th><th>noul</th></tr></thead>
    <tbody>
      <tr><td>Auditing in the age of (good enough) AI</td><td>0.54</td></tr>
      <tr><td>Fingerprinting Network Honeypots with Weighted Behavioral Scoring Engine</td><td>0.54</td></tr>
      <tr><td>Gyazo screen capture tool confirms data breach</td><td>0.54</td></tr>
      <tr><td>Eight language models and the 2026 Berlin state election</td><td>0.54</td></tr>
      <tr><td>Ask HN: Which course or book changed you as a programmer and software engineer?</td><td>0.54</td></tr>
    </tbody>
  </table>
</div>

Those really could go either way for me, and a boolean would have had to pick one and pretend. Here the uncertainty survives into the result set, and moving `0.50` to `0.65` is a product decision I get to make later.

## The state is the whole row

Look at the call again:

```sql
typesafe.ask(hn_stories, questions => { ... })
```

`hn_stories` is the subquery's alias. Not a column — the whole row. Jev gets `{"title": "...", "url": "..."}` with the field names intact, so `arxiv.org` and `lwn.net` are part of what it's judging. No string concatenation, no `'Title: ' || title || ' URL: ' || url`.

`ask()` takes state as an `ANY` argument and converts by Arrow type: `VARCHAR` goes as text, a `STRUCT` or a whole row goes as JSON. Want one column instead? `typesafe.ask(hn_stories.title, ...)`.

That's a [`LATERAL` join](https://duckdb.org/docs/current/sql/query_syntax/from#lateral-joins) in the comma spelling — DuckDB spots the correlation, so the keyword is optional. The function is registered as a blended table-in-out function, which means the same call works on a literal, on a column, and inside an explicit `LATERAL`, with no separate syntax for each. VGI hands the worker batches of left-hand rows rather than one at a time, which is how 500 correlated calls overlap instead of queueing; [the architecture page](/vgi/architecture/) has the details.

## Look before you spend

Your result columns are named after your own questions, so the schema depends on what you asked. You can see it for free, because binding validates the questions and works out the schema without sending anything:

```sql
DESCRIBE SELECT * FROM typesafe.ask('x',
  questions => {'interesting': {'type': 'noul', 'instructions': 'Is this interesting?'}});
```

<div class="query-result" role="region" aria-label="Result: the schema of the ask call" tabindex="0">
  <div class="query-result__label">result · no request issued, no tokens billed</div>
  <table>
    <thead><tr><th>column_name</th><th>column_type</th></tr></thead>
    <tbody>
      <tr><td>interesting</td><td>STRUCT(noul DOUBLE)</td></tr>
      <tr><td>usage</td><td>STRUCT(model VARCHAR, input_tokens BIGINT, output_tokens BIGINT)</td></tr>
    </tbody>
  </table>
</div>

## What it cost

17.8 seconds end to end. Fetching the stories from Hacker News is 1.8 of those, so about 16 seconds is Jev.

TypeSafe has no batch endpoint — one request carries one state — so that's 500 HTTPS requests, eight at a time (`concurrency` defaults to 8, goes to 64). `ask()` also collapses duplicate `(state, questions)` pairs into one request, which saved me exactly nothing here: all 500 title-and-url pairs were distinct.

The `usage` column says 173,148 input tokens and 10,000 output tokens against `jev-1.13.0`. TypeSafe charges [$0.042 per million input tokens and nothing at all for output](https://typesafe.ai/), so scoring 500 stories cost **$0.0073**.

Three quarters of a cent. I spent longer deciding whether to run it than it cost to run. The 10,000 output tokens — exactly 20 per story, which is what it takes to say one number — were free.

Also — and [Jevons](https://en.wikipedia.org/wiki/Jevons_paradox) is somewhere laughing — I ran the whole thing twice, because the first set of numbers was fine but I wanted a snapshot I could query repeatedly for this post. Making the question cheap didn't make me ask it less. It made me ask it a thousand times. The model is named after the man who predicted exactly that, which I'd call a warning if it weren't so obviously a sales pitch.

## Five questions cost the same as one

What Jev *does* batch is questions. Five questions about one story is one request, not five, because they're all answered in the same parallel pass. That's why `ask()` takes a map:

```sql
SELECT title, urgent.noul, team.choice, depth.score
FROM
  (SELECT title, url FROM hackernews.new_stories LIMIT 100) hn_stories,
  typesafe.ask(hn_stories,
    questions => {
      'urgent': {'type': 'noul',
                 'instructions': 'Is this breaking news rather than evergreen writing?'},
      'team':   {'type': 'choice',
                 'instructions': 'Which area does this belong to?',
                 'criteria': MAP {'data': 'Databases, analytics, storage formats',
                                  'infra': 'Distributed systems, networking, operations',
                                  'other': 'Everything else'}},
      'depth':  {'type': 'score',
                 'instructions': 'How technically deep is this?',
                 'criteria': ['a headline', 'an overview', 'an engineering deep dive']}});
```

<div class="query-result" role="region" aria-label="Result: three typed answers per story from one request each" tabindex="0">
  <div class="query-result__label">result · three questions, one request per story</div>
  <table>
    <thead><tr><th>title</th><th>urgent</th><th>team</th><th>depth</th></tr></thead>
    <tbody>
      <tr><td>Warren Buffett steps down as Berkshire Hathaway chairman</td><td>0.85</td><td>other</td><td>0.00</td></tr>
      <tr><td>Startup Fluxnium found a way to tap 50k years' worth of nuclear fuel</td><td>0.73</td><td>other</td><td>0.02</td></tr>
      <tr><td>Prediction markets are becoming a national security threat</td><td>0.46</td><td>other</td><td>0.42</td></tr>
      <tr><td>Reconstructed Jurassic insect calls (165M-year-old) [video]</td><td>0.31</td><td>other</td><td>0.55</td></tr>
      <tr><td>Think Like an Attacker: CI/CD Security in the AI Era</td><td>0.13</td><td>infra</td><td>0.90</td></tr>
      <tr><td>You can create any workflow or pipeline you want with DSCI and LLM</td><td>0.12</td><td>infra</td><td>0.43</td></tr>
    </tbody>
  </table>
</div>

Buffett resigning: maximally breaking, zero engineering depth. The CI/CD security piece: not news at all, deepest thing in the batch. Both correct, both from the same request, three typed columns each.

## Take it somewhere else

The pattern isn't about Hacker News. Any table with text in it — support tickets, commit messages, reviews, RFP responses — can be scored against a sentence and filtered with `>`.

A few things worth stealing:

- **The score is just data.** Join it, average it, sort by it. `avg(interesting.noul) GROUP BY domain` tells you which sites reliably publish things you like, which is a more useful answer than any single story.
- **Pick your own threshold.** 0.8 if a machine acts on it unsupervised. 0.5 for a reading list. 0.3 for a triage queue a human still reads.
- **`DESCRIBE` is free.** Check the shape before you run 500 rows.
- **For one yes/no, skip the join.** `typesafe.is_true(body, 'Is this an angry complaint?') > 0.5` is a scalar and goes straight into `WHERE`.

Both workers are MIT-licensed and one `ATTACH` away: [vgi-typesafe](https://github.com/Query-farm/vgi-typesafe) and [vgi-hackernews](https://github.com/Query-farm/vgi-hackernews). TypeSafe's docs cover the [three primitives](https://docs.typesafe.ai/introduction) properly, and [VGI](/vgi/) is what gets any of it into DuckDB in the first place.

Every number here comes from one run against the live APIs on 18 September 2026. Hacker News moves. Your `Hjfjhg` will differ.
