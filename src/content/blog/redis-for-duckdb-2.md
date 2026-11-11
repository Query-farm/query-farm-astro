---
title: "Redis for DuckDB 2.0: typed replies, pooled connections and timeouts"
description: "Redis for DuckDB 2.0 adds lists and maps, cursor-based scans, pipelined commands, credential-scoped connection reuse, and interruptible network waits."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Redis"]
extensions: ["redis"]
draft: false
showDescription: false
heroImage: "/media/posts/redis-for-duckdb-2/social.png"
heroImageAlt: "Redis for DuckDB 2.0: typed replies, pooled connections and timeouts. Three differently colored keys connect to separate cached value rows, each paired with a small timeout clock."
leadVisual:
  src: "/media/posts/redis-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "redis"
  pitch: "Read and write Redis from DuckDB with typed results, named secrets, cursor-based scans and configurable timeouts."
  href: "/products/extensions/redis/"
  cta: "Explore the extension"
  extension: "redis"
  installNote: "These changes require the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/redis"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>New list and map results preserve commas, empty strings and missing values. Scan-page functions expose the Redis cursor.</li>
      <li>Commands are pipelined within a DuckDB chunk, and pooled connections are separated by credentials and Redis database.</li>
      <li>Connection and reply waits time out after 30 seconds by default. Queries can be interrupted, and network access respects DuckDB’s external-access setting.</li>
    </ul>
  </div>
</aside>

A Redis list containing `'x,y'`, an empty string and a missing value cannot be represented faithfully by joining everything with commas. Once the separators are mixed into the data, the SQL query has to guess what Redis actually returned.

The [Redis extension](/products/extensions/redis/) now gives DuckDB proper lists and maps for those replies. Its 2.0 update also changes how commands travel to the server: reads and writes use each row's arguments, commands can share a connection and a network round trip, and a stalled server no longer means an unbounded wait by default.

## Keep the shape of the reply

Start with a local Redis server and a named secret. This example assumes Redis is listening without a password on `127.0.0.1:6379`:

```sql
CREATE SECRET local_redis (
    TYPE redis,
    host '127.0.0.1',
    port '6379'
);

SELECT redis_set('article:comma', 'x,y', 'local_redis');
SELECT redis_set('article:empty', '', 'local_redis');
SELECT redis_del('article:missing', 'local_redis');

SELECT redis_mget_list(
    ['article:comma', 'article:missing', 'article:empty'],
    'local_redis'
) AS values;
```

<div class="query-result" role="region" aria-label="Result: values" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>values</th></tr></thead>
    <tbody>
      <tr><td>['x,y', NULL, '']</td></tr>
    </tbody>
  </table>
</div>

The list has three elements. The first contains a comma, the second is absent in Redis, and the third is present but empty. No parsing convention is needed to tell them apart.

The new functions give the other structured replies corresponding DuckDB types:

| Function | Result |
| --- | --- |
| `redis_mget_list` | A list of values in key order, with NULL for missing keys |
| `redis_lrange_list` | The requested part of a Redis list |
| `redis_hgetall_map` | A map from hash fields to values |
| `redis_scan_page` | A struct containing the next cursor and a list of keys |
| `redis_hscan_page` | A struct containing the next cursor and a map of entries |

The existing `redis_lrange_table` also reports the actual indexes in the Redis list. Asking for positions 1 through the end returns indexes starting at 1; a negative start is resolved against the list's length.

These changes build on the October reply-parser fix. The extension reads RESP replies as structured values and reports Redis error replies as errors. It no longer relies on splitting a received string into something that resembles the requested result.

## A scan is a page, not a promise to finish

`SCAN` is useful when a keyspace is too large for a single `KEYS` request. The new page function exposes the cursor rather than hiding it:

```sql
SELECT page.cursor, page.keys
FROM (
    SELECT redis_scan_page('0', 'article:*', 100, 'local_redis') AS page
);
```

Start with cursor `'0'`, then pass the returned cursor into the next call. Stop when the server returns `'0'` again. The count is a hint to Redis, not a fixed page size. A caller needs to handle empty pages and, if keys can change during a scan, Redis's usual scan semantics.

For a command without a dedicated wrapper, `redis_command` accepts its arguments as a list:

```sql
SELECT redis_command(['PING'], 'local_redis') AS reply;
```

<div class="query-result" role="region" aria-label="Result: reply" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>reply</th></tr></thead>
    <tbody>
      <tr><td>PONG</td></tr>
    </tbody>
  </table>
</div>

Strings and integers come back as text, nil becomes NULL, and array replies are encoded as JSON. Use the typed wrappers when they fit; use `redis_command` when the command itself is the point.

## Reuse connections without reusing somebody else's login

Opening a socket and authenticating for every row is expensive even when Redis responds quickly. The new implementation pipelines commands for rows in a chunk, grouped by secret, then maps each reply back to its row. It also keeps idle connections in a pool owned by the DuckDB database.

The pool key includes the host, port, username, password and database index. A connection authenticated for one credential cannot be handed to a different credential just because both secrets point at the same server. The [integration tests](https://github.com/Query-farm/redis/blob/cc077cc8138f3511114ca1288577409cb5b09332/test/sql/redis_server_features.test) exercise wrong passwords, Redis ACL users and separate database indexes, alongside 5,000-row read and write batches.

`redis_command` does not return its connection to the reusable pool. A command such as `SELECT 1` changes Redis connection state; discarding that connection prevents the change from leaking into the next ordinary lookup.

Pipelining reduces network round trips. It does not turn a SQL query into a Redis transaction. If a command fails after earlier writes have reached Redis, those writes have already happened.

## Give a slow server a deadline

The default timeout is now 30,000 milliseconds, covering connection establishment and each wait for reply data. Change it for the session:

```sql
SET redis_timeout_ms = 2000;
```

Or set `timeout_ms` on a particular Redis secret. That value takes precedence over the session setting. Zero permits an indefinite wait, though the query remains interruptible. The timeout is not a total deadline for an entire query over many rows.

Secrets also accept `username` for Redis ACL authentication and `db` for the database index. A password is optional for servers that don't require one. Missing credentials and missing secrets now produce distinct errors. All Redis network functions refuse to run when `enable_external_access` is false.

The [November update](https://github.com/Query-farm/redis/commit/defb449) contains the pooling, typed-result and timeout changes. These are the changes on the reviewed `v2.0` branch. The [Query Farm repository guide](/blog/duckdb-2-query-farm-repository/) covers installation for DuckDB 2.0, with complete signatures on the [Redis extension page](/products/extensions/redis/).
