---
title: "HTTP Server for DuckDB 2.0: a server that belongs to its database"
description: "DuckDB’s HTTP Server extension now owns servers per database, requires authentication for remote access, supports TLS, and reports startup failures clearly."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "HTTP"]
extensions: ["httpserver"]
draft: false
showDescription: false
heroImage: "/media/posts/httpserver-for-duckdb-2/social.png"
heroImageAlt: "HTTP Server for DuckDB 2.0: a server that belongs to its database. A local database sits within a dashed boundary, with a lock at the entrance and separate request cards outside."
leadVisual:
  src: "/media/posts/httpserver-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "HTTP Server"
  pitch: "Serve SQL results over HTTP from DuckDB, with per-database lifetime, explicit browser origins and optional TLS."
  href: "/products/extensions/httpserver/"
  cta: "Explore the extension"
  extension: "httpserver"
  installNote: "These changes require the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/httpserver"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Each DuckDB database owns its server. Closing the database stops the server, and failed starts leave the session usable.</li>
      <li>Listening beyond loopback requires authentication by default. Cross-origin browser requests must be explicitly allowed.</li>
      <li>TLS certificate and key settings enable HTTPS. Port zero selects a free port, and startup returns only after the listener is ready.</li>
    </ul>
  </div>
</aside>

Starting an HTTP server from SQL is convenient. So is closing the database and assuming the server has gone away. The second operation needs to be as dependable as the first.

The [HTTP Server extension](/products/extensions/httpserver/) runs SQL submitted through HTTP and returns JSON, CSV or XML. For DuckDB 2.0, we changed who owns the server, made startup failures ordinary SQL errors, and tightened the defaults around network and browser access. There is also native TLS support.

## Start it, query it, stop it

The local workflow remains small. In a DuckDB session with the extension loaded:

```sql
CREATE TABLE readings(sensor VARCHAR, value DOUBLE);
INSERT INTO readings VALUES ('north', 21.5), ('south', 23.0);

SELECT httpserve_start('127.0.0.1', 8080, '') AS status;
```

<div class="query-result" role="region" aria-label="Result: status" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>status</th></tr></thead>
    <tbody>
      <tr><td>HTTP server started on 127.0.0.1:8080</td></tr>
    </tbody>
  </table>
</div>

Keep that session open. From another terminal:

```sh
curl --get 'http://127.0.0.1:8080/' \
  --data-urlencode 'q=SELECT * FROM readings ORDER BY sensor'
```

The default response format is newline-delimited JSON. A request can select CSV, JSONCompact or XML through `default_format`. Stop the server from the original DuckDB session:

```sql
SELECT httpserve_stop();
```

The server now lives in the database's own state. Two database instances can run separate servers, and closing either database stops its server. Calling `httpserve_stop()` twice is harmless. Trying to stop the server through one of its own HTTP queries is refused, avoiding a request handler trying to join its own thread.

That ownership replaces the process-level lifetime assumptions that caused shutdown and reuse problems. The [Python regression tests](https://github.com/Query-farm/httpserver/blob/36444f1f7c31006eca69f1a8e2c32075ad7e528c/test/python/httpserver_test.py) cover independent databases, closing a served database, and repeated start/stop cycles.

## A successful start means it is listening

Earlier startup code could return before the socket was ready, or mishandle a failure to bind. `httpserve_start` now binds and waits for readiness before reporting success. If another process owns the port, or the address cannot be bound, the call raises an error and the DuckDB session remains usable.

For a test or local application, let the operating system select the port:

```sql
SELECT httpserve_start('127.0.0.1', 0, '');
```

The returned message includes the actual port. This avoids choosing a supposedly unused fixed port and losing a race to another process. A second start on the same database reports that its server is already running; it doesn't replace the existing listener.

## Remote access needs a credential

An empty credential is now accepted only for loopback listeners, such as `127.0.0.1` and `localhost`. This call is refused by default:

```sql
SELECT httpserve_start('0.0.0.0', 8080, '');
```

Supply a credential to listen on a network interface. A value containing `:` selects HTTP Basic authentication; another nonempty value is an API key supplied in the `X-API-Key` header. The modes are separate: a Basic credential isn't accepted as an API key, and vice versa.

There is an explicit `httpserver_allow_unauthenticated_remote` override for applications that intentionally provide their own access boundary. Existing deployments that relied on an empty remote credential will need a configuration change when upgrading.

The server executes the SQL its clients submit. Authentication grants access to that SQL interface; it doesn't make the endpoint read-only or restrict clients to the query shown above. Starting a listener also counts as external access, so `enable_external_access = false` prevents it.

## Let a browser call it deliberately

A local SQL endpoint can be reached by more than the script that started it. Browser requests therefore need their own checks. The update rejects cross-origin requests unless their origin is allowed and checks the Host header for a loopback listener to help prevent DNS rebinding.

To permit a particular application, set its exact origin before starting the server:

```sql
SET httpserver_allowed_origins = 'https://dashboard.example.com';
```

Multiple origins can be comma-separated. The response's CORS headers reflect the permitted origin. Authentication is still required when configured; allowing an origin does not supply a credential. The client must send its auth header explicitly.

This is a behavior change for browser-based clients that depended on permissive CORS responses. Configure the actual application origin rather than assuming a successful command-line request proves a browser is allowed too.

## HTTPS from the same start function

Set both PEM paths before startup to enable TLS:

```sql
SET httpserver_tls_cert = '/path/to/server-cert.pem';
SET httpserver_tls_key = '/path/to/server-key.pem';
```

The same `httpserve_start` call then creates an HTTPS listener. Missing one path, or failing to load the certificate, raises an error. Authentication on a plain HTTP listener does not encrypt the traffic; use TLS when the connection needs transport protection.

The [main change](https://github.com/Query-farm/httpserver/commit/45e7317) and [loopback follow-up](https://github.com/Query-farm/httpserver/commit/36444f1) are on the reviewed `v2.0` branch. The [Query Farm repository guide](/blog/duckdb-2-query-farm-repository/) covers installation for DuckDB 2.0. The [extension reference](/products/extensions/httpserver/) documents the request formats and settings.
