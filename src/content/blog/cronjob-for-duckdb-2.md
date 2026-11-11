---
title: "Cronjob for DuckDB 2.0: see what ran, when, and why it failed"
description: "Cronjob adds run history, typed timestamps, and per-row scheduling in DuckDB 2.0. Impossible schedules fail early, and jobs stop when their database closes."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Scheduling"]
extensions: ["cronjob"]
draft: false
showDescription: false
heroImage: "/media/posts/cronjob-for-duckdb-2/social.png"
heroImageAlt: "Cronjob for DuckDB 2.0: see what ran, when, and why it failed. A paper calendar, clock, and dated execution records connect scheduled SQL to its run history."
leadVisual:
  src: "/media/posts/cronjob-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "Cronjob"
  pitch: "Schedule SQL in a running DuckDB database and inspect the outcome of each recent run."
  href: "/products/extensions/cronjob/"
  cta: "Explore Cronjob"
  extension: "cronjob"
  installNote: "These changes are in the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/cronjob"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Inspect the last 100 runs of each job with <code>cron_job_history()</code>, including start, finish and failure details.</li>
      <li><code>cron_jobs()</code> returns real timestamps and run counters. Planning a query no longer schedules a job.</li>
      <li>Schedules use six fields and UTC. Jobs and their history remain in memory and disappear when the database closes.</li>
    </ul>
  </div>
</aside>

A scheduled query is easy to forget until the table it maintains stops changing. At that point, “the job is active” is not enough. You need to know whether it ran, how long it took, and what happened.

The DuckDB 2.0 update to [Cronjob](/products/extensions/cronjob/) adds that information. It also fixes several cases where the scheduler did something quite different from what the SQL requested: planning could create a job, rows could share the wrong schedule, and an impossible date could turn into a busy loop.

## Keep the job ID, then inspect the runs

This example records a heartbeat once a minute. Run it in native DuckDB and keep the database open:

```sql
CREATE TABLE heartbeat (recorded_at TIMESTAMPTZ DEFAULT now());

SET VARIABLE heartbeat_job = (
    SELECT cron('INSERT INTO heartbeat DEFAULT VALUES', '0 * * * * *')
);
```

The six schedule fields begin with seconds. `0 * * * * *` means the start of each minute, evaluated in UTC. A five-field crontab expression is an error.

After the job has had time to run, inspect it:

```sql
SELECT job_id, status, next_run, last_run, run_count, error_count
FROM cron_jobs()
WHERE job_id = getvariable('heartbeat_job');

SELECT started_at, finished_at,
       finished_at - started_at AS elapsed,
       success, result
FROM cron_job_history()
WHERE job_id = getvariable('heartbeat_job')
ORDER BY started_at DESC;
```

The history retains the last 100 runs per job. `result` reports success or the query error, and `success` lets you filter failed runs directly. The counters on `cron_jobs()` show total runs and errors for the job, even as older history entries fall out of the retained window.

When finished, remove the example job:

```sql
SELECT cron_delete(getvariable('heartbeat_job'));
```

Deleting a job also removes its history. If you need a durable audit, copy the history somewhere persistent before deleting the job or closing the database.

## Timestamps that SQL can use

Previously, `next_run` and `last_run` were strings formatted with `ctime()`. They used local time even though the schedule was evaluated in UTC. Comparing them, subtracting them or joining them to another timestamp required parsing a display format.

Both columns now return `TIMESTAMPTZ`. `last_run` is the start of the most recent run, and `next_run` is NULL for an inactive job. The new `created_at` column records when the job was registered.

This is a return-type change. Update clients that expect text, and remove any parsing written around the old output. Normal timestamp formatting still follows the connection's time zone; the cron expression itself continues to use UTC.

## A side effect should happen when the query runs

`cron()` registers work. Treating it as a function the optimizer can evaluate once is wrong even when its arguments are constants.

The old registration allowed constant folding. An `EXPLAIN` or `PREPARE` could schedule a job while planning, and a query over many rows could create only one job. `cron()` and `cron_delete()` are now marked volatile. Planning does not execute them, and each evaluated row performs its own operation.

That matters for queries that read a table of job definitions. The scheduler now reads both the query and schedule from each row; it previously reused row zero's schedule for a whole chunk. A NULL query or schedule returns NULL and registers nothing.

There is also a practical consequence: a query that calls `cron()` over 3,000 rows now schedules 3,000 jobs. Use one row when you mean one job. Listing a large job collection is fixed too: `cron_jobs()` emits multiple chunks instead of writing past one chunk's capacity.

## Reject dates that will never happen

A cron expression can have valid fields and still describe no real date:

```sql
SELECT cron('SELECT 1', '0 0 0 30 2 *');
```

Previously, the scheduler could interpret the failed search for February 30 as a reason to run immediately, repeatedly. It now rejects the schedule. Jobs that exhaust their future dates are deactivated.

SQL is syntax-checked when a job is added, so an empty query or a misspelled `SELECT` fails immediately. That does not guarantee the query will succeed later: a referenced table can be absent or change before execution. Those failures belong in the run history.

The [scheduler change](https://github.com/Query-farm/cronjob/commit/8ee0fda1ca2d32aaadc8a91f30b262aa5675131a) includes [execution tests](https://github.com/Query-farm/cronjob/blob/8ee0fda1ca2d32aaadc8a91f30b262aa5675131a/test/sql/cronjob_execution.test) for successful and failed jobs, a job inspecting `cron_jobs()` while running, and a job deleting itself. The scheduler is owned by the database and stops when it closes.

Cronjob still runs inside a live DuckDB process. It does not persist schedules across restarts or start DuckDB for you. For those jobs, use an external scheduler. For an application that already keeps DuckDB open, the update makes the work happening inside it much easier to see.
