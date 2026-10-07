---
title: "Your Cloudflare data, in DuckDB"
description: "Query Cloudflare's Durable Objects, D1, and Analytics Engine from your browser, the Haybarn/DuckDB command line, or Python through Grainlift and ADBC."
pubDate: 2026-10-07
author: "Rusty Conover"
tags: ["Grainlift", "Cloudflare", "DuckDB", "ADBC", "WebAssembly"]
draft: false
heroImage: "/media/posts/query-cloudflare-from-duckdb/social.png"
leadVisual:
  src: "/blog/query-cloudflare-from-duckdb/overview.svg"
  alt: "Haybarn and Cupola in the browser, and Haybarn, DuckDB, Python, or other native ADBC applications, connect through the Grainlift ADBC driver. The browser clients use WebAssembly. Requests travel over HTTP(S) using vgi-rpc, and Apache Arrow results return to the client. A Cloudflare Worker and gateway Durable Object connect to application Durable Objects and D1 for reads and writes, or Analytics Engine for read-only queries."
  width: 760
  height: 626
  mobile:
    src: "/blog/query-cloudflare-from-duckdb/overview-mobile.svg"
    width: 400
    height: 872
---

[Grainlift](/products/grainlift/) now lets you query data stored in Cloudflare's [D1](https://www.cloudflare.com/products/d1/), [Durable Objects](https://www.cloudflare.com/products/durable-objects/), and [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) from Haybarn, DuckDB, Python, and other [ADBC applications](https://arrow.apache.org/adbc/current/). You can browse tables and run SQL. In Haybarn or DuckDB, you can also join the results with a local CSV or Parquet file. Choose the browser, terminal, or Python tab below to try it yourself.

D1 is Cloudflare's managed SQLite database service. A Durable Object combines application code with its own persistent state, which can include a SQLite database. Workers Analytics Engine stores events written by your application, such as page views and API requests.

The [Cloudflare gateway](https://github.com/Query-farm/grainlift-cloudflare) runs in a [Worker](https://www.cloudflare.com/products/workers/) in your Cloudflare account. Clients connect through the Grainlift driver using [ADBC](https://arrow.apache.org/adbc/current/), the Arrow Database Connectivity interface, and receive results in the columnar format used by [Apache Arrow](https://arrow.apache.org/). Durable Object and D1 connections support reads and writes; Analytics Engine connections are read-only.

In the browser demo, [Haybarn](/products/haybarn/) and the Grainlift ADBC driver both run as [WebAssembly](https://webassembly.org/). The [grainlift extension](https://github.com/Query-farm/duckdb-grainlift) has the Rust ADBC driver compiled in because browser WebAssembly cannot load native ADBC drivers at runtime. Your tab connects to the Cloudflare Worker over HTTPS and receives Arrow results.

Compiling an ADBC driver to WebAssembly isn't enough to make it work in a browser. Many drivers expect raw TCP sockets or access to the local filesystem, which the browser doesn't provide in the same way. Grainlift works here because its browser build uses [vgi-rpc](https://vgi-rpc.query.farm/) to send requests and receive Arrow results over HTTP(S).

Beyond this Cloudflare example, a [Grainlift server](https://github.com/Query-farm/grainlift) can run locally or on a remote machine and proxy calls to any ADBC driver installed there. That driver keeps its normal networking and filesystem access. A WebAssembly client can then query the databases behind those drivers through Grainlift without having to port each driver to the browser. We'll cover that setup in a future post.

## Start with a real database

The demo has a small coffee-shop database with six products, twelve orders, and a table where you can leave a note. The sample data lives in a Durable Object running on Cloudflare.

<figure class="demo-schema">
  <picture>
    <source media="(max-width: 600px)" srcset="/blog/query-cloudflare-from-duckdb/demo-schema-mobile.svg" width="400" height="602" />
    <img src="/blog/query-cloudflare-from-duckdb/demo-schema.svg" alt="Four tables in the demo database. Each order has a product_id that references products.id, so one product can appear in many orders. Products hold names, categories, and prices in cents; orders hold quantities and cities. Visitor notes and the demo reset information are separate tables with no foreign keys to the orders or products." width="760" height="416" loading="lazy" />
  </picture>
  <figcaption>Join <code>orders.product_id</code> to <code>products.id</code>. The notes and reset information live in separate tables.</figcaption>
</figure>

**Everyone uses the same disposable database.** Other readers can see and change anything you add. Every four hours, at 00:00, 04:00, 08:00, 12:00, 16:00, and 20:00 UTC, the database resets to its original sample data. Use made-up data only.

Choose where you'd like to try it. All three examples connect to the same database.

<div class="article-example-tabs" data-example-tabs>
  <div class="article-example-tabs__list" role="tablist" aria-label="Choose where to run the example" hidden>
    <button type="button" role="tab" id="demo-tab-browser" aria-controls="demo-browser" aria-selected="true" tabindex="0">Browser</button>
    <button type="button" role="tab" id="demo-tab-terminal" aria-controls="demo-terminal" aria-selected="false" tabindex="-1">Terminal</button>
    <button type="button" role="tab" id="demo-tab-python" aria-controls="demo-python" aria-selected="false" tabindex="-1">Python</button>
  </div>
  <section id="demo-browser" data-example-panel>

### Run in your browser

Click **Try it in your browser** below. The first run downloads the WebAssembly build of [Haybarn](/products/haybarn/), which can take a little while. It then connects without requiring a sign-in and runs the query. You can edit the SQL in the shell afterward.

<div class="grainlift-demo">

```sql
-- Install and load the Grainlift extension.
INSTALL grainlift FROM community;
LOAD grainlift;

-- Connect to the shared demo database as shop.
ATTACH IF NOT EXISTS 'grainlift+https://grainlift-cloudflare-public.rusty-bb6.workers.dev'
  AS shop (TYPE grainlift, target 'demo');

-- Calculate units sold and revenue for each product.
SELECT p.name, sum(o.quantity) AS units,
       round(sum(o.quantity * p.price_cents) / 100.0, 2) AS revenue
FROM shop.orders o
JOIN shop.products p ON p.id = o.product_id
GROUP BY p.name
ORDER BY revenue DESC;
```

</div>

To see the next reset time:

<div class="grainlift-demo">

```sql
SELECT description, next_reset_at FROM shop.demo_info;
```

</div>

  </section>
  <section id="demo-terminal" data-example-panel>

### Run the same query from your terminal

Native Haybarn and DuckDB use [adbc_scanner](/products/extensions/adbc_scanner/) to load the Grainlift ADBC driver. The browser's `grainlift` extension has that driver built in. Both connect to the same gateway and can query the same Durable Object database.

Install the [Grainlift driver from PyPI](https://pypi.org/project/adbc-driver-grainlift/) in a Python 3.13 or newer environment, then print the path to its native library:

```sh
python -m pip install adbc-driver-grainlift
python -c "import adbc_driver_grainlift; print(adbc_driver_grainlift.driver_path())"
```

Start Haybarn:

```sh
uvx haybarn-cli
```

Paste the SQL below, replacing `/path/to/grainlift-driver` with the path printed above. After connecting, the `SELECT` is exactly the same as in the browser:

```sql
-- Load the extension that connects Haybarn to ADBC drivers.
INSTALL adbc_scanner FROM community;
LOAD adbc_scanner;

-- Connect using the native Grainlift driver you installed.
ATTACH 'grainlift+https://grainlift-cloudflare-public.rusty-bb6.workers.dev'
  AS shop (TYPE adbc, driver '/path/to/grainlift-driver',
    entrypoint 'AdbcDriverGrainliftInit', "grainlift.target" 'demo');

SELECT p.name, sum(o.quantity) AS units,
       round(sum(o.quantity * p.price_cents) / 100.0, 2) AS revenue
FROM shop.orders o
JOIN shop.products p ON p.id = o.product_id
GROUP BY p.name
ORDER BY revenue DESC;
```

> **Why the setup differs**
>
> On the desktop, an ADBC driver manager loads a native driver library into the process using `dlopen()` or its platform equivalent. Browser WebAssembly can't load those native libraries, so the `grainlift` extension has the driver compiled in. Native Haybarn and DuckDB use `adbc_scanner` to load it separately. Once connected, the same `SELECT` works in both.

You can also use this native setup with the DuckDB CLI by replacing `uvx haybarn-cli` with `duckdb`.

  </section>
  <section id="demo-python" data-example-panel>

### Connect from Python or another ADBC application

Python can load the same native driver directly. Save this as `query_demo.py`. The comments at the top tell [uv](https://docs.astral.sh/uv/guides/scripts/#declaring-script-dependencies) which Python version and packages it needs:

```python
# /// script
# requires-python = ">=3.13"
# dependencies = ["adbc-driver-grainlift", "pyarrow"]
# ///

from adbc_driver_grainlift import dbapi

with dbapi.connect(db_kwargs={
    "grainlift.uri": "grainlift+https://grainlift-cloudflare-public.rusty-bb6.workers.dev",
    "grainlift.target": "demo",
}, autocommit=True) as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT name, price_cents FROM products ORDER BY name")
        print(cursor.fetch_arrow_table())
```

Then run it with [uv installed](https://docs.astral.sh/uv/getting-started/installation/):

```sh
uv run query_demo.py
```

uv selects a compatible Python version, downloading it if needed, and installs the dependencies in an isolated environment. The script connects directly to the remote database, so the query uses `products` without the `shop` alias that Haybarn adds locally. The result is a PyArrow table you can use in the rest of your Python code.

The [Grainlift ADBC driver is available on PyPI](https://pypi.org/project/adbc-driver-grainlift/) today. We also plan to distribute it through [dbc](https://docs.columnar.tech/dbc/). Other applications that can load an ADBC driver can use the same native library; the [driver documentation](https://github.com/Query-farm/grainlift/blob/v0.5.0/docs/python-driver.md) explains how to locate it and connect.

  </section>
</div>

## The same database in Cupola

For more space to work, [open the example queries in Cupola][cupola-demo], a browser-based SQL client with a table browser and SQL editor.

The link connects to the same shared database and opens five commented queries in a new editor tab: product revenue, the product list, sales by city, visitor notes, and the next reset time. Place your cursor in a query and click **Run** to execute it. No sign-in is required.

Add a note here, then query `visitor_notes` in Cupola to see it there. `grainlift_execute` runs the statement directly in the remote database, so this `INSERT` uses SQLite syntax:

<div class="grainlift-demo">

```sql
CALL grainlift_execute('shop', '
  INSERT INTO visitor_notes (id, note)
  VALUES (lower(hex(randomblob(16))), ''Hello from the blog'')
');

SELECT note, created_at
FROM shop.visitor_notes
ORDER BY created_at DESC
LIMIT 10;
```

</div>

The note stays in the database when you reload this page. Other clients can read it until someone deletes it or the database resets.

## Bring something of your own to the query

You can also join the remote tables with data you supply to DuckDB. This query defines sales targets in the browser and compares them with orders in the Durable Object:

<div class="grainlift-demo">

```sql
WITH targets(city, target_units) AS (
  VALUES ('Richmond', 10), ('Boston', 12), ('Portland', 15)
)
SELECT t.city, t.target_units,
       coalesce(sum(o.quantity), 0) AS units_sold,
       t.target_units - coalesce(sum(o.quantity), 0) AS units_to_go
FROM targets t
LEFT JOIN shop.orders o ON o.city = t.city
GROUP BY t.city, t.target_units
ORDER BY t.city;
```

</div>

The local data could also come from a CSV or Parquet file. DuckDB performs the join in your browser. Where the remote source supports it, Grainlift can send filters and column selections to that source to reduce the data returned.

## What sits between the query and the data

The demo uses two Durable Objects. [`GrainliftGateway`](https://github.com/Query-farm/grainlift-cloudflare/blob/e5aa021503cba5fc1f13280a57b46a0c7b80dadb/src/index.ts#L112) manages database connections and query results. [`BlogDemo`](https://github.com/Query-farm/grainlift-cloudflare/blob/e5aa021503cba5fc1f13280a57b46a0c7b80dadb/src/blog-demo.ts#L10) stores the coffee-shop tables. The same gateway can also connect to your application's Durable Objects, D1 databases, and Analytics Engine datasets.

<figure>
  <picture>
    <source media="(max-width: 600px)" srcset="/blog/query-cloudflare-from-duckdb/architecture-mobile.svg" width="400" height="858" />
    <img src="/blog/query-cloudflare-from-duckdb/architecture.svg" alt="A browser running Haybarn-WASM, Cupola, or a native ADBC client connects over HTTPS to a Cloudflare Worker. The Worker forwards requests to a gateway Durable Object that holds Grainlift sessions. It reaches an application Durable Object through SQL RPC methods, D1 through a database binding, and Analytics Engine through its read-only SQL API. Arrow results return to the client." width="760" height="590" loading="lazy" />
  </picture>
  <figcaption>The gateway keeps connection state. Your data stays in the Cloudflare service that owns it. The article's database is a separate application Durable Object.</figcaption>
</figure>

The Cloudflare Worker forwards HTTPS requests to the gateway Durable Object, which holds open sessions in memory. If Cloudflare unloads an idle gateway, those sessions are lost. The driver can open a new session for the next autocommit query – a query outside an explicit transaction. The data in your application's Durable Object stays intact.

The `target` option tells the gateway which data source to connect to. Along with running queries, it can return table names and column types so clients such as Cupola can show you what's available.

## Reaching an application's Durable Object

The gateway's Cloudflare Worker can't read another Durable Object's SQLite database directly. Your application needs to expose methods the gateway can call. You'll also need a binding, which lets the Worker access your application's Durable Object class.

The [`GrainliftSqlObject`](https://github.com/Query-farm/grainlift-cloudflare/blob/e5aa021503cba5fc1f13280a57b46a0c7b80dadb/src/grainlift-sql-object.ts#L23) base class provides those methods. They let the gateway read rows, read rows as objects, and run a batch of writes that either all succeed or all fail.

For example, a chat application might use one Durable Object per chat room, with each object storing that room's messages. Its `ChatRoom` class can extend [`GrainliftSqlObject`](https://github.com/Query-farm/grainlift-cloudflare/blob/e5aa021503cba5fc1f13280a57b46a0c7b80dadb/src/grainlift-sql-object.ts#L23) while keeping the application's existing methods:

```typescript
import { GrainliftSqlObject } from './grainlift-sql-object';

export class ChatRoom extends GrainliftSqlObject {
  // Your constructor creates the tables.
  // Your application methods continue to use this.ctx.storage.sql.
}
```

If the gateway has a binding named `CHATS` for that class, this connection selects the object named `general`:

```sql
ATTACH 'grainlift+https://your-gateway.workers.dev' AS room
  (TYPE grainlift, target 'durable_object',
   "cloudflare.durable_object.namespace" 'CHATS',
   "cloudflare.durable_object.name" 'general',
   bearer_token 'your-gateway-token');

SELECT author, body, sent_at
FROM room.messages
ORDER BY sent_at DESC
LIMIT 20;
```

This attaches **one chat room's database**. It does not query every object in `CHATS`. The `namespace` option identifies the collection of objects belonging to that class; the `name` option selects one of them. The gateway's permission rules decide which collections and objects a caller may access, and whether they may write. The `demo` target used earlier is a shortcut to one fixed object, so its Cupola link needs no extra connection options.

## Connecting D1 and Analytics Engine

D1 does not need an application class or remote methods. Configure a database binding on the gateway, grant the caller access, and use that binding's name in the connection options:

```sql
ATTACH 'grainlift+https://your-gateway.workers.dev' AS app
  (TYPE grainlift, target 'd1',
   "cloudflare.d1.database" 'DB',
   bearer_token 'your-gateway-token');

SELECT * FROM app.orders LIMIT 10;
```

Both D1 and SQLite-backed Durable Objects support atomic write batches. If you use a transaction that buffers writes until commit, reads made before the commit will not include those pending writes.

For Analytics Engine, the gateway calls Cloudflare's [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) using an account ID and an API token with Account Analytics Read permission. Each dataset appears as a table. You can supply credentials when you connect, or configure the gateway to provide them for callers you've granted access. The [setup instructions](https://github.com/Query-farm/grainlift-cloudflare#workers-analytics-engine) cover both options.

Analytics Engine retains its own SQL dialect and sampling behavior. To account for sampled events, this query sums `_sample_interval`:

```sql
-- With your Analytics Engine target attached as ae:
SELECT blob1, sum(_sample_interval) AS events
FROM ae.request_events
GROUP BY blob1
ORDER BY events DESC;
```

Replace `request_events` with your dataset's name. The query groups events by the value in `blob1`, one of Analytics Engine's text fields. What that field represents depends on the data your application writes.

Analytics Engine's remote SQL supports one dataset per query. DuckDB can do further work, including joins, on the returned rows.

## Put a gateway next to your data

The [Cloudflare gateway repository](https://github.com/Query-farm/grainlift-cloudflare) has deployment instructions, permission examples, and the Durable Object base class. Deploy the gateway in your account, configure bindings for the D1 databases and Durable Object classes you want it to reach, and grant callers access. For Analytics Engine, supply the account ID and API token described above. The gateway also supports sign-in through an OpenID Connect identity provider.

Our public worker is deliberately anonymous because it contains disposable sample data. Your gateway can use individual tokens or your identity provider, with permissions scoped to the databases each person needs.

Start with the [shared demo queries in Cupola][cupola-demo], or follow the [gateway's deployment instructions](https://github.com/Query-farm/grainlift-cloudflare) to connect your own Cloudflare data. For Python and other [ADBC applications](https://arrow.apache.org/adbc/current/), use the [Grainlift driver](https://github.com/Query-farm/grainlift).

[cupola-demo]: https://cupola.query-farm.services/?service=grainlift%2Bhttps%3A%2F%2Fgrainlift-cloudflare-public.rusty-bb6.workers.dev&target=demo&name=shop#sql=--+Explore+the+shared+coffee-shop+database.%0A--+Place+your+cursor+in+a+query+and+click+Run+to+execute+it.%0A%0A--+1.+Which+products+bring+in+the+most+revenue%3F%0A--+Join+orders+to+products+to+get+each+product%27s+price.%0ASELECT+p.name%2C+sum%28o.quantity%29+AS+units%2C%0A+++++++round%28sum%28o.quantity+*+p.price_cents%29+%2F+100.0%2C+2%29+AS+revenue%0AFROM+shop.orders+o%0AJOIN+shop.products+p+ON+p.id+%3D+o.product_id%0AGROUP+BY+p.name%0AORDER+BY+revenue+DESC%3B%0A%0A--+2.+Browse+the+six+products+and+their+prices+in+dollars.%0ASELECT+name%2C+category%2C+round%28price_cents+%2F+100.0%2C+2%29+AS+price%0AFROM+shop.products%0AORDER+BY+name%3B%0A%0A--+3.+How+many+units+have+been+ordered+in+each+city%3F%0ASELECT+city%2C+sum%28quantity%29+AS+units%0AFROM+shop.orders%0AGROUP+BY+city%0AORDER+BY+units+DESC%3B%0A%0A--+4.+Read+the+latest+notes+left+by+visitors+to+the+demo.%0ASELECT+note%2C+created_at%0AFROM+shop.visitor_notes%0AORDER+BY+created_at+DESC%0ALIMIT+10%3B%0A%0A--+5.+When+does+this+shared+database+reset%3F%0A--+The+sample+data+is+restored+and+visitor+notes+are+cleared+every+four+hours.%0ASELECT+description%2C+next_reset_at%0AFROM+shop.demo_info%3B%0A
