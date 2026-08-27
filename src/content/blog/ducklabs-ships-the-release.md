---
title: "The Foundation owns the IP. DuckLabs ships the release."
pubDate: 2026-08-26
description: "The IP is safe under the DuckDB Foundation, but the Foundation doesn't cut releases — DuckLabs does. What the AWS acquisition changes for people who build on DuckDB, and what Query Farm is doing about it."
author: "Rusty Conover"
tags: ["DuckDB", "Governance", "Distribution", "Haybarn", "VGI"]
heroImage: '/media/posts/ducklabs-ships-the-release/social.png'
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>DuckDB's MIT-licensed IP remains with the independent Foundation.</li>
      <li>DuckLabs still controls the practical release path: reviews, merges, builds, and extension distribution.</li>
      <li>Query Farm is investing in Haybarn, an independent extension repository, and VGI so customers are not bound to one release queue or one query engine.</li>
    </ul>
  </div>
</aside>

I've been asked all day what the [AWS acquisition of DuckLabs](https://www.aboutamazon.com/news/company-news/aws-ducklabs) means. The questions have come from Query Farm customers, other DuckDB extension developers, and DuckDB users. It's been a busy day across Discord, LinkedIn, and email, and I can't reply to everyone individually, so I'm writing my answers here.

I should say up front that I have commercial interests in this. Query Farm builds and ships [DuckDB extensions](https://query.farm/products/extensions), and we publish [Haybarn](https://query.farm/haybarn), a distribution of DuckDB and its extensions. I'll get to what we're doing about all this at the end, but you should know that going in.

I'm optimistic about DuckDB's future, even though most of this post is about my concerns. Those two things aren't in tension. AWS has a real incentive to keep DuckDB open and widely adopted: if DuckDB becomes the default way to query data sitting in object storage, that drives compute onto AWS infrastructure, which is where they make their money. That alignment is genuine, and it's why I'm not worried about the project disappearing or going closed.

My concerns are narrower and more practical. They're about the things that don't show up in an announcement, and that I notice because I ship code that depends on them.

A quick caveat: the deal has been announced but hasn't closed. Nobody can speak with authority about what happens next. I have no inside information and no private conversations to reveal. And I don't think this is the moment to press the people involved for detailed answers about the future. Take it from me: the afterglow of entrepreneurial success should be enjoyed.

## Who actually ships DuckDB

The [announcement coverage](https://aws.amazon.com/blogs/big-data/aws-and-ducklabs-building-the-future-of-analytics-together/) reassured everyone that the IP is held by the [DuckDB Foundation](https://duckdb.foundation) under the MIT license. That's true, and it's good.

But the DuckDB Foundation doesn't make [DuckDB](https://duckdb.org) releases. **DuckLabs does.**

AWS draws this distinction themselves. In [Andy Warfield's post on Werner Vogels' blog](https://www.allthingsdistributed.com/2026/08/duckdb-and-the-changing-physics-of-analytics.html), the project continues "under the stewardship of the DuckDB Foundation, developed by the DuckLabs team."

Stewardship and development are different jobs, and only one of them ships code.

It matters who merges PRs, who builds the code, and who ships it, because those people decide what's in a release and what isn't—and which bugs get fixed and which don't. For extension developers, it also matters who can release extensions that interoperate with a release, who approves extensions for the [community extensions repository](https://github.com/duckdb/community-extensions), and, most of all, *when* those PRs get merged.

<blockquote class="is-pullquote">For those of us building and shipping on DuckDB, the merge queue is the dependency, not the license.</blockquote>

Right now the Foundation has a [three-member board](https://duckdb.foundation/#who-runs-it): Hannes as Chair, Mark, and Peter Boncz.

It's worth noting that AWS was already at the table. They're listed as a [Gold supporter](https://duckdb.foundation/#supporters) of the Foundation at €100,000 a year or more, alongside MotherDuck and Posit, and the Foundation is explicit that membership "gives your organization a voice in" the roadmap. That's a perfectly normal arrangement, and it's the same one MotherDuck has.

What changes now is that the employer of two of the Foundation's three board members—including its Chair—will also be one of those voices.

The Foundation hasn't needed to play much of an operational role so far. It holds the IP; DuckLabs develops and releases the software. I don't expect the Foundation to suddenly start issuing releases, because it isn't operationalized for that. DuckLabs will still decide what gets merged and what doesn't.

But its reaction function to ideas, issues, and PRs may change.

The Foundation's [articles of association](https://duckdb.foundation/pdf/deed-of-incorporation-stichting-duckdb-foundation.pdf) are published in English if you want to read how the Stichting is actually governed.

An [advisory board](https://duckdb.org/2026/08/17/duckdb-20-highlights#bonus-duckdb-foundation--advisory-board) is also coming. Who ends up on it is worth watching closely.

In fairness, Peter Boncz, the one board member who won't be an AWS employee, has said publicly that the Foundation will keep the voices of supporters and the wider community heard. He's the CWI representative, and he was there when the Foundation was created. I take him at his word. I'd still rather see what the advisory board turns out to be than assume.

There's a related question worth following. MotherDuck plans to [offer enterprise DuckDB support](https://motherduck.com/blog/duckdb-amazon/). They haven't done that before; naturally, they'd rather run DuckDB for you. Good engineers work there, so the question isn't whether they can support it.

The question is where their customers' fixes will land: in a MotherDuck fork, or upstream in the main tree.

The commit history over the next year will tell us something about where the center of gravity in DuckDB development actually lives.

## Taste, and who sets the incentives

DuckDB is open source, but the team has always held strong opinions. Not every PR or idea makes it in. DuckDB deliberately carries few dependencies and vendors a fair bit of code. From the time I've spent around the project, I know that not everything gets merged, and that it shouldn't be—especially now that AI-generated PRs are arriving in volume.

I've put up some PRs that, on second thought, weren't great either.

The people making those decisions and doing those reviews have had consistently good taste. They've done it while their time and attention were already spread thin across customers, maintenance, and bug fixing.

Going forward, their incentives will be set by someone else. Maybe not immediately, but eventually.

That doesn't mean the decisions suddenly become bad. It means priorities can change: where engineering time goes, what gets reviewed quickly, and which problems attract attention. Those shifts tend to be small at first and noticeable over time.

That's the thing I'll be paying attention to.

## What Query Farm is doing

None of what follows is a reaction to the acquisition.

I published [a detailed post about DuckDB's community extension distribution](https://query.farm/blog/duckdb-community-extensions-distribution/) on June 18, 2026—two months before any of this was announced—and the work it describes predates that.

I'm repeating it here because it's the honest answer to "what does this mean for Query Farm's extensions?" and because the reasoning holds up better now, not worse.

The short version: I measured every PR merged to [`duckdb/community-extensions`](https://github.com/duckdb/community-extensions) over the trailing year—1,435 of them. Median time-to-merge rose from about 3.4 hours in July 2025 to about 13.5 hours in May 2026, while p90 widened from 40.8 to 61.6 hours as submission volume grew several-fold.

![Line chart of monthly pull request merge latency for duckdb/community-extensions from mid-2025 to mid-2026. Median time-to-merge rises from roughly three hours to over thirteen hours, with the interquartile band and the ninetieth percentile widening as monthly pull request volume grows several-fold.](https://query.farm/blog/duckdb-community-extensions-distribution/fig_merge_all.svg)

*Monthly merge latency for `duckdb/community-extensions`. Median with p25–p75 bars and a dashed p90; pale bars are PRs merged that month. Measured and published in June 2026, before any of this was announced.*

That's not a knock on the maintainers, who are notably responsive. It's a throughput problem: merge capacity is bounded by human attention, and submissions are growing faster than attention can.

Hannes and Mark say much the same thing in [their own announcement](https://www.ducklabs.com/news/2026/08/26/ducklabs-to-join-aws). They write that they worried "our small company could become a bottleneck for the project"—for the team and for the people building businesses on top of it.

That's my read of the data too, from the outside. It's part of why I believe them when they say this move is about capacity rather than exit.

### Haybarn

That unpredictability is part of why Query Farm built [Haybarn](https://query.farm/haybarn), though it isn't where Haybarn started.

Haybarn began as a reaction to something narrower: DuckDB releases shipping before the community extensions were built against them. You'd upgrade the engine on the strength of the announcement, run `INSTALL`, and discover that your extension wasn't available for your version.

The engine was ready; the distribution wasn't.

It has grown well past that original complaint. Haybarn is a DuckDB distribution in roughly the sense that Ubuntu is a distribution of Linux: same SQL, same `.duckdb` files, same extension names, with the rough edges around the engine already filed off. Adopting it isn't a migration. On Python it's a one-line change—`import haybarn as duckdb`.

What you get on top is the packaging and supply-chain work: every artifact checksummed, GPG-signed, and carrying SLSA build provenance, checkable before anything runs. Extension version pins that actually hold. Distribution through npm, PyPI, crates.io, Maven Central, and GitHub Releases rather than a single origin. And a default catalog that is what DuckDB CI builds minus third-party vendor code, so nothing autoloads that you didn't ask for.

It also carries engine changes—parallel object-store range reads sharing one HTTP/2 connection, a fixed catalog join so PostgreSQL-wire clients like Power BI, DBeaver and Grafana can introspect, a wider WebAssembly API surface that survives an exception and can run a real sign-in flow from inside a Worker.

So is it a fork? Not in the way people usually mean. Haybarn tracks DuckDB releases and I don't want to diverge from them. But it's honest to say it's opinionated, and that the independence is the point. We can reach a different conclusion than the DuckDB project does, on our own timeline, when our clients' work tells us to.

None of those changes are things upstream got wrong. They're places where we had a firm opinion, someone depending on it, and the freedom to act.

That cuts both ways, and I'd rather say so plainly: judgment can be wrong. When one of ours turns out badly, we change it. Where a change belongs to everyone, we offer it upstream—and when it lands, we drop our patch and carry one less thing. When it doesn't land, that's just as good an outcome. DuckDB answers to a far wider audience than we do.

Haybarn is MIT-licensed and free to use, and the whole community is invited to contribute: it's [on GitHub](https://github.com/Query-farm-haybarn/haybarn).

### The extension repository

I don't fork software often, especially not entire database ecosystems. But Query Farm is deeply invested in DuckDB. We've published around thirty extensions, and our current projection is roughly 229 million extension loads over the next year. At that volume, people upgrading and finding their extensions missing isn't an inconvenience—it's an outage in someone's product. That's the responsibility I'm trying to meet.

Here's the part that landed particularly well for us: in their announcement, Hannes and Mark say they plan to open the extension stack so that extensions signed by other developers and organizations can run in DuckDB.

That isn't just a press-release intention. Hannes opened [a draft PR for external extension repositories](https://github.com/duckdb/duckdb/pull/24777) on August 14, twelve days before the acquisition was announced.

It adds `CREATE EXTENSION REPOSITORY`, where each repository pins its own public keys and verification is partitioned by origin: an extension from my repository verifies against my key, never against the core or community keys. That's stricter than the trust model DuckDB has today, where everything checks against the union of both.

Two things worth knowing. It's still a draft with no reviewers, so nothing here is settled. And the `allow_extension_repositories` setting defaults to "undecided," which blocks adding a repository until a user explicitly opts in—alongside a "forbidden" one-way ratchet and `lock_configuration` support for organizations that want their trust store frozen. An independent repository will never be something you get by accident. That's the right call, and it means we'll have some explaining to do. I'd rather say that now than surprise anyone later.

So when DuckDB 2.0 arrives this fall, it's likely that Query Farm extensions will move to a Query Farm extension repository rather than the community extensions repository.

We're large enough now to make the infrastructure investment to package and release on our own: verifiable binaries, immutable hosted artifacts, published release status, and package paths that fit the dependency workflows teams already have. Every extension will remain available, and we'll publish a full transition plan closer to 2.0.

The point is to decouple our ability to ship updates from anyone else's ability to merge them. If the signed-repository work lands the way it looks, that decoupling happens with the grain of the project rather than against it.

### VGI

Will I still send PRs upstream? Sure, when it makes sense.

But much of my extension work now happens through [VGI](https://query.farm/vgi), the Vector Gateway Interface. VGI is a DuckDB extension that hosts other extensions—CGI, but for databases. A worker runs as an ordinary process outside DuckDB and speaks [Apache Arrow IPC](https://arrow.apache.org/docs/format/Columnar.html#serialization-and-interprocess-communication-ipc) over a pipe, socket, shared memory, or HTTP.

Because the worker is an ordinary service rather than a compiled extension, multiple sessions can share it, you can put a pool behind a load balancer, and you can write it in Python, TypeScript, Go, Rust, or Java rather than C++.

And because the interface is a protocol rather than an engine ABI, the same worker can eventually serve more than one SQL engine.

<blockquote class="is-pullquote">Write the connector once; reach it from wherever you query.</blockquote>

VGI is [open source on GitHub](https://github.com/Query-farm/vgi), and the [RPC protocol](https://vgi-rpc.query.farm) is open as well.

That's the part I want to underline.

DuckDB's extension API is genuinely excellent. It's rich enough that I could build a general-purpose extension surface on top of it, and rich enough that workers written against VGI can target other engines too.

That's a tremendous credit to the DuckLabs team's design work.

And it's also why I care so much about what happens next.

The MIT license matters. The Foundation matters. But for people building on DuckDB, so do the people who review the code, merge the PRs, build the binaries, and make the releases.

The Foundation owns the IP.

DuckLabs owns the release.
