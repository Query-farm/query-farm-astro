---
title: "Why we built VGI instead of waiting for Arrow Flight 2.0"
description: "Arrow Flight moves large datasets between applications, but is awkward to use from a browser. Building an alternative taught us why its future is likely to split across several projects."
pubDate: 2026-10-19
author: "Rusty Conover"
tags: ["Apache Arrow", "Arrow Flight", "ADBC", "VGI", "RPC"]
draft: false
heroImage: "/media/posts/why-we-built-vgi-instead-of-waiting-for-arrow-flight-2-0/social.png"
heroImageAlt: "Why we built VGI instead of waiting for Arrow Flight 2.0. Abstract flowing curves in ochre and green on a cream background."
leadVisual:
  src: "/blog/why-we-built-vgi-instead-of-waiting-for-arrow-flight-2-0/flight-to-vgi.svg"
  alt: ""
  width: 720
  height: 240
  mobile:
    src: "/blog/why-we-built-vgi-instead-of-waiting-for-arrow-flight-2-0/flight-to-vgi-mobile.svg"
    width: 400
    height: 220
---

I don't expect an Arrow Flight 2.0 that fixes the design problems people have spent years working around. By 2.0, I mean a substantial protocol redesign, separate from Arrow's library version numbers.

My reading is that there isn't enough shared appetite to drive that restart. In the [May 2024 discussion that led to the Flight SQL evolution issue](https://github.com/apache/arrow-rs/issues/5731#issuecomment-2132428915), contributors wanted a cleaner design but lacked the time to lead it. The [evolution issue remains open](https://github.com/apache/arrow/issues/41840).

Existing deployments need compatibility. Applications wanting a common database interface have ADBC. Browser clients need a different transport. Each group has reasons to improve its part of Flight, but less reason to coordinate a replacement for all of it.

I came to this through building [Airport](/products/extensions/airport/), the DuckDB extension that connects to Arrow Flight services. Airport makes remote services available as tables and functions inside local SQL queries. Building it exposed expensive metadata discovery, missing integration contracts, and transport constraints. [VGI-RPC](https://vgi-rpc.query.farm/) and [VGI](/vgi/) grew from those lessons.

## ADBC has taken over much of the database connectivity job

ADBC, or Arrow Database Connectivity, gives applications a common interface for querying databases, binding parameters, reading metadata, and ingesting data. Drivers adapt that interface to individual databases while preserving typed, columnar results.

That takes over much of what people wanted Flight to deliver. But the distinction matters: **ADBC specifies the client API; Flight SQL specifies communication between client and server.** An ADBC driver can use Flight SQL, an existing database protocol, or an embedded database. Apache's [ADBC FAQ](https://arrow.apache.org/adbc/current/faq.html#how-do-adbc-and-arrow-flight-sql-differ) describes them as complementary.

Applications can adopt a shared API without requiring every database to adopt a new wire protocol. My expectation is that this reduces pressure for a comprehensive Flight successor. ADBC doesn't cover the arbitrary remote function calls and streaming transformations we wanted to build, though. Those needs remained.

## Flight grew through extensions

Flight's basic model is useful: discover data, obtain a ticket, and exchange Arrow batches. Applications can define their own commands and actions, but must agree on what those payloads mean. Over time, Flight added more shared behavior:

| Requirement | How Flight extended its surface |
| --- | --- |
| Transform batches while receiving input | `DoExchange` provides simultaneous streams in both directions. |
| Retrieve results from long-running work | `PollFlightInfo` adds polling, progress, and access to available endpoints. |
| Manage result lifetimes | Endpoint expiration, `RenewFlightEndpoint`, and `CancelFlightInfo` add lifecycle operations. |
| Fetch data from object storage | HTTP download locations let clients fetch results directly. |
| Query a database | Flight SQL defines queries, prepared statements, metadata, transactions, and sessions. |

These additions to [Flight](https://arrow.apache.org/docs/format/Flight.html) and [Flight SQL](https://arrow.apache.org/docs/format/FlightSql.html) solve problems while preserving existing deployments. They also accumulate complexity. Even [preparing and executing a statement](https://arrow.apache.org/docs/format/FlightSql.html#sequence-diagrams) involves several RPC methods before result retrieval. In the [evolution issue's design notes](https://github.com/apache/arrow/issues/41840#issuecomment-2134174783), David Li identifies excessive round trips, duplicated operations, and substantial implementation boilerplate.

## Large catalogs exposed the serialization problem

Flight uses Arrow IPC for tabular data and Protobuf for much of the surrounding conversation. In `ListFlights`, each entry is a Protobuf `FlightInfo` containing descriptors, endpoints, and an Arrow-serialized schema.

Imagine a server exposing tens of thousands of flights whose definitions rarely change. It should be able to prepare the catalog's encoded response when the catalog changes, then reuse it. Instead, discovery can spend CPU time and allocations describing the same data repeatedly, before a client requests a single result batch.

The standard C++/Python serving path requires `FlightInfo` objects. The [gRPC implementation](https://github.com/apache/arrow/blob/main/cpp/src/arrow/flight/transport/grpc/grpc_server.cc#L253) converts each entry into Protobuf and sends it for serialization on every listing. Reusing a `FlightInfo` can save Arrow schema encoding, but the outer conversion and encoding remain. Python even provides a [`FlightInfo.serialize()` method](https://arrow.apache.org/docs/python/generated/pyarrow.flight.FlightInfo.html#pyarrow.flight.FlightInfo.serialize), yet `list_flights` doesn't accept its output as a prepared response.

The still-open [Arrow issue #31208](https://github.com/apache/arrow/issues/31208), filed in 2022, describes this exact problem. In the [discussion](https://github.com/apache/arrow/issues/31208#issuecomment-1378083864), David Li explains that caching serialized bytes requires extra work to make gRPC accept them. Protobuf itself can be cached; the missing piece is a supported path from that cache to the response.

A cache of catalog definitions saves lookup work. A cache of objects saves construction. A cache of encoded bytes also saves serialization. A large catalog is a dataset in its own right and deserves the same attention as query results.

Work on Flight's internals continues. The open [proposal to access raw byte buffers through gRPC's generic API](https://github.com/apache/arrow/issues/37937) includes a [2026 proof of concept](https://github.com/apache/arrow/issues/37937#issuecomment-3859296997) for `DoGet` and `DoPut`. That work targets the existing transport, though it addresses a different path from catalog listings.

## Airport showed us what was missing

Airport needed to discover schemas and functions, bind arguments, request columns, push filters toward the data, and exchange batches with remote code. We used Flight's actions and `DoExchange` to build those contracts.

For catalogs, Airport [packages serialized `FlightInfo` entries](https://github.com/Query-farm/airport/blob/v1.5/src/storage/airport_catalog_api.cpp#L498) into compressed, cacheable payloads, delivered inline or through a URL and validated with content hashes. That lets servers prepare reusable responses and clients retain them. It also requires another catalog format, using MessagePack, and additional client logic.

After building that integration, I wanted the contracts to belong to the framework. I also wanted workers to run as local subprocesses or network services that browsers could call. That led to two layers:

- **VGI-RPC** carries typed method calls, results, and streams using Arrow IPC, independently of any query engine.
- **VGI**, the Vector Gateway Interface, defines catalogs, functions, and their execution lifecycle on top of VGI-RPC.

DuckDB was the starting point. VGI now has clients for [DataFusion](https://github.com/Query-farm/vgi-datafusion), [SQLite](https://github.com/Query-farm/vgi-sqlite), [Spark](https://github.com/Query-farm/vgi-spark), and [Polars](https://github.com/Query-farm/vgi-polars). Workers expose a shared interface that each client integrates into its host's execution model.

## The browser exposes the transport problem

Flight is built on gRPC. Browser JavaScript doesn't expose the HTTP/2 framing and trailer handling native gRPC expects, which is why [gRPC-Web](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-WEB.md) exists.

Its official JavaScript implementation supports unary calls and some server streaming, but [not client or bidirectional streaming](https://github.com/grpc/grpc-web#streaming-support). That leaves a gap for Flight's upload and exchange operations. The open [JavaScript Flight client request](https://github.com/apache/arrow-js/issues/106) has tracked this need since 2020; the [Rust/WASM request](https://github.com/apache/arrow-rs/issues/5880) documents native networking dependencies that complicate another route into the browser.

Flight's HTTP download locations help fetch results, but leave its control and exchange protocol on gRPC.

VGI-RPC carries Arrow batches in ordinary HTTP request and response bodies. Its [TypeScript client](https://github.com/Query-farm/vgi-rpc-typescript#browser-usage) can call a worker directly from a browser, with authentication and cross-origin configuration handled by the server. Exchanges advance through continuation requests, with state tokens connecting each turn. That fits browser HTTP without a gRPC translation service.

## Quack starts with DuckDB on both ends

DuckDB's [Quack protocol](https://duckdb.org/2026/05/12/quack-remote-protocol) belongs in this picture. It connects DuckDB instances in a client-server setup, and its authors explicitly describe learning from Flight SQL. I see it as another example of progress through a focused protocol, without waiting for a universal Flight successor.

Quack uses HTTP and client-driven request and response. [DuckDB-Wasm can speak it from a browser](https://duckdb.org/2026/05/12/quack-remote-protocol#http-based), so browser access isn't unique to VGI. Both designs show that efficient database communication can fit the HTTP interface browsers already provide.

Quack also shows that using one serialization system doesn't have to mean using Arrow. Its [requests and responses use DuckDB's internal serialization](https://duckdb.org/docs/current/quack/overview#quack-in-a-nutshell), preserving DuckDB's types without converting through Arrow. That is a sensible choice when DuckDB sits at both ends. VGI instead pays the cost of mapping different engines onto Arrow and shared function contracts so workers can serve more than one engine. Neither serialization choice, by itself, guarantees reusable cached responses.

For access to a remote DuckDB database, Quack is a natural starting point. VGI addresses a different need: exposing custom computation and catalogs to DuckDB, DataFusion, SQLite, Spark, and Polars. Quack strengthens my expectation that Flight's successors will specialize around their users rather than converge on one protocol.

## What VGI gets right

VGI-RPC separates the application contract from the transport. A worker can start behind a pipe and later be exposed over HTTP, using Arrow batches for arguments and results in both cases.

That consistency extends to VGI's [catalog operations](/vgi/docs/python/how-to/catalog-interface/#how-catalog-methods-dispatch). Metadata uses the same serialization system as the data, and [`catalog_version`](/vgi/docs/python/api/vgi-catalog/#vgi.catalog.catalog_interface.CatalogInterface.catalog_version) lets clients detect changes. Arrow alone doesn't provide caching: the implementation still has to support reusable payloads and respect each caller's view of the catalog.

VGI also defines the [function lifecycle](/vgi/docs/concepts/lifecycle/) for scalar functions, table producers, streaming transformations, and aggregates. Workers can [accept pushed-down filters and report statistics](/vgi/docs/python/how-to/pushdown-and-statistics/), helping DuckDB avoid unnecessary scans and plan joins. Airport taught us these agreements would exist somewhere. Putting them in the framework makes them reusable across clients.

## Where VGI makes tradeoffs

**Lockstep exchanges fit DuckDB's callback model.** A [vectorized function callback](https://duckdb.org/docs/current/clients/cpp#createvectorizedfunction) receives a chunk of arguments and fills a result vector before returning. VGI follows that pattern: send a batch, receive its result, then advance the exchange. The same structure fits browser HTTP.

The tradeoff appears when an application needs independent streams. VGI-RPC [doesn't provide full-duplex exchanges](https://vgi-rpc-python.query.farm/#limitations), so a service that continuously sends and receives independently needs a different design. Small batches over HTTP can also spend much of their time waiting for round trips. Larger batches reduce that overhead but increase buffering and delay.

**Some state remains tied to a worker.** An open database cursor or a model in GPU memory cannot travel in a state token. VGI-RPC's [sticky sessions](https://vgi-rpc-python.query.farm/sticky-sessions-spec/) keep such objects in one process, without replication or persistence. Losing that process loses the session.

**Arrow doesn't settle protocol compatibility.** Schemas describe data, but method changes, errors, logs, and state still need rules. VGI-RPC owns that complexity in its [wire protocol](https://vgi-rpc.query.farm/wire-protocol/); an Arrow reader alone cannot interpret the conversation.

**Each engine still needs careful integration.** SQLite virtual tables, Spark's distributed scans, and Polars' lazy execution expose different capabilities. Check function types and optimizer support in the relevant client; the [DataFusion capability matrix](https://github.com/Query-farm/vgi-datafusion#what-maps-and-what-does-not) illustrates those differences. Existing Flight clients also need adapting: sharing Arrow doesn't make the protocols interchangeable.

## Choose the part of Flight you need to replace

| What you need | Where I would start |
| --- | --- |
| A common database API with Arrow results | ADBC, potentially using its Flight SQL driver. |
| DuckDB access to an existing Flight service | Airport. |
| Access to a remote DuckDB database from DuckDB, including DuckDB-Wasm | Quack. |
| Typed Arrow RPC from a browser | VGI-RPC, if lockstep exchanges fit the workload. |
| External tables and functions in a query engine or dataframe library | VGI, after checking the relevant client's capabilities. |
| Independent streams in both directions | Flight's `DoExchange`. |

Building Airport gave us a reason to keep Arrow, make browsers ordinary clients, and turn our DuckDB integration work into an interface other engines could use. VGI-RPC and VGI are that next step for us. I expect Flight's broader future to follow several such paths, rather than converge on one replacement everyone calls 2.0.
