---
title: "Radio for DuckDB 2.0: listen again, and see what the queue lost"
description: "Radio fixes missed wakeups and repeated prepared statements, exposes dropped messages, and preserves text and binary WebSocket payloads in DuckDB."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Streaming"]
extensions: ["radio"]
draft: false
showDescription: false
heroImage: "/media/posts/radio-for-duckdb-2/social.png"
heroImageAlt: "Radio for DuckDB 2.0: listen again, and see what the queue lost. Radio waves feed a queue of colored message tiles, a return loop, and a stack of received rows."
leadVisual:
  src: "/media/posts/radio-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "radio"
  pitch: "Send and receive messages through WebSockets, Redis Pub/Sub or local loopback, and inspect the queues from SQL."
  href: "/products/extensions/radio/"
  cta: "Explore the extension"
  extension: "radio"
  installNote: "These changes require the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/radio"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Prepared statements run against the current subscription state on every execution. A completed first execution no longer makes later calls silently empty.</li>
      <li><code>radio_listen</code> checks queued messages before waiting, and subscription statistics expose unread messages dropped from a full receive queue.</li>
      <li>Text and binary payloads retain their bytes. Network transports respect external-access settings; local loopback remains available without a network.</li>
    </ul>
  </div>
</aside>

A listener that occasionally sleeps through an arriving message is difficult to trust. So is a prepared query that works once and then returns no rows because the extension remembered that it was done.

Those were two of the problems behind the [Radio extension's](/products/extensions/radio/) DuckDB 2.0 update. Radio connects SQL to WebSockets and Redis Pub/Sub, with a local loopback transport for testing. The new work fixes the lifetime of execution state, closes gaps in waiting for messages, and makes receive-queue losses visible.

## Run the same prepared query twice

A table function has setup work it can do when DuckDB binds a statement, and work it must do for each execution. Radio had put some of the latter in the former. A `done` flag could survive the first execution of a prepared statement, making the second execution return nothing.

The update moves that state to the execution. This small example uses only the local loopback transport:

```sql
CALL radio_subscribe('loopback://article');

PREPARE received AS
    SELECT count(*) AS message_count FROM radio_received_messages();

EXECUTE received;
```

<div class="query-result" role="region" aria-label="Result: message_count" tabindex="0">
  <div class="query-result__label">result · first execution</div>
  <table>
    <thead><tr><th>message_count</th></tr></thead>
    <tbody>
      <tr><td>0</td></tr>
    </tbody>
  </table>
</div>

```sql
CALL radio_subscription_received_message_add(
    'loopback://article', NULL, 'first message'
);

EXECUTE received;
```

<div class="query-result" role="region" aria-label="Result: message_count" tabindex="0">
  <div class="query-result__label">result · second execution</div>
  <table>
    <thead><tr><th>message_count</th></tr></thead>
    <tbody>
      <tr><td>1</td></tr>
    </tbody>
  </table>
</div>

The prepared query sees the message that arrived after it was prepared. The same rule now applies to subscription inspection, transmit calls, flushing, sleeping and listening. A prepared `radio_unsubscribe` doesn't merely repeat its old success: executing it after the subscription is gone reports that no subscription exists.

The [prepared-statement tests](https://github.com/Query-farm/radio/blob/3dedc77ea9d724dd90932d5e2ae77ab0323d25ed/test/sql/radio_prepared.test) exercise these cases across successive calls. This matters in applications that prepare a small set of SQL statements once and execute them for the life of a connection.

## Check the queue before sleeping

`radio_listen` tells you which subscriptions have unseen messages. You can poll without waiting, or wait for a bounded interval:

```sql
SELECT * FROM radio_listen(false, INTERVAL '0 seconds');
```

After the message in the previous example has been read by `radio_received_messages`, this returns no rows: reading marks the message as seen. Add another message and the subscription becomes ready again:

```sql
CALL radio_subscription_received_message_add(
    'loopback://article', NULL, 'second message'
);

SELECT * FROM radio_listen(true, INTERVAL '1 second');
```

The listener checks whether messages are already waiting before it sleeps. The change also fixes lost wakeups around the transition into a wait, so a notification doesn't disappear between checking the condition and waiting for it.

Listening and reading are separate operations. `radio_listen` reports readiness; the received-message functions retrieve the data and update the seen counts. An empty poll doesn't mean the subscription has never received anything, only that it has nothing unseen at that point.

## A full queue should tell you what happened

Radio's receive queue has a capacity. Once full, it drops the oldest message to make room for a new one. The update exposes `received_messages_dropped_unseen` alongside the number processed and currently queued.

Here is an intentionally small queue:

```sql
CALL radio_subscribe('loopback://small', receive_message_capacity := 2);

CALL radio_subscription_received_message_add('loopback://small', NULL, 'one');
CALL radio_subscription_received_message_add('loopback://small', NULL, 'two');
CALL radio_subscription_received_message_add('loopback://small', NULL, 'three');

SELECT received_messages_queued, received_messages_dropped_unseen
FROM radio_subscriptions()
WHERE url = 'loopback://small';
```

<div class="query-result" role="region" aria-label="Result: received_messages_queued, received_messages_dropped_unseen" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>received_messages_queued</th><th>received_messages_dropped_unseen</th></tr></thead>
    <tbody>
      <tr><td>2</td><td>1</td></tr>
    </tbody>
  </table>
</div>

The first message was evicted before it was read. Evicting an already-read message doesn't increment the unread-drop counter. The distinction gives a consumer something actionable: it can detect when it isn't keeping up, rather than treating the remaining queue as a complete history.

The queue is still bounded, and these counters don't make Radio a durable message log. Use them to understand a live consumer's behavior and choose an appropriate capacity.

## Preserve the payload, and check network permission at execution

The 2.0 branch also includes the fix that sends `VARCHAR` WebSocket payloads as text frames and `BLOB` payloads as binary frames. Quotes and binary bytes are retained rather than being transformed through a display representation. That matters for a JSON acknowledgment just as much as for a binary message. A NULL payload is rejected with a user-facing error.

Network subscriptions and sends now check `enable_external_access` when they execute. Preparing a network operation while access is enabled doesn't give it permission to run after access has been disabled. The `loopback://` transport remains usable because it never opens a network connection; inspecting local subscription state remains available too.

Clean up the local example with:

```sql
CALL radio_unsubscribe('loopback://article');
CALL radio_unsubscribe('loopback://small');
```

These changes are on the [reviewed v2.0 branch](https://github.com/Query-farm/radio/commit/66c6921), with [offline receive tests](https://github.com/Query-farm/radio/blob/3dedc77ea9d724dd90932d5e2ae77ab0323d25ed/test/sql/radio_receive_offline.test) for queue behavior. The branch's native build currently targets Linux and macOS; its Windows build remains disabled because of a TLS-library link conflict. The [Radio reference](/products/extensions/radio/) covers transport URLs and function arguments, and the [Query Farm repository guide](/blog/duckdb-2-query-farm-repository/) explains installation for DuckDB 2.0.
