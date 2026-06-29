---
title: "Quack and VGI: Two Approaches to Bringing RPC to DuckDB"
description: "Quack — the new client/server protocol extension for DuckDB — was announced today. It's been built since November 2025, almost exactly as long as I've been building VGI. Here's what's interesting, what's surprising, and where the two projects converge and diverge."
pubDate: 2026-05-12
author: 'Query.Farm Team'
tags: ["RPC", "VGI", "Quack"]
heroImage: '/media/posts/quack-vgi-two-approaches-rpc-duckdb/social.png'
---

The DuckDB team [announced Quack today](https://duckdb.org/2026/05/12/quack-remote-protocol), a new pre-release extension that turns DuckDB into both a client and server for a custom binary RPC protocol. The README is delightfully concise: `INSTALL quack FROM core_nightly;`, then `CALL quack_serve(...)` on one side and `ATTACH 'quack:...'` on the other. Suddenly you can `FROM remote.table` across two DuckDB instances over the network.

It's a great first step toward RPC-native DuckDB, and I want to spend some time with it because I've been working on something adjacent — **VGI** (the Vector Gateway Interface) — since roughly the same point in time. Quack's first commit was 18 November 2025; my VGI prototype was running by then too. Six months of parallel evolution, very different design choices.

This post walks through where the two projects line up, where they diverge, and what each one reveals about what "remote DuckDB" can mean.

## What Quack is

<figure style="max-width:420px;margin:2rem auto;text-align:center">
  <img src="/media/posts/quack-vgi-two-approaches-rpc-duckdb/quack-logo.png" alt="Quack — DuckDB's client/server RPC protocol extension" style="width:100%;height:auto" />
</figure>

At its heart, Quack is a binary RPC protocol carried over HTTP. A handful of message types frame the conversation:

| Message            | Direction       | Purpose                              |
| ------------------ | --------------- | ------------------------------------ |
| `CONNECTION_REQUEST` / `CONNECTION_RESPONSE` | both | Handshake + authentication      |
| `PREPARE_REQUEST` / `PREPARE_RESPONSE`       | both | Submit a query, get schema + first batch |
| `FETCH_REQUEST` / `FETCH_RESPONSE`           | both | Stream additional result batches  |
| `APPEND_REQUEST`                             | C→S  | Push a `DataChunk` into a remote table |
| `DISCONNECT_MESSAGE`                         | C→S  | Tear down the session             |
| `ERROR_RESPONSE`                             | S→C  | Anything that went wrong           |

The server holds a `duckdb::Connection` per remote session and a single live `QueryResult` cursor per connection. The client side hooks DuckDB's storage extension interface so that `ATTACH 'quack:...'` looks just like attaching any other database — `SHOW TABLES`, `SELECT`, `INSERT`, `CREATE TABLE AS`. It is a beautifully tight scope for a v1.[^websockets]

[^websockets]: A small sidebar from the git log: this didn't start as HTTP. The first commit's message reads *"got https web socket server to work"*, and the codebase carried wss/websocket plumbing for nearly four and a half months before the [commit on 30 March 2026](https://github.com/duckdb/duckdb-quack) titled *"dropped websockets in favor of plain http(s)"*. The published benchmark plot in the repo still shows four transports compared (unix socket, plain HTTP, HTTPS, WSS) — throughput converges above ~10⁵ rows for all four, which probably made the simplicity argument for HTTP land easily. WSS bought no measurable advantage; it cost protocol complexity. A nice example of choosing the boring transport.

## What VGI is

<figure style="max-width:420px;margin:2rem auto;text-align:center">
  <img src="/media/posts/quack-vgi-two-approaches-rpc-duckdb/vgi-logo.png" alt="VGI — The Vector Gateway Interface" style="width:100%;height:auto;box-shadow:none;border-radius:0" />
</figure>

**VGI** stands for **Vector Gateway Interface**. It's a DuckDB extension for embedding *remote functions* — written in any language that can speak Apache Arrow IPC — into DuckDB queries as if they were linked in directly. A worker presents an RPC surface that mirrors DuckDB's in-process extension API: it can implement a table function, a scalar function, a table-in-out function, or an aggregate, and DuckDB invokes it during query execution. Schema and types are declared on the worker side and surfaced through DuckDB's catalog. There are reference worker libraries in Python, TypeScript, Go, and Java; the wire envelope is small and language-neutral, so anything that can produce Arrow IPC can serve.

VGI has two transports, and the split between them is not arbitrary — it reflects a fundamental distinction in how protocols can manage state. **Connection-oriented** transports (pipes, UNIX sockets) give you a long-lived bidirectional channel that *is* the session: state can live inside the connection, and there's an implicit "we are still talking" handshake built into the medium. **Connectionless** transports (HTTP) treat every request as independent: any request can be routed to any server, no continuity is implied, and any session state has to be carried explicitly inside the request and response payloads. The two operational shapes that real deployments take map cleanly onto those two categories — a worker spawned next to DuckDB belongs to one model; a pool of workers behind a load balancer belongs to the other. VGI ships both because no single transport choice satisfies both deployment shapes well.

### The subprocess transport (connection-oriented)

This is the default, and the lower-latency of the two. The VGI DuckDB extension spawns the VGI worker as a child process at first use and talks to it over a UNIX socket. It's similar in spirit to the way an editor talks to a language server: a long-running child process the parent owns, request/response over a local socket, no network involved. When DuckDB exits, the worker exits with it; crash recovery is "restart the child."

### The HTTP transport (connectionless)

The worker runs as an independent HTTP server somewhere on the network. The DuckDB extension addresses it by URL — no process spawning at all — and a pool of workers can sit behind an ordinary L7 load balancer with autoscaling and lifecycle managed by whatever orchestrator you already use (Kubernetes, ECS, fly.io). Failure recovery is whatever your orchestrator does for any other stateless service.

### What's the same across both

Same protocol semantics either way; the wire format is [Apache Arrow IPC](https://arrow.apache.org/docs/format/Columnar.html#format-ipc) in either case, so `DataChunk`s flow batch by batch and nothing is fully materialized just because it's leaving the worker. The choice between the two is mostly about where the worker's lifecycle lives — co-located with DuckDB (subprocess) or independent (HTTP) — not about what the protocol can express.

A few benefits follow from those choices: services are defined as typed interfaces in your language (no `.proto` files, no IDL, no code generation step); transports can be swapped without changing service code; Arrow's columnar serialization moves scalar values cheaply and massive batches efficiently in the same protocol; and streaming, error propagation, introspection, and OpenTelemetry tracing come built in. The deployment story is the one I keep coming back to: because the protocol is transport-agnostic and the stream state is externalized (more on this below), the production shape is "pool of stateless workers behind a load balancer" rather than "one long-lived process you need to keep happy."

## Where they overlap, where they don't

Both Quack and VGI ship a DuckDB storage extension that hooks `ATTACH`, so from the SQL author's seat the entry point looks almost identical. Quack:

```sql
ATTACH 'quack:host:9494' AS r;
SELECT * FROM r.t WHERE x > 100;
```

Two lines. Remote tables appear in DuckDB's catalog as if they were local — `SHOW TABLES` lists them, you can `JOIN` against them, `INSERT INTO` writes back. You don't register anything or declare anything; you just point at a server.

VGI offers the same shape. Here it is pointed at [a small VGI worker I have deployed on fly.io](https://github.com/rustyconover/vgi-trains-python-fly) that exposes real-time Dutch railway data from the NS API:

```sql
ATTACH 'http://localhost:8000/vgi' AS trains (TYPE vgi);
SELECT * FROM trains.main.station_departures WHERE station = 'UT';
```

Two lines. Schema-qualified references, `SHOW TABLES` works, filter pushdown works — the `WHERE station = 'UT'` predicate is pushed into the worker, which uses it to fetch only that station's departures.

The difference is on the other end of the attach. Quack is talking to another DuckDB; its catalog *is* the remote DuckDB's catalog. VGI is talking to a worker that exposes functions *as if they were tables* — the catalog you see is whatever the worker chooses to publish, and a "table" can be a streaming generator, a paginated API wrapper, an ML inference endpoint, or a connection to a non-DuckDB store.

The reason VGI's surface is wider than Quack's has a single-line answer: **VGI is essentially an RPC-shaped version of DuckDB's existing in-process extension API.** When you write a native DuckDB extension in C++, you can register table functions, scalar functions, aggregates, and table-in-out functions, and DuckDB's planner makes a whole set of auxiliary calls into your code along the way — cardinality estimates, column statistics, bind-time type resolution, pushdown decisions. VGI takes that entire contract and puts it on the wire: every extension-API entry point becomes a named RPC method that a remote worker can implement, in any language that speaks Arrow IPC. Quack is a focused federation protocol with eleven message types; VGI is a remote mirror of the extension surface DuckDB already exposes, which is why the API surface is broader.

Tables-attached-by-URL is the slice of that mirror that overlaps with what Quack offers. The other function categories — and the planner-time auxiliary calls — fall outside what a federation protocol aims at, and they're exactly where VGI lives. Only the table-function category surfaces through the attached catalog; the rest are called by function name in a query, not addressed via a schema:

| Pattern                                   | Example                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Scalar UDF in a peer language             | `SELECT score(feature_vector) FROM events` where `score()` is a Python or Rust function       |
| Table-in-out generator                    | Paginated API exposed as a streaming table that DuckDB can `JOIN` against                     |
| Aggregate in a peer language              | Custom aggregation, including streaming-window variants                                       |
| Federation with non-DuckDB sources        | A table function that talks to Postgres, Iceberg, an internal store — any of them            |

The cost on the VGI side is that *someone* has to write the worker — describe the function's shape, implement `process()`, deploy it as a subprocess command or an HTTP service. This is also exactly the kind of boilerplate that coding agents have gotten genuinely good at: point Claude or your favorite agent at one of the reference workers, describe the API you want, and you get a working VGI worker faster than you'd assemble the `.proto` file and codegen step for a gRPC equivalent. Quack lets you skip that step entirely when the remote side is already a DuckDB. That's the real trade: Quack works against any DuckDB you can attach to; VGI works against anything you (or someone else, or an agent) are willing to spin up a worker for.

The two extensions aren't competing on the same axis. Quack is about *one specific source* — another DuckDB — exposed through `ATTACH`. VGI is about *any computation that can speak Arrow IPC* — exposed through `ATTACH` for table-shaped things, plus the scalar/aggregate/table-in-out categories that don't fit a catalog. For the overlap — DuckDB ↔ DuckDB federation specifically — Quack is the right tool if the remote side is "just a DuckDB," because there's nothing to write. VGI is the right tool when the remote side isn't, or when the deployment shape (no sticky sessions, graceful payload externalization, worker-pool fan-out) matters more than the zero-setup convenience of Quack.

## The cursor and the wire

Two implementation choices shape almost every protocol-level difference between Quack and VGI: where the cursor lives, and how the bytes on the wire are framed.

A quick definition. When you run a query like `SELECT * FROM huge_table`, the database doesn't usually produce all the rows at once and hand them back in a single lump. It produces them lazily, batch by batch, as the caller asks for more. The **cursor** is the piece of bookkeeping that remembers where in the result stream you currently are — which rows have already been delivered, which haven't, and what state the query's execution machinery is in. Every streaming RPC protocol needs to decide *where* that bookkeeping is kept and *who* is responsible for advancing it, and those two questions are exactly what Quack and VGI answer differently.

In Quack, **the cursor lives in the server process**. When a client issues `PREPARE_REQUEST`, the server runs the query, holds the resulting `QueryResult` on a per-session struct, and hands the client a `result_uuid`. Subsequent `FETCH_REQUEST`s drain that cursor batch by batch. This is great for streaming — you don't have to materialize the whole result anywhere, and the first batch can come back as soon as DuckDB produces rows — but it pins every session to one specific server process.

In VGI, the cursor's location depends on the transport. Over the **subprocess transport** the worker is the cursor's home for the duration of the call — VGI opens an `AF_UNIX` socket to the worker process and keeps it open until the call completes, the way you'd talk to any local service. Over the **HTTP transport** the cursor's resumption point is externalized: each batch carries a small **stream-state token** in its Arrow IPC metadata, and that token is everything a worker needs to pick up where another worker left off. Two successive HTTP requests in the same logical call can be answered by two different workers in a pool, because the resumption state lives in the token rather than in any worker's memory.

That difference drives two of the most consequential properties of each protocol:

- **Worker affinity.** Quack always requires that every request inside a session land on the specific server process that handled the original `CONNECTION_REQUEST` — there's no token, no externalized state, so the session is married to one process until disconnect. That's fine for a single-server deployment and increasingly painful as soon as you put a fleet of servers behind an L7 load balancer. VGI's HTTP transport, by contrast, doesn't need sticky routing at all: the load balancer can pick any worker; the token tells that worker where to resume. Horizontal scale-out is the cheap path, not the hard one.
- **The presigned-URL escape hatch.** VGI gives the protocol a safety valve when a single batch genuinely won't fit on the wire: the client can ask the server for a presigned upload HTTPS URL, push the oversized payload to shared storage, and send a small "pointer batch" referencing the download URL instead. That's not the default path — most calls just stream. But it means oversized payloads degrade gracefully instead of failing with an HTTP `413` or blowing past a load balancer's body-size limit. Quack today has no equivalent.

The other shaping choice is the wire format itself. The thing that genuinely caught me off guard was how Quack frames its messages. It is **not** Cap'n Proto. It is **not** Protocol Buffers. It is **not** Arrow IPC. It's DuckDB's own internal `BinarySerializer` — the same field-tagged binary format DuckDB uses to serialize query plans for inter-pipeline shipment.

Each message is "header blob + body blob," both wrapped by `serializer.Begin()` / `serializer.End()`. Field versioning is via numbered properties (`1`, `2`, `3`, ...) so new fields can be added without breaking old clients. There's no code generation step. No `.proto` file. No `.capnp` schema. Just plain C++ classes implementing `Serialize` / `Deserialize` against DuckDB's own framework.

The pragmatic appeal is real: zero new dependencies, perfect type fidelity for every DuckDB logical type, the same serializer DuckDB already trusts in production. I confirmed fidelity for 22 types end-to-end — tinyint, hugeint, decimal, blob, timestamp-with-tz, interval, uuid, list, struct, map, fixed-size array, and the various NULL paths. Every type round-tripped cleanly with matching hashes. The risk is interoperability: a non-DuckDB client (a browser-WASM tool, a Go service, a Rust workflow runner) can't speak to a Quack server without re-implementing the BinarySerializer format. The other RPC frameworks pay an ergonomic tax for interop guarantees; Quack pays an interop tax for ergonomic simplicity. It's defensible — *especially* if you believe the cluster is going to be all-DuckDB anyway. VGI made the opposite trade — Arrow IPC is verbose to set up but speaks to any Arrow-aware language. Both choices reflect what the authors expected their ecosystems to look like.

The wire-format choice has a companion choice in the *shape of the verb set*, and this is the place the two protocols differ most architecturally. Quack's vocabulary is a closed `uint8_t` enum with eleven values — `CONNECTION_REQUEST` / `CONNECTION_RESPONSE`, `PREPARE_REQUEST` / `PREPARE_RESPONSE`, `FETCH_REQUEST` / `FETCH_RESPONSE`, `APPEND_REQUEST`, `SUCCESS_RESPONSE`, `DISCONNECT_MESSAGE`, `ERROR_RESPONSE`, plus `INVALID`. Adding a new verb means editing the enum, writing a new C++ message class, updating the dispatcher, and bumping the protocol version. It's a protocol change, not a configuration change.

VGI's namespace is open. Methods are identified by string name in a registry — `table_function_cardinality`, `catalog_table_column_statistics_get`, `aggregate_bind`, `aggregate_update`, `aggregate_combine`, `aggregate_finalize`, `aggregate_window`, `aggregate_streaming_open`, on through roughly twenty-five methods today. Adding a new one means registering a schema and writing a handler; the wire envelope already carries the method name.

The git log makes the consequence visible. On 29 April — two weeks before Quack's launch — Hannes pushed a commit titled *"drop cardinality estimation."* Quack had a half-wired cardinality hook in its `QuackScan` table function, and it came out because exposing it cleanly would have required a new protocol verb, and that wasn't going to happen before launch. VGI, by comparison, exposes `table_function_cardinality` and `catalog_table_column_statistics_get` as first-class RPCs that DuckDB's optimizer calls **at bind time**, before any rows flow. A worker can return cheap estimates from a parquet footer, a Bloom filter, or whatever metadata it has — without running the query for real.

The closed-enum-versus-open-registry choice maps cleanly onto the same through-line as everything else. Quack assumes the other end is a peer DuckDB that can be trusted to run its own optimizer; when the remote side is another DuckDB, the protocol doesn't need to teach the local one anything about cardinality, because the remote DuckDB will use its own catalog statistics when it runs the query. VGI assumes the other end is opaque — possibly a Python ML model, possibly a service speaking to an API the local DuckDB has never heard of — so the protocol has to give the local optimizer ways to ask the remote thing planning-time questions.

The trade-offs settle out like this:

|                                  | Quack                                | VGI                                                              |
| -------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Where the cursor's state lives   | On the server process, per session    | Subprocess: with the worker. HTTP: carried in a stream-state token, so any pool worker can resume. |
| Wire format                      | DuckDB `BinarySerializer`             | Apache Arrow IPC                                                 |
| Batch streaming                  | Yes, server pushes chunks             | Yes, worker streams chunks                                       |
| Oversize-payload handling        | No mitigation — single chunk can blow past LB caps | Optional presigned-URL externalization (graceful degradation)   |
| Sticky load-balancer routing needed? | Yes — every request in a session must hit the same server | Subprocess: the call talks to one worker by nature. HTTP: not needed — any worker can answer any request. |
| First-batch latency              | Excellent                              | Excellent                                                        |
| Memory pressure                  | Held on server until DISCONNECT        | Bounded by Arrow batch size + streaming back-pressure            |
| Protocol vocabulary              | Closed enum (11 message types); new verbs require code + version bump | Open registry (~25 named methods today); new methods register a schema |
| Planner-time integration         | None today — optimizer can't ask the remote for cardinality or stats | `table_function_cardinality`, `catalog_table_column_statistics_get`, etc. — first-class RPCs called at bind time |

Neither approach is "right." Quack's choices give lower-latency federation between DuckDB instances and simpler code. VGI's choices trade some additional protocol surface for wider language embedding, graceful behavior when payloads or topologies get awkward, and a path for the local optimizer to negotiate with the remote at plan time. Both projects treat streaming as load-bearing, because DuckDB itself is a streaming execution engine. They differ on where the stream state ought to live, and on how much the protocol needs to teach the local optimizer about what's behind the wire.

## Authorization as a SQL surface

This is the most genuinely *interesting* design choice in Quack.

Quack defines authorization not as a C++ callback but as a **SQL function call**. Two settings, both `VARCHAR`, configurable globally:

```sql
SET quack_authentication_function = 'my_authn_function';
SET quack_authorization_function  = 'my_authz_function';
```

At handshake time the server runs `SELECT my_authn_function(session_id, auth_string, server_token)` and expects a boolean. On every `PREPARE_REQUEST` and `APPEND_REQUEST` it runs `SELECT my_authz_function(connection_id, query_string)` and expects a boolean. Anyone can swap either function with `SET` — no recompilation, no restart, no extension reload. It is an enormously flexible hook.

Some of what I found by digging in:

| Property                                              | Behavior |
| ----------------------------------------------------- | -------- |
| Function has full DuckDB access (read tables, file IO) | Yes — not sandboxed |
| Per-FETCH authorization                                | **No** — authz fires only at PREPARE / APPEND |
| Authorization sees real query text on PREPARE          | Yes |
| Authorization sees real column values on APPEND        | **No** — receives a synthetic `INSERT INTO schema.table VALUES (NULL)` |
| Client sees the actual authz error message             | No — always collapses to `"Authorization failed"` |
| Re-authentication of an established session            | No — bearer-token model, session_id is the credential for the session's lifetime |

The *no per-FETCH authorization* choice is almost certainly the right one — the authz decision was made at PREPARE; fetching is just consuming already-approved work — but it means an authorization change made between batches doesn't affect in-flight result streams.

The *APPEND sees a synthetic query, not real values* row is the one that warrants design attention. It limits the authz function to **table-level** decisions for writes: you can say "user X cannot insert into table Y," but you can't say "user X cannot insert rows where `region != 'us-east-1'`." For the latter you'd need a `CHECK` constraint, a `SECURE` view, or application-level enforcement outside Quack. That's a real ceiling on the model that today's documentation doesn't surface. And because session_id is permanent for the session's lifetime, there's no clean way to rotate or revoke credentials short of dropping the session — fine for a long-lived analytical session, sharp for one that outlives the credentials it was authorized with.

What I find genuinely interesting about the SQL-as-policy hook is what it enables. The dummy connection used to invoke the function has full DuckDB powers — which means an authentication function can call DuckDB's `httpfs` extension to validate a JWT against a JWKS endpoint, or join `auth_string` against a remote token table, or check a Postgres-attached identity database, or just compute an HMAC. Authorization policies become *queryable artifacts*: you can write tests for them in SQL, you can introspect them with `pg_proc`, you can hot-swap them without touching server code. This is not the standard RBAC story. It's something rarer and more powerful — and the most provocative direction to extend it is row-level security at the bind layer: a related hook that could *rewrite* queries, injecting `WHERE` predicates derived from the connection identity. That's the gap between "the protocol enforces this" and "the protocol can be used to build full multi-tenant DuckDB."

## Deployment at scale: gaps to expect from a preview

I spent a chunk of today putting Quack through its paces and the limitations I ran into are exactly the ones you'd expect from a pre-release extension. Some of them might bite at scale, and the maintainers have responded thoughtfully to issues so far, so I filed a few constructive ones:

| Issue                                                                                       | What it's about                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [#114](https://github.com/duckdb/duckdb-quack/issues/114) — `INSERT … RETURNING *` returns phantom data | The row inserts correctly on the server, but the local `RETURNING` projection reads default-initialized garbage from the chunk instead of the actual values. |
| [#115](https://github.com/duckdb/duckdb-quack/issues/115) — `CREATE VIEW` doesn't rewrite the client catalog name | View bodies are forwarded verbatim to the server, including the client-side `ATTACH` alias. The server has no such schema, so `CREATE VIEW r.v AS SELECT * FROM r.src` fails with `schema "r" does not exist`. Workaround: omit the alias inside the view body. |
| [#116](https://github.com/duckdb/duckdb-quack/issues/116) — no byte-level response size cap   | The only control is `quack_fetch_batch_chunks` (default 12), a *count* of `DataChunk`s. A single wide chunk can produce a multi-megabyte (or multi-gigabyte) response. This makes deployment behind Lambda/API Gateway/CloudFront brittle. |
| [#117](https://github.com/duckdb/duckdb-quack/issues/117) — no capability discovery for size negotiation | Even with a server-side cap, there's no way for a client to communicate its own intermediary's response-size limits. Borrowing VGI's pattern: a discovery endpoint that returns `Quack-Max-Request-Bytes` / `Quack-Max-Response-Bytes` headers would let any client negotiate. |
| Sticky sessions are mandatory (not yet filed)                                              | The cursor lives in the server process, and `connection_id` is buried inside the binary body — no HTTP header for L7 load balancers to route on. A `Quack-Session-Id` response/request header would unlock header-based stickiness across every LB on the market. |

A couple of other rough edges I noticed but haven't filed yet, partly because they overlap and partly because they're design discussions more than bug reports:

- **No in-flight query cancellation.** When a client TCP-disconnects, the server continues running the query to completion. There's no `Interrupt()` plumbed anywhere.
- **No idle session reaper.** A client that opens many sessions and never sends `DISCONNECT_MESSAGE` leaks them indefinitely.
- **`Invalid connection id` is the only error you get when a session is unknown.** Whether the cause is a server restart, a routing failure, or a forged session, the client sees the same string and doesn't auto-reconnect.

None of these are showstoppers for the intended use case of "two DuckDBs talking on a trusted network." All of them become relevant the moment Quack lands on a real deployment topology. They are exactly the kinds of things you discover when an extension goes from "the README example works" to "operators are running it in production." That's healthy preview-quality territory.

## Beyond results: shipping plan fragments

Here's where I think Quack is genuinely interesting beyond what it ships today.

The choice to reuse DuckDB's `BinarySerializer` for the wire format isn't an accident. That serializer was originally built to ship parts of *query plans* between pipelines for parallel execution. It already knows how to round-trip the full type system, including expression trees, logical operators, and physical plan fragments. When Quack reuses that machinery for `PREPARE_REQUEST` / `PREPARE_RESPONSE`, it's not just convenient — it's laying the groundwork for something more ambitious. It's a bet that DuckDB-to-DuckDB communication is going to need the same vocabulary that DuckDB-to-itself uses.

The natural next step is to send *not just queries, but query graph fragments*. Imagine a logical plan node that's serialized on the coordinator, shipped to a remote DuckDB, executed there, and whose results stream back into the local pipeline. That's the difference between "a remote table I can read" and "remote computation embedded into the optimizer's reasoning." Today's `quack_query()` table function is essentially the read-only special case. Quack's protocol surface is general enough to grow into the full thing without invalidating any of what's already there.

A piece of the puzzle for that future is sitting in [duckdb/duckdb#22347](https://github.com/duckdb/duckdb/pull/22347) — my own PR for `JOIN TRANSACTION`. It adds a way for one connection to hand off its in-progress transaction to another connection. The motivating use case is exactly the one that limits Quack today. Doing an `UPDATE` whose predicate runs on a worker connection — while the coordinator owns the writes — needs both connections inside a single transaction. Without something like `JOIN TRANSACTION`, Quack's lack of `UPDATE` / `DELETE` support (`PlanUpdate` and `PlanDelete` both throw `NotImplementedException` in `src/storage/quack_catalog.cpp`) isn't just about wiring up DDL; there's a deeper transactional question of how the remote scan and the remote write coordinate. With `JOIN TRANSACTION`, that question has a clean answer: spawn a worker connection, hand it the transaction id, let it do the scan, write back via the coordinator. The pieces start to compose.

I don't want to overstate this — the maintainers haven't said any of these are part of their roadmap and may have very different ideas. But the architectural shape is suggestive.

## Two friendly siblings

If I had to summarize the contrast in a sentence: **Quack is for federating DuckDBs cheaply; VGI is for embedding arbitrary computation flexibly.** Both will probably exist for a long time. The community is better off with both.

Both projects are also still very much in motion. Quack is a preview extension on day one; VGI's protocol surface is still growing as we wire in new function categories and planner integrations. So this is almost certainly not the last post I'll write about either of them — expect follow-ups as Quack works through the issues I filed (and whatever else surfaces in real deployments) and as VGI's RPC namespace evolves toward broader optimizer integration.

It's been a real pleasure working through Quack today. The code is small, the design is opinionated in the ways that matter, and the maintainers are clearly thinking about the right things. I'm rooting for it, and I'm curious to see how design pressure from real deployments shapes the protocol over the next few releases. If you've got a use case where DuckDB-to-DuckDB makes sense — federating across regions, exposing a private analytical store to internal tools, building a tiny analytics tier without standing up Postgres — kick the tires. `INSTALL quack FROM core_nightly;` is one line away.

And if you've got a use case where the computation isn't DuckDB at all — a Python ML model, a Rust scoring service, a generator that streams sequences, a non-DuckDB store you want to expose as a table — that's where VGI lives. VGI is currently in **limited preview for [Query.Farm](https://query.farm) customers**; if you'd like access, please [get in touch](/company/contact). We've also got a working demo of VGI integrated with [DuckLake](https://ducklake.select/) — pool of stateless VGI workers fronting a DuckLake-backed analytics tier — that we're happy to walk through on request.
