# Grainlift product prototype

Route: `/products/grainlift`.

The ADBC introduction expands Arrow Database Connectivity and explains the
standard client operations and columnar batches before introducing the
architecture. It links to https://arrow.apache.org/adbc/current/ and to Query
Farm's maintained `adbc_scanner` extension at `/products/extensions/adbc_scanner`.

The story gives equal weight to proxying an existing ADBC driver and building
a new service that returns data through ADBC. The grain-elevator illustration
connects storage silos and a workshop to receiving stations. It is a metaphor;
the separate architecture diagram defines the actual client/server relationships.

The query-semantics section explains that a custom backend interprets statement
text itself. `QUERY` is the real command implemented by the Rust hello-world
repository; the market-data and forecasting requests are explicitly illustrative.
Grainlift supplies neither their parsers nor a natural-language interpreter.
Applications that generate SQL still require compatible SQL behavior.

The Grainlift/VGI section explicitly positions the products as complementary:
ADBC application access and query-engine extension serve different integration
needs. Its pricing-engine example illustrates reusing business logic behind two
separately implemented interfaces, not automatic endpoint interoperability.

The architecture uses staggered request dots and returning Arrow-batch markers
on both paths. Each response follows a request; the motion illustrates pull-based
results. A pause control is available, reduced-motion preferences disable the
animation, and playback pauses outside the viewport or in hidden tabs. The
benchmark tabs switch between distinct workloads, never a comparison between
proxying and building a backend. Keyboard arrow, Home, and End keys operate
the benchmark tabs. All key values are also rendered as text.

## Evidence

Values are transcribed from existing reports; no new performance run was made.

- Proxy HTTP: `grainlift/validation/load-results/ec2-v04-20260926/README.md`.
  DuckDB 3349.6, PostgreSQL 1130.0, SQLite 1064.4 queries/s; respective p99
  latencies 17.5, 35.3, 32.2 ms. 32 sessions, 2048 rows/query, 128-byte payload.
- Custom Rust service: `grainlift/validation/load-results/ec2-result-reuse-20260926/README.md`.
  TCP/mTLS 3.82 ms, HTTP 10.09 ms mean query latency. Per-run p99 ranges
  4.18–5.26 and 10.76–16.18 ms. One warm client, 4096 rows/query in eight
  batches, 64-byte payload, three repetitions. No SQL engine.
- Both reports used same-host EC2 loopback. Neither establishes WAN capacity
  or a comparison with direct ADBC. Go and TypeScript are not benchmarked here.

Framework descriptions follow the local READMEs of `grainlift-go`,
`grainlift-python`, `grainlift-typescript`, and `grainlift-rust-hello-world`.
Source/example links are preferred to package install commands because release
status differs. Rust uses the shared native server library. Go supports HTTP,
HTTPS, loopback TCP, mTLS TCP, and Iroh with published VGI-RPC Go v0.30.0;
Iroh additionally requires the VGI Iroh bridge. The hero visibly labels the
product a developer preview and directs visitors to source-build availability.

## Social sharing

The page uses `public/grainlift/grainlift-social.png`, a branded 1200×630 card
matching the shared Open Graph metadata. Regenerate it with
`node scripts/generate-grainlift-og-image.mjs`. It uses the shared local fonts,
Query Farm wordmark, and existing illustration; no network access is needed.

## Illustration

The Apache Arrow logo is the unmodified official black-on-transparent SVG from
https://arrow.apache.org/img/arrow-logo_horizontal_black-txt_transparent-bg.svg,
stored at `public/grainlift/apache-arrow-logo.svg`. Usage guidance:
https://arrow.apache.org/visual_identity/. The logo links to Apache Arrow and
the adjacent text links to ADBC documentation. Trademark ownership is attributed
to The Apache Software Foundation below the closing section.

Generated with the built-in imagegen tool. Original saved as
`public/grainlift/grainlift-data-elevator.png`; web-optimized derivative is
`public/grainlift/grainlift-data-elevator.webp`.

Final prompt:

> Use case: illustration-story. Create a sophisticated editorial illustration for Grainlift, a Query Farm data infrastructure product. Landscape 1536x1024, no text whatsoever. A fantastical but precisely drawn grain elevator as a data interchange: tall golden ochre bucket elevator in the center, three ribbed cylindrical grain silos on the left representing existing databases, and a small open workshop on the right containing neat machines and drafting tools representing custom software services. Fine elevated conveyor rails connect both groups through the golden elevator to three small terminal-like receiving stations in the foreground; the conveyors carry tiny rectangular groups of colored tiles arranged in columns, evoking Arrow data batches. Architectural axonometric drawing, vintage technical manual meets contemporary editorial illustration, clean fine brown ink outlines, delicate crosshatching, restrained flat ochre and forest green washes, small terracotta accents, elegant hand-crafted industrial detail, readable broad shapes, confident composition, no people. Entire composition on an untextured warm cream #f7f3e8 background that softly empties to cream at all four edges, no border. Warm intelligent playful engineering, not childish or cute. The buildings occupy central 85 percent with 8 percent clear margin. No words, no letters, no numbers, no floating UI cards, no gradients, no blue, no purple, no glossy 3D, no robot. Final asset for a high-end product website, not a diagram or a web page.
