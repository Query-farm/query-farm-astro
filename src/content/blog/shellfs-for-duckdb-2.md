---
title: "Shellfs for DuckDB 2.0: pipes that stop when the query stops"
description: "Shellfs now interrupts stalled pipes on POSIX, cleans up abandoned commands, respects external-access settings, and handles broken pipes without killing DuckDB."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Shell Pipelines"]
extensions: ["shellfs"]
draft: false
showDescription: false
heroImage: "/media/posts/shellfs-for-duckdb-2/social.png"
heroImageAlt: "Shellfs for DuckDB 2.0: pipes that stop when the query stops. Paper records flow through a bent pipe with a prominent valve and a separate stop control."
leadVisual:
  src: "/media/posts/shellfs-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "shellfs"
  pitch: "Read command output and write query results through shell pipes, with explicit exit-code handling and predictable cleanup."
  href: "/products/extensions/shellfs/"
  cta: "Explore the extension"
  extension: "shellfs"
  installNote: "These changes require the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/shellfs"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>On POSIX systems, pipe reads, writes and child-process waits check for query interruption. Abandoned commands are stopped and reaped.</li>
      <li>Shell commands are refused when <code>enable_external_access</code> is false, even if a path prefix is in <code>allowed_directories</code>.</li>
      <li>Broken output pipes raise errors by default. <code>ignore_sigpipe</code> permits an early-closing consumer while still checking its exit status.</li>
    </ul>
  </div>
</aside>

`LIMIT 1` should be a quick way to inspect a command's output. It shouldn't make DuckDB wait for the command to finish producing ten million more rows. Canceling a query should work even when its shell command has stopped producing anything at all.

The [Shellfs extension](/products/extensions/shellfs/) lets DuckDB treat command output as an input file and send query results to a command's standard input. The 2.0 branch now gives those pipes more predictable lifetimes, particularly on POSIX systems. It also fixes broken-pipe handling and enforces DuckDB's external-access setting before starting a shell.

## A pipe has two ends

Shellfs uses a trailing `|` for a command whose output DuckDB reads, and a leading `|` for a command DuckDB writes to. On Linux or macOS:

```sql
SELECT * FROM read_csv('seq 1 10000000 |', header = false)
LIMIT 1;
```

<div class="query-result" role="region" aria-label="Result: column0" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>column0</th></tr></thead>
    <tbody>
      <tr><td>1</td></tr>
    </tbody>
  </table>
</div>

DuckDB can stop reading before `seq` reaches the end. Closing the pipe tells a producer still writing to it that there is no reader. The interesting case is a command that doesn't exit promptly after that happens:

```sql
SELECT * FROM read_csv('yes; sleep 30 |', header = false)
LIMIT 1;
```

<div class="query-result" role="region" aria-label="Result: column0" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>column0</th></tr></thead>
    <tbody>
      <tr><td>y</td></tr>
    </tbody>
  </table>
</div>

The shell can move on to `sleep` after `yes` loses its reader. Waiting indefinitely for that shell to finish would defeat the early limit. Shellfs now gives an abandoned command a short chance to exit, then terminates and reaps it. On POSIX it sends `SIGTERM`, escalating to `SIGKILL` if necessary. This cleanup is for the child command Shellfs owns, not a general process supervisor for arbitrary programs it might launch.

The [close tests](https://github.com/Query-farm/shellfs/blob/da058eff725a2ccad60c249160b8221a3ebedfc8/test/sql/shellfs_close.test) include an infinite producer, a shell that continues sleeping, and one that ignores `SIGTERM`.

## Cancellation reaches a stalled pipe

A blocking read can't notice a query interruption while it is waiting for bytes. The POSIX implementation now uses nonblocking pipe descriptors and polls in short intervals. Reads, writes and waits for child exit check whether DuckDB has been interrupted.

That covers three different waits: a producer that hasn't written its next row, a consumer that isn't taking more output, and a command that has closed the pipe but hasn't exited. Canceling the SQL query can stop the work at each point rather than depending on the command to cooperate first.

The platform distinction matters. These process-control changes use POSIX facilities. Windows commands run through `cmd.exe`; the branch separately fixes its pipes to use binary mode so newline translation doesn't damage binary output. The shell examples here are for POSIX, not portable command strings for Windows.

## An early-closing consumer is a choice

The reverse problem occurs when DuckDB is still writing but the command has already read enough. For example, `head -1` closes its input after the first line:

```sql
COPY (SELECT * FROM range(1000000))
TO '| head -1 > /dev/null'
(FORMAT CSV);
```

By default, that produces a broken-pipe error. The fix makes it an error from the query rather than a `SIGPIPE` that kills the DuckDB process. If the consumer is intentionally taking only a prefix, opt into discarding the remaining output:

```sql
SET ignore_sigpipe = true;

COPY (SELECT * FROM range(1000000))
TO '| head -1 > /dev/null'
(FORMAT CSV);

RESET ignore_sigpipe;
```

The command's exit status is still checked. A consumer that closes early and exits with code 4 is still a failure. The setting controls the broken pipe; it doesn't make every command successful.

Reading a producer with `LIMIT` is different: DuckDB deliberately closed its input early. That normal early termination is not reported as a producer error. A command read to completion that then exits nonzero still fails the query, unless its exit code was explicitly allowed.

## A path allowance isn't permission to start a shell

DuckDB can permit particular files or directories while external access is otherwise disabled. A Shellfs path contains a command, though, and allowing its leading text as a filesystem prefix must not authorize execution.

Shellfs now checks `enable_external_access` itself before starting either an input or output command. If it is false, the command is refused even when DuckDB's directory-prefix check would allow the path. Applications that use restricted connections should expect that refusal when upgrading.

## Compress once

One related documentation fix is easy to miss when writing a pipeline. If the command performs gzip compression, tell DuckDB to send uncompressed CSV:

```sql
COPY (SELECT range AS n FROM range(3))
TO '| gzip > numbers.csv.gz'
(FORMAT CSV, HEADER, COMPRESSION UNCOMPRESSED);
```

Otherwise, automatic compression inferred from a `.gz` suffix can compress data before it reaches `gzip`. The [write tests](https://github.com/Query-farm/shellfs/blob/da058eff725a2ccad60c249160b8221a3ebedfc8/test/sql/shellfs_write.test) check both reading the resulting file directly and decompressing it once through a shell pipe.

The [interruptible-pipe update](https://github.com/Query-farm/shellfs/commit/846ad3d) and earlier [broken-pipe fix](https://github.com/Query-farm/shellfs/commit/12502ab) are on the reviewed 2.0 branch. The [Shellfs reference](/products/extensions/shellfs/) documents path syntax and allowed exit codes. See the [Query Farm repository guide](/blog/duckdb-2-query-farm-repository/) for installation on DuckDB 2.0.
