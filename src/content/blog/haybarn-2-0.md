---
title: "Haybarn 2.0: DuckDB 2.0 with a much faster start in the browser"
description: "Haybarn 2.0 moves our DuckDB distribution to DuckDB 2.0.0, with HTTP/2 for remote reads, a long list of fixes, and a Wasm build that starts much faster."
showDescription: false
pubDate: 2026-11-05
updatedDate: 2026-11-06
author: "Query Farm Team"
tags: ["Haybarn", "DuckDB", "DuckDB-Wasm", "WebAssembly", "Extensions", "Release"]
draft: false
heroImage: "/media/posts/haybarn-2-0/social.png"
heroImageAlt: "Haybarn 2.0: DuckDB 2.0 with a much faster start in the browser. A paper-collage barn takes threads from a stack of layered strips and sends them out to discs, rings and small tiles, in ochre, moss green, terracotta and umber."
leadVisual:
  src: "/media/posts/haybarn-2-0/haybarn-artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "Install Haybarn 2.0"
  pitch: "Every install path, supported platform and client version, with steps for verifying the release artifacts."
  href: "/products/haybarn/install"
  cta: "Go to the install guide"
  repo: "https://github.com/Query-farm-haybarn/haybarn"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li><strong>Extensions:</strong> Haybarn builds nearly everything DuckDB publishes for 2.0, and the gaps are short enough to list below.</li>
      <li><strong>Fixes:</strong> a database-invalidating clock bug, a CPU-spinning wait, a Python 3.14 crash at exit, and browser fixes including one that logged <code>Authorization</code> headers to the console.</li>
      <li><strong>Browser startup:</strong> five extensions loaded in 0.9 seconds on an Apple M3, against 3.4 for DuckDB-Wasm on the same machine. Haybarn's multithreaded build loads extensions too, which DuckDB-Wasm's can't.</li>
      <li><strong>Next:</strong> DuckDB's calendar has 2.0.1 on November 18, with several of these fixes already on its branch.</li>
    </ul>
  </div>
</aside>

[Haybarn](/products/haybarn/) is Query.Farm's distribution of [DuckDB](https://duckdb.org/): the same engine, SQL and file format, with its own signed extension builds, packages and a small set of engine changes. Haybarn 2.0 moves all of that to [DuckDB 2.0.0](https://github.com/duckdb/duckdb/releases/tag/v2.0.0), across the CLI, libraries, extensions and the Python, Node, Rust, Go, JDBC, ODBC and WebAssembly clients.

The current build is **rc11** for the engine and native clients, and **rc12** for WebAssembly, whose only change from rc11 is faster startup in the web shell. Packages keep the release candidate label for now, so the commands below use the `rc` channels.

To try it without installing anything, open the [Haybarn shell](https://shell.haybarn.query.farm): Haybarn-Wasm in a full-page terminal, where `INSTALL` and `LOAD` work for core and community extensions as they do on the desktop.

## What Haybarn adds

<figure class="article-art"><img src="/media/posts/haybarn-2-0/art-patches.webp" alt="" width="1440" height="400" loading="lazy" decoding="async" /></figure>


Haybarn isn't only a rebuild. It carries a set of changes on top of DuckDB, and all of them moved to 2.0.0 for this release. The main ones, each explained in more detail on [How Haybarn differs](/products/haybarn/differences):

**Reading remote data.** These are in Haybarn's build of httpfs, and DuckDB's has none of them.

- **HTTP/2.** A multithreaded scan carries its range reads as streams on one connection, where DuckDB opens a new HTTP/1.1 connection for each. [More](/products/haybarn/differences#faster)
- **A file that changes mid-read costs no extra bytes.** Range reads send the file's ETag as an `If-Match` precondition, so the server answers 412 without sending the range. DuckDB downloads the range first, then compares. [More](/products/haybarn/differences#conditional-reads)
- **Compression where it's safe.** Listings and API calls negotiate gzip, brotli or zstd, while range reads stay uncompressed. [More](/products/haybarn/differences#compression)
- **`Retry-After` is honoured** when a server or S3 throttles, instead of a fixed back-off. [More](/products/haybarn/differences#retry-after)
- **Cancelling a query stops its downloads.** Interrupting a query aborts the HTTP requests in flight, for every method, and any retry back-off, instead of waiting them out. [More](/products/haybarn/differences#cancellation)

**Installs you can reproduce.**

- **Version pins stick.** `INSTALL … VERSION` is recorded, and a later `INSTALL` or `UPDATE EXTENSIONS` won't silently replace it. The pin shows as `pinned_version` in `duckdb_extensions()`. [More](/products/haybarn/differences#pinning)
- **Extensions from npm.** An extension installed as an npm package loads straight from `node_modules`, with no network access at query time. [More](/products/haybarn/differences#node-modules)

**The tools you already have.**

- **PostgreSQL clients connect.** Fixes to `pg_catalog` let Npgsql, pgjdbc, DBeaver, Grafana and other PostgreSQL-protocol tools connect and introspect. [More](/products/haybarn/differences#pg-catalog)
- **Named arguments work with column inputs.** `FROM t, f(t.x, opt := 5)` failed to bind in DuckDB, because the named argument was treated as another input column. [More](/products/haybarn/differences#binder)

## Bug fixes

<figure class="article-art"><img src="/media/posts/haybarn-2-0/art-fixes.webp" alt="" width="1440" height="400" loading="lazy" decoding="async" /></figure>


When we started working on Haybarn 2.0, we noticed the DuckDB 2.0 release had a number of sharp edges we needed to file down, across the engine and every client. Each fix with a badge links to its upstream PR: <svg class="fix-key" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/></svg> means it's merged, <svg class="fix-key" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg> means the PR is still open, and no badge means the fix is only in Haybarn for now.

### In the engine

- **A clock stepping backwards could invalidate the database.** Clocks can step backwards on some virtual machines, and in Safari's pthreads. One backwards step failed the running statement with `Information loss on integer cast: value -19` and invalidated the database. Elapsed intervals now clamp to zero. <a class="fix-badge is-merged" href="https://github.com/duckdb/duckdb/pull/28245"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/></svg>Upstream #28245</a>
- **The thread collecting a query's result spun at full CPU** until the workers finished, and in WebAssembly it could deadlock a `LOAD`. It now waits. On a query with a long tail, process CPU went from 5.99 to 4.32 seconds. With 48 threads and 48 connections, throughput rose 13 to 15%. The tradeoff: `ORDER BY` of 20 million rows at 48 threads got about 10% slower in median wall time. <a class="fix-badge is-merged" href="https://github.com/duckdb/duckdb/pull/27738"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/></svg>Upstream #27738</a>
- **Extensions built with MSVC could crash when loading** on a Windows engine built with clang-cl, because of how the compiler pooled string literals. Haybarn's Windows release turns that pooling off, and the build fails if the flag goes missing. The upstream issue is [#27857](https://github.com/duckdb/duckdb/issues/27857).

### Over HTTP

- **Responses with a header line over 8 KiB failed.** Since late October, GitHub's release downloads send a 9.2 KB `content-security-policy` line, so reading a Parquet file from a GitHub release failed on the httplib backend with `Failed to read connection`. Haybarn raised the limit to 16 KiB, and DuckDB separately raised its own to 64 KiB. <a class="fix-badge is-merged" href="https://github.com/duckdb/duckdb/pull/27825"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/></svg>Upstream #27825</a>

### In Python

- **Python 3.14 could crash or hang at exit** while daemon threads were still scanning object or Arrow data. Engine threads now refuse to enter the interpreter once it's shutting down. In our stress test, failures per 300 runs went from 13 and 39 to none on the two affected cases. DuckDB's Python client has since fixed this separately. <a class="fix-badge is-merged" href="https://github.com/duckdb/duckdb-python/pull/719"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/></svg>Upstream #719</a>

### In the browser (Wasm)

- **The HTTP client's HEAD requests logged their headers to the console,** including `Authorization` and secrets' extra headers. <a class="fix-badge is-open" href="https://github.com/duckdb/duckdb-wasm/pull/2257"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>Open upstream #2257</a>
- **Header values were URL-encoded,** so a quoted `ETag` in `If-Match` never matched, and a server pinning range reads answered 412. <a class="fix-badge is-open" href="https://github.com/duckdb/duckdb-wasm/pull/2297"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>Open upstream #2297</a>
- **`LOAD` of a signed extension over about 4 MiB hung forever** on the multithreaded bundle. Hashing the signature started one thread per MiB and ran out of pool threads.
- **A worker script that failed to download hung startup.** In fault injection, 6 of 6 instances hung before the fix and 0 of 20 after. Dead workers now also reject pending requests instead of leaving them waiting.
- **Above a 2 GiB heap, the HTTP client read and wrote the wrong memory,** because pointers were treated as signed. The upstream issue is [duckdb-wasm#2258](https://github.com/duckdb/duckdb-wasm/issues/2258).
- **`TIMESTAMPTZ` columns always came back in UTC,** whatever `SET TimeZone` said. The upstream issue is [duckdb-wasm#2251](https://github.com/duckdb/duckdb-wasm/issues/2251).

## Download and use it

Pick how you'd like to use it. The commands use the release candidate channels, and we ran every example except ODBC against the published packages.

<div class="article-example-tabs article-example-tabs--many article-example-tabs--boxed" data-example-tabs>
  <div class="article-example-tabs__list" role="tablist" aria-label="Choose how to use Haybarn" hidden>
    <button type="button" role="tab" id="use-tab-cli" aria-controls="use-cli" aria-selected="true" tabindex="0">CLI</button>
    <button type="button" role="tab" id="use-tab-python" aria-controls="use-python" aria-selected="false" tabindex="-1">Python</button>
    <button type="button" role="tab" id="use-tab-node" aria-controls="use-node" aria-selected="false" tabindex="-1">Node.js</button>
    <button type="button" role="tab" id="use-tab-browser" aria-controls="use-browser" aria-selected="false" tabindex="-1">Browser</button>
    <button type="button" role="tab" id="use-tab-rust" aria-controls="use-rust" aria-selected="false" tabindex="-1">Rust</button>
    <button type="button" role="tab" id="use-tab-go" aria-controls="use-go" aria-selected="false" tabindex="-1">Go</button>
    <button type="button" role="tab" id="use-tab-java" aria-controls="use-java" aria-selected="false" tabindex="-1">Java</button>
    <button type="button" role="tab" id="use-tab-odbc" aria-controls="use-odbc" aria-selected="false" tabindex="-1">ODBC</button>
  </div>
  <section id="use-cli" data-example-panel>

### The CLI

The quickest way to run the CLI is through npm or uv:

```sh
# With Node
npx haybarn@rc

# With Python
uvx haybarn-cli==2.0.0rc11
```

You can also download a binary from [GitHub Releases](https://github.com/Query-farm-haybarn/haybarn/releases/tag/haybarn-v2.0.0-rc11) and verify it first. On Apple Silicon:

```sh
BASE=https://github.com/Query-farm-haybarn/haybarn/releases/download/haybarn-v2.0.0-rc11
curl -LO $BASE/haybarn_cli-osx-arm64.zip
curl -LO $BASE/SHA256SUMS

shasum -a 256 -c SHA256SUMS --ignore-missing
gh attestation verify haybarn_cli-osx-arm64.zip --repo Query-farm-haybarn/haybarn

unzip haybarn_cli-osx-arm64.zip
./haybarn
```

The file names for other platforms follow the same pattern: `haybarn_cli-linux-amd64.zip`, `haybarn_cli-linux-arm64.zip` and `haybarn_cli-windows-amd64.zip`. The [security page](/products/haybarn/security) covers GPG signatures.

From there, it's the DuckDB you know. Extensions come from Haybarn's repositories without any configuration:

```sql
INSTALL spatial;
LOAD spatial;
INSTALL rapidfuzz FROM community;
LOAD rapidfuzz;

SELECT extension_name, extension_version, installed_from
FROM duckdb_extensions()
WHERE extension_name IN ('spatial', 'rapidfuzz');
```

#### Pin an extension version

Haybarn remembers a version you pin, and `UPDATE EXTENSIONS` leaves it alone:

```sql
FORCE INSTALL a5 FROM community VERSION '462e4d95d8';
UPDATE EXTENSIONS;
-- a5 | community | PINNED | 462e4d95d8 | 462e4d95d8
```

  </section>
  <section id="use-python" data-example-panel>

### Python

`--pre` picks up the release candidate:

```sh
pip install --pre haybarn
```

```python
import haybarn as duckdb

con = duckdb.connect()
con.install_extension("spatial")
con.load_extension("spatial")
print(con.sql("SELECT ST_AsText(ST_Point(1, 2))").fetchall())
```

For third-party code that imports `duckdb` directly, add `import haybarn.compat` before it, and `import duckdb` resolves to Haybarn.

  </section>
  <section id="use-node" data-example-panel>

### Node.js

```sh
npm install @haybarn/node-api@rc
```

```js
import { DuckDBInstance } from '@haybarn/node-api';

const instance = await DuckDBInstance.create(':memory:');
const conn = await instance.connect();
const result = await conn.runAndReadAll('SELECT version() AS v, 42 AS n');
console.log(result.getRowObjects());
```

  </section>
  <section id="use-browser" data-example-panel>

### In the browser

```sh
npm install @haybarn/haybarn-wasm@rc
```

```js
import * as duckdb from '@haybarn/haybarn-wasm';

const dist = 'https://unpkg.com/@haybarn/haybarn-wasm@2.0.0-rc12/dist';
const bundle = await duckdb.selectBundle({
  base: {
    mainModule: `${dist}/duckdb-base.wasm`,
    mainWorker: `${dist}/duckdb-browser-base.worker.js`,
  },
});

// A browser won't start a cross-origin worker script directly, so wrap it.
const workerUrl = URL.createObjectURL(
  new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
);
const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), new Worker(workerUrl));
await db.instantiate(bundle.mainModule);
await db.open({});

// Download, hash and compile in parallel, before the first LOAD.
await db.prefetchExtensions(['spatial']);

const conn = await db.connect();
await conn.query('LOAD spatial');
const result = await conn.query('SELECT ST_AsText(ST_Point(1, 2)) AS point');
console.log(result.toArray().map((row) => row.toJSON()));
```

If you're moving from 1.5, the bundles are now called `base` and `threads`, and the `threads` bundle needs a [cross-origin isolated](https://web.dev/articles/coop-coep) page.

  </section>
  <section id="use-rust" data-example-panel>

### Rust

```sh
cargo add haybarn@1.20000.0-rc.11
```

```rust
use haybarn::{Connection, Result};

fn main() -> Result<()> {
    let conn = Connection::open_in_memory()?;
    let version: String = conn.query_row("SELECT version()", [], |row| row.get(0))?;
    println!("{version}");
    Ok(())
}
```

By default the build downloads a prebuilt Haybarn library. Add `-F bundled` to compile the engine from source instead. Code written for `duckdb-rs` can keep its imports by renaming the dependency, as the [crate's README](https://github.com/Query-farm-haybarn/haybarn-rust) shows.

  </section>
  <section id="use-go" data-example-panel>

### Go

```sh
go get github.com/Query-farm-haybarn/haybarn-go/v2@v2.20000.0-rc.11
```

```go
package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/Query-farm-haybarn/haybarn-go/v2"
)

func main() {
	db, err := sql.Open("haybarn", "")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	var version string
	if err := db.QueryRow("SELECT version()").Scan(&version); err != nil {
		log.Fatal(err)
	}
	fmt.Println(version)
}
```

It needs cgo and a C compiler. The driver also registers the name `duckdb`, so code written for `duckdb-go` only needs its import path changed.

  </section>
  <section id="use-java" data-example-panel>

### Java

Add the JDBC driver from Maven Central:

```xml
<dependency>
  <groupId>farm.query.haybarn</groupId>
  <artifactId>haybarn_jdbc</artifactId>
  <version>2.0.0-rc11</version>
</dependency>
```

```java
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class Main {
    public static void main(String[] args) throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:haybarn::memory:");
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT version()")) {
            rs.next();
            System.out.println(rs.getString(1));
        }
    }
}
```

Coming from DuckDB's driver, the URL prefix becomes `jdbc:haybarn:` and the package becomes `farm.query.haybarn`. The class names, such as `DuckDBConnection`, stay the same.

  </section>
  <section id="use-odbc" data-example-panel>

### ODBC

Download the driver for your platform from the [ODBC release page](https://github.com/Query-farm-haybarn/haybarn-odbc/releases/tag/haybarn-v2.0.0.0-rc11). It registers as `Haybarn Driver`, with a default DSN called `Haybarn`, so you connect with `DSN=Haybarn` or `Driver={Haybarn Driver}`.

  </section>
</div>

### Moving from DuckDB

Database files move in both directions. We wrote a file with `duckdb==2.0.0`, read and changed it with Haybarn, and read the changes back with DuckDB.

DuckDB-signed extensions don't load in Haybarn by default, because Haybarn trusts its own key. Run `INSTALL` again to get the Haybarn builds, into their own directory at `~/.haybarn/extensions`. To use another repository, add it explicitly with [its own pinned key](/products/haybarn/compatibility).

Coming from Haybarn 1.5, treat it as a DuckDB major version upgrade: extensions need 2.0 builds, and it's worth testing your application against the new engine.

## WebAssembly startup

<figure class="article-art"><img src="/media/posts/haybarn-2-0/art-startup.webp" alt="" width="1440" height="400" loading="lazy" decoding="async" /></figure>


We [wrote about Haybarn-Wasm's startup time](/blog/duckdb-wasm-startup-time) on the 1.5 line. That work has moved to 2.0, and DuckDB-Wasm now has a 2.0 build, so we can compare them directly. This is the same engine version, on one machine, loading the same five extensions (icu, autocomplete, spatial, iceberg and ducklake), each from its own project's repository. Times are from page start, and every bar uses the same scale:

<!-- bars: stack -->

| From page start | DuckDB-Wasm | Haybarn-Wasm | Haybarn-Wasm with prefetch |
|---|---:|---:|---:|
| Single-threaded, first query result | 0.34 s | 0.28 s | 0.26 s |
| Single-threaded, five extensions loaded | 3.42 s | 2.19 s | 0.87 s |
| Multithreaded, first query result | 1.02 s | 0.52 s | 0.50 s |
| Multithreaded, five extensions loaded | Can't load extensions | 3.06 s | 1.61 s |

That missing DuckDB-Wasm bar isn't a slow result. DuckDB-Wasm's multithreaded build can't load extensions at all. Every `LOAD` we tried failed, including parquet, json, icu and autocomplete on their own, with `could not be loaded:` and no reason given. The same `LOAD`s work on its single-threaded build and on Haybarn-Wasm's multithreaded one. With DuckDB-Wasm, a page that needs extensions has to give up threads.

These are medians on an Apple M3, so slower machines will take longer, as the Graviton numbers in the earlier post show. Measured the same way, Haybarn-Wasm 1.5.6-rc2, from before this work began, took 2.86 seconds single-threaded and 3.46 seconds multithreaded.

Three things account for most of the difference, and the [earlier post](/blog/duckdb-wasm-startup-time#where-the-time-went) has the details:

- **Lazy linking.** The engine exports tens of thousands of symbols to extensions, and emscripten's startup code walked all of them. Haybarn-Wasm resolves each one when it's first used.
- **No copies.** Extensions no longer get copied onto the WebAssembly heap one byte at a time before linking.
- **`prefetchExtensions()`.** Without it, each `LOAD` downloads, hashes and compiles its extension before the next one starts. With it, the worker does all of that in parallel, hashes with WebCrypto, and compiles while downloading, so the `LOAD`s themselves are short. On the single-threaded build, the five `LOAD`s took about 170 ms after a prefetch of about 440 ms.

Prefetch is an API call you add, so upgrading alone gets you the plain Haybarn-Wasm bars. Include the extensions your extensions load: iceberg loads avro and parquet, so our prefetch list had seven names.

The [Haybarn shell](https://shell.haybarn.query.farm) itself started using prefetch in rc12, and its time to the prompt went from 2.25 to 1.38 seconds on the threaded build in Chromium, and from 1.82 to 1.16 on the single-threaded build. Not every browser gains, though: Firefox stayed at 3.4 seconds. Safari doesn't keep compiled WebAssembly between visits, so there every visit pays the full compile.

## Extension availability

Haybarn builds and signs its own copy of each extension, so what matters is what you'd lose by switching. These are the differences from DuckDB's repositories for 2.0.0, as of November 5. Anything not listed is published by both:

| Difference | Extensions |
|---|---|
| Core extensions not in Haybarn | lance, motherduck, ui, vortex |
| Community extensions not in Haybarn yet | agent_runs, ai, bigquery, duckdb_delta_sharing, duckhts, ducksassy, h3, hudi, lance_conversion, miint, oxedi, pdf, querio_jev, raster, redis_adbc, semantic_views, tidbfs, units |
| No WebAssembly build in Haybarn | mssql, mssql_ducklake, zarr |
| No macOS or single-threaded WebAssembly build | polyglot |
| No Windows x86-64 build | evalexpr_rhai |
| No Windows MinGW build | duckdb_geoip_rs, gatekeeper, webmacro |
| Only in Haybarn | crawler, erpl_web, [grainlift](/products/grainlift/), waddle, and pdal on Windows x86-64 |

If you depend on something in the first two rows, stay on DuckDB for now, or [open an issue](https://github.com/Query-farm-haybarn/haybarn-community-extensions/issues) so we know it matters to you.

One difference doesn't show in that table. For DuckDB 2.0 [we distribute our extensions from our own repository](/blog/duckdb-2-query-farm-repository), so about 30 of them are stubs in DuckDB's community repository, including its evalexpr_rhai and webmacro builds on the platforms above. In Haybarn, `INSTALL rapidfuzz FROM community` gets the real extension.

**Update, November 6:** [VGI](/vgi/) was in the "Only in Haybarn" row when this post went out. It now also runs in DuckDB 2.0, installed from the Query.Farm repository; see [Install VGI](/vgi/getting-started/#install-vgi). A few capabilities, such as named arguments in a correlated `LATERAL` call, still need Haybarn's engine.

Some platforms differ too. DuckDB publishes extensions for macOS Intel and the WebAssembly `mvp` bundle, and core extensions for Windows ARM64 and Linux musl. Haybarn 2.0 doesn't target macOS Intel, Windows ARM64 or `mvp`, and while its Linux musl CLIs still ship, they have only a handful of community extensions and no core ones. The Linux x86-64 CLI needs a CPU with AVX2 (x86-64-v3).

## DuckDB 2.0.1 is close

<figure class="article-art"><img src="/media/posts/haybarn-2-0/art-calendar.webp" alt="" width="1440" height="400" loading="lazy" decoding="async" /></figure>


DuckDB's [release calendar](https://duckdb.org/release_calendar) has the 2.0.1 merge freeze on November 11 and the release on November 18, and the [`v2.0-cyanoptera`](https://github.com/duckdb/duckdb/tree/v2.0-cyanoptera) branch is already busy with backports. The clock, spinning and header line fixes above are on it, along with our changes to [parser error offsets](https://github.com/duckdb/duckdb/pull/27835), [SQL parameter formatting](https://github.com/duckdb/duckdb/pull/27834) and [HTTP PUT content types](https://github.com/duckdb/duckdb/pull/27967).

Haybarn ships on DuckDB's cadence, so once 2.0.1 is out we'll rebase onto it and rebuild the extensions. Patches that have landed upstream will drop out of Haybarn's stack, which is how we want it. Three API additions for extension authors are still open upstream and stay in Haybarn until they land: [runtime filter opt-out](https://github.com/duckdb/duckdb/pull/28090), [virtual columns for `DELETE RETURNING`](https://github.com/duckdb/duckdb/pull/28089) and [`HTTPParams::Clone()`](https://github.com/duckdb/duckdb/pull/28088).

## How we measured

- **Startup:** medians of seven runs on an Apple M3, in headless Chromium with a fresh browser each run, with extensions from each project's CDN. We compared `@duckdb/duckdb-wasm` 1.33.1-dev114.0 (DuckDB v2.0.0) with `@haybarn/haybarn-wasm` 2.0.0-rc12. One single-threaded prefetch run took 4.3 seconds, against 0.78 to 0.91 for the rest, and we don't know why.
- **Availability:** a HEAD request for every extension on every platform, against both projects' repositories. This shows that a file is published, not that it loads.
- **Tutorials:** we ran every example except ODBC against the published packages, on an Apple Silicon Mac.
