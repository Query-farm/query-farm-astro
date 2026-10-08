---
title: "SQL in your browser, code and data on your machine—with Iroh"
description: "Call VGI functions and query databases through Grainlift and ADBC, without deploying a public HTTP endpoint or managing TLS certificates."
pubDate: 2026-10-08
author: "Rusty Conover"
tags: ["Iroh", "vgi-rpc", "VGI", "Grainlift", "ADBC", "WebAssembly", "Apache Arrow"]
draft: false
heroImage: "/media/posts/iroh-vgi-rpc/social.png"
heroImageAlt: "SQL in your browser, code and data on your machine. Haybarn and WebAssembly connect through an encrypted Iroh relay to VGI functions or Grainlift ADBC databases, with Apache Arrow carrying the data."
leadVisual:
  src: "/blog/iroh-vgi-rpc/architecture.svg"
  alt: "A Haybarn browser client reaches an Iroh endpoint through an encrypted relay connection. On your computer, VGI exposes tables and functions through a bridge, or Grainlift exposes a database through its native ADBC driver. Both use vgi-rpc and Apache Arrow."
  width: 1000
  height: 560
  mobile:
    src: "/blog/iroh-vgi-rpc/architecture-mobile.svg"
    width: 400
    height: 860
---

You have a function running on your laptop. A colleague wants to call it from a SQL query in their browser. The function is ready. Sharing it can mean finding somewhere to deploy it, giving it a hostname, and setting up HTTPS. That's a fair amount of work for “can you try this?”

[Iroh](https://www.iroh.computer/) support in [vgi-rpc](https://vgi-rpc.query.farm/) gives us another way to make that connection. Your worker can stay on your machine. A client connects to its cryptographic endpoint ID, and Iroh handles finding a network path between them. You don't need to put the worker behind a public HTTP endpoint or configure port forwarding on your router.

[VGI](/vgi/) exposes tables, functions, and application logic to [Haybarn](/products/haybarn/) and [DuckDB](https://duckdb.org/). [Grainlift](/products/grainlift/) exposes databases through [ADBC](https://arrow.apache.org/adbc/current/). Both use vgi-rpc to carry calls and [Apache Arrow](https://arrow.apache.org/) data, and both can use Iroh as their transport.

A browser can call your functions or query a database through a driver installed on your computer. The code, driver, and database connection stay where they already work. We'll use Python for the example below; VGI has [SDKs for several languages](/vgi/languages/).

<nav class="article-projects" aria-label="Projects in this article">
  <p class="article-projects__label">Projects in this article</p>
  <ul role="list">
    <li><a href="https://www.iroh.computer/"><img src="/blog/iroh-vgi-rpc/iroh-wordmark.svg" alt="Iroh" width="93" height="32" style="width: 93px" /></a></li>
    <li><a href="https://vgi-rpc.query.farm/"><img src="/media-kit/logo/mark.svg" alt="" width="32" height="32" />vgi-rpc</a></li>
    <li><a href="/vgi/"><img src="/vgi/vgi-logo.webp" alt="" width="32" height="32" />VGI</a></li>
    <li><a href="/products/grainlift/"><img src="/grainlift/grainlift-mark.svg" alt="" width="32" height="32" />Grainlift</a></li>
    <li><a href="/products/haybarn/"><img src="/products/haybarn/haybarn-mark.svg" alt="" width="32" height="32" />Haybarn</a></li>
    <li class="article-projects__arrow"><img src="/vgi/icons/apache-arrow-chevrons.svg" alt="" width="32" height="28" /><span><a href="https://arrow.apache.org/adbc/current/">ADBC</a> / <a href="https://arrow.apache.org/">Apache Arrow</a></span></li>
    <li><a href="https://webassembly.org/"><img src="/blog/query-cloudflare-from-duckdb/webassembly-logo.svg" alt="" width="32" height="32" />WebAssembly</a></li>
  </ul>
</nav>

## Connect to an identity

An ordinary service URL tells a client where to go. An [Iroh endpoint ID](https://docs.iroh.computer/concepts/endpoints) identifies the peer it wants to reach. The ID is a public key; the peer proves that it holds the corresponding secret key when the connection is established.

This also takes TLS certificate management off your plate. For the worker's Iroh connection, there's no domain certificate to obtain, install, or renew. Iroh still uses TLS to encrypt traffic and [authenticates peers using their endpoint keys](https://docs.rs/iroh/latest/iroh/tls/index.html).

Iroh uses address discovery and relays to help peers find each other. Native clients can establish a direct connection when the network allows it, with a relay available when it doesn't. Keeping the same secret key preserves the endpoint's identity across restarts and changes of address.

For vgi-rpc, the address looks like this:

```text
iroh://<endpoint-id>
```

There is also an HTTP-over-Iroh form:

```text
httpi://<endpoint-id>
```

That second form lets an existing HTTP worker use Iroh for the connection. The worker listens on loopback, while the native [`vgi-iroh-bridge`](https://github.com/Query-farm/vgi-rpc-rust/tree/main/vgi-iroh-bridge) accepts Iroh connections and forwards requests to it. The bridge works independently of the worker's language. We'll use that arrangement below.

The machine still needs to be running and able to reach the network. An endpoint ID doesn't make a sleeping laptop answer queries. It does let us separate the worker's identity from a public hostname and a particular IP address.

## The browser takes the relay path

**Iroh connections from the browser currently go through a relay.** Browsers don't expose the UDP sockets needed for Iroh's direct connections, as the [Iroh browser documentation](https://docs.iroh.computer/languages/wasm-browser) explains.

The connection is encrypted between the browser and the remote Iroh endpoint. The relay cannot read the calls or their results. In the bridge setup, encryption ends at the bridge; the separate hop from the bridge to the worker stays on loopback.

<figure>
  <picture>
    <source media="(max-width: 600px)" srcset="/blog/iroh-vgi-rpc/paths-mobile.svg" width="400" height="690" />
    <img src="/blog/iroh-vgi-rpc/paths.svg" alt="A browser client always reaches the remote Iroh endpoint through a relay. A native client can connect directly, or fall back to a relay. In both cases, application traffic is encrypted between the client and the endpoint." width="1000" height="470" loading="lazy" decoding="async" />
  </picture>
  <figcaption>Two ways to reach the same endpoint. A relay forwards the encrypted traffic; it doesn't execute the function or query.</figcaption>
</figure>

The browser can reach a worker behind a home router without that worker becoming a public HTTPS service. The worker still has access to its installed packages, native libraries, local files, and database drivers.

Relay location and network round trips still affect latency, especially for operations that make many small calls. Native connections can avoid the relay when a direct path works.

## Call a Python function from SQL

Let's expose a shipping-price function through VGI. It takes a column of parcel weights and returns a column of prices in cents. We'll use a simple example rate: $3.99 plus $1.25 per kilogram.

Save this as `shipping.py`. This is the whole worker:

```python
from typing import Annotated

import pyarrow as pa
import pyarrow.compute as pc
from vgi import Param, Returns, ScalarFunction, Worker
from vgi.catalog import Catalog, Schema


class ShippingQuote(ScalarFunction):
    @classmethod
    def compute(
        cls, weight_kg: Annotated[pa.Int64Array, Param()]
    ) -> Annotated[pa.Int64Array, Returns()]:
        # An example rate: $3.99 plus $1.25 per kilogram, in cents.
        return pc.add(399, pc.multiply(weight_kg, 125))


class ShippingWorker(Worker):
    catalog = Catalog(
        name="shipping",
        schemas=[Schema(path=["main"], functions=[ShippingQuote])],
    )
```

Start it with [uv](https://docs.astral.sh/uv/getting-started/installation/), which supplies Python and the required package:

```sh
uvx --python 3.13 --from 'vgi-python[http]==0.43.1' \
  vgi-serve shipping.py --http --host 127.0.0.1 --port 9401 \
  --iroh-issuer blog-demo
```

The function runs in a normal Python process. Its arguments and results are Arrow arrays, so it can process a batch of weights at once. You could replace the example formula with your existing pricing library, a model, or an API client. The [VGI scalar-function tutorial](/vgi/docs/python/tutorial/scalar/) covers how to define these functions.

Next, download the `vgi-iroh-bridge` archive for your operating system from the [v0.31.2 release](https://github.com/Query-farm/vgi-rpc-rust/releases/tag/v0.31.2). Extract it and put its `bin/vgi-iroh-bridge` executable on your `PATH`. In another terminal, run:

```sh
vgi-iroh-bridge --ephemeral --http-upstream http://127.0.0.1:9401
```

The bridge prints its endpoint ID on the first line. Keep both processes running. `--ephemeral` creates a temporary identity, so restarting the bridge gives you a new ID. For an endpoint you intend to keep using, use the bridge's `--secret-key-file` option to persist its identity.

Now open Haybarn with `uvx haybarn-cli`. Replace `<endpoint-id>` with the ID printed by the bridge and run:

```sql
INSTALL vgi FROM community;
LOAD vgi;

-- Attach the Python worker's shipping catalog over Iroh.
ATTACH 'shipping'
  (TYPE vgi, LOCATION 'httpi://<endpoint-id>');

-- These input rows belong to this query. Python calculates the prices.
SELECT weight_kg,
       shipping.shipping_quote(weight_kg) AS price_cents
FROM (VALUES (1::BIGINT), (2::BIGINT), (5::BIGINT)) AS parcels(weight_kg);
```

| weight_kg | price_cents |
| ---: | ---: |
| 1 | 524 |
| 2 | 649 |
| 5 | 1024 |

Haybarn discovers the function through VGI, sends its input as Arrow data, and receives Arrow results. Iroh carries the requests to the bridge, which forwards them to the worker. You can run the client on another machine using the same endpoint ID.

This example accepts callers without an allowlist and only calculates prices from the values they supply. The endpoint ID is public. Before exposing private data or functions with side effects, add an [authorization policy](#decide-what-each-peer-can-do). Stop the demo with **Ctrl-C** in each server terminal.

## Use the same function from WebAssembly

The same SQL works in an Iroh-enabled [WebAssembly build of Haybarn](/products/haybarn/). The Python function stays on the worker machine; the browser supplies its input and receives the result through vgi-rpc.

The browser integration is available in [`@query-farm/vgi-rpc-iroh-browser`](https://www.npmjs.com/package/@query-farm/vgi-rpc-iroh-browser). Its Haybarn adapter connects the database worker to the browser's Iroh transport. The repository includes a [complete browser example](https://github.com/Query-farm/vgi-rpc-rust/tree/main/vgi-rpc-iroh-browser/demo), including the worker, bridge, and page setup.

> **For application developers:** install the Iroh adapter in the application and use Haybarn 1.5.5-rc4 or later. The adapter uses `SharedArrayBuffer`, so the page must be [cross-origin isolated](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated) with appropriate COOP and COEP headers. The page's `resolveIrohTarget` callback controls which endpoints SQL may contact. See the [browser integration guide](https://github.com/Query-farm/vgi-rpc-rust/tree/main/vgi-rpc-iroh-browser) for the setup; a standard DuckDB-Wasm editor won't have this transport installed.

You could use this function to add shipping prices to a CSV loaded in the browser. The same arrangement could let a query call a model on your workstation without compiling its dependencies to WebAssembly. Or a VGI table function could turn an existing API into rows you can join with other data.

VGI defines what the client can call. Iroh makes the worker reachable.

## Grainlift uses it too

The [previous article](/blog/native-adbc-in-your-browser/) showed how Grainlift lets a browser use an existing native ADBC driver. Iroh gives that gateway another way to accept connections.

The gateway still loads the driver and connects to the database. Your database credentials stay there. The browser's Grainlift extension sends ADBC operations through vgi-rpc, now using an Iroh connection:

```sql
INSTALL grainlift FROM community;
LOAD grainlift;

-- The gateway must already have an analytics target and authorize this peer.
ATTACH 'grainlift+iroh://<gateway-endpoint-id>'
  AS analytics (TYPE grainlift, target 'analytics');
```

[Grainlift's Iroh configuration](https://github.com/Query-farm/grainlift#transports) maps client endpoint IDs to principals and principals to the targets they can access. An existing [ADBC connection profile](https://arrow.apache.org/adbc/current/format/connection_profiles.html) can still supply the target's driver and database settings.

[Cupola](https://cupola.query-farm.services/) already accepts `grainlift+iroh://` service URLs. Its **Settings** show the browser's endpoint ID, which you can authorize on the gateway. Native applications can use the same gateway through the [Grainlift ADBC driver](https://pypi.org/project/adbc-driver-grainlift/); Haybarn or DuckDB on the command line loads that driver with [`adbc_scanner`](/products/extensions/adbc_scanner/).

Cupola's current Iroh integration is for Grainlift. For VGI's `httpi://` connections, use the Haybarn integration described above, including its adapter setup and endpoint authorization.

## Decide what each peer can do

Iroh authenticates the peer's endpoint key. Your application still decides what that peer may do.

In the Python example, `--iroh-issuer blog-demo` puts the identity verified by the loopback bridge into the worker's call context. The worker can then check an allowlist or apply an application policy. Grainlift uses its target-permission mapping to decide which databases the peer may access.

The bridge-facing worker should stay on loopback, or on a separately protected connection with explicit trusted-proxy configuration. The [VGI Iroh guide](https://github.com/Query-farm/vgi-python/blob/main/docs/how-to/iroh.md) covers that trust boundary. A public request header claiming an endpoint ID is not proof of identity.

Iroh's public relays are shared and rate-limited, with no uptime guarantee. For production, consider a managed or self-hosted relay. The [relay documentation](https://docs.iroh.computer/concepts/relays) covers those choices.

## What this makes possible

A colleague can try the functions you already have running before you decide where to host them. They use SQL from their own machine or an Iroh-enabled browser application; you keep developing in the environment where your dependencies work.

The same approach works for a VGI worker beside a large local dataset, a process using a workstation's GPU, or a Grainlift gateway on a machine with access to a database. You choose the functions, tables, and database targets to expose, along with who may use them. The client receives the results it asks for without needing a copy of the worker's environment.

That's the part I'm excited about. The function can stay on the laptop. The database driver can stay next to the database. And a browser can work with both.
