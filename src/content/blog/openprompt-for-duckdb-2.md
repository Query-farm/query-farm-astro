---
title: "Open Prompt for DuckDB 2.0: each row gets its own request"
description: "Open Prompt now reads options per row, reports API failures as SQL errors, and uses DuckDB secrets and HTTP settings for LLM requests from SQL."
pubDate: 2026-11-11
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "LLM APIs"]
extensions: ["openprompt"]
draft: false
showDescription: false
heroImage: "/media/posts/openprompt-for-duckdb-2/social.png"
heroImageAlt: "Open Prompt for DuckDB 2.0: each row gets its own request. Four prompt cards carry their own colored options through separate requests to four corresponding response cards."
leadVisual:
  src: "/media/posts/openprompt-for-duckdb-2/artwork.webp"
  alt: ""
  width: 1440
  height: 480
nextStep:
  title: "Open Prompt"
  pitch: "Call OpenAI-compatible APIs from SQL, with per-row prompts and options, structured output, and credentials in DuckDB secrets."
  href: "/blog/duckdb-2-query-farm-repository/"
  cta: "Installation instructions"
  extension: "openprompt"
  installNote: "These changes require the DuckDB 2.0 build."
  repo: "https://github.com/Query-farm/openprompt"
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>Each row uses its own model, system prompt, schema, temperature and token limit. Earlier builds could reuse the first row’s options.</li>
      <li>API failures raise errors by default. <code>open_prompt_null_on_error</code> makes failed requests return NULL when that is the behavior your query needs.</li>
      <li>DuckDB secrets take precedence over session settings, and requests use DuckDB’s HTTP stack for proxies, timeouts, certificate settings and retries.</li>
    </ul>
  </div>
</aside>

An API call can succeed and still be the wrong call. If a column selects the model or system prompt, sending every row with the first row's options produces plausible answers to requests you never intended to make.

That was a bug in [Open Prompt](https://github.com/Query-farm/openprompt). The DuckDB 2.0 update fixes how optional arguments are read, changes how failures reach SQL, and moves the network work onto DuckDB's HTTP client. The function still returns the assistant's text. The work around that text is now considerably more deliberate.

## Options belong to the row

Suppose two rows need different instructions. One is a customer-facing summary; the other is an internal classification. With an OpenAI-compatible endpoint configured, both can be expressed in one query:

```sql
WITH requests(id, prompt, instruction) AS (
    VALUES
        (1, 'The parcel arrived two days late.',
            'Write one sentence acknowledging the delivery problem.'),
        (2, 'The parcel arrived two days late.',
            'Return just one label: delivery, billing, or product.')
)
SELECT id,
       open_prompt(prompt,
           system_prompt := instruction,
           temperature := 0.0,
           max_tokens := 60) AS response
FROM requests;
```

Previously, some optional arguments were read from row zero of the input chunk. A constant worked; a column could silently use the wrong value. The function now reads the model, schema, system prompt, temperature and token limit at each row's actual vector position, including filtered input.

A NULL prompt returns NULL without making a request. A NULL optional argument means that option was not supplied. In particular, a NULL model uses the configured model; it doesn't suppress the row. The [fixture tests](https://github.com/Query-farm/openprompt/blob/f321d3166b8d8e22d6fb4175ed0a82b03e86e7f9/test/sql/open_prompt_fixture.test) check different models and system prompts in the same chunk by having the server return the request it received.

## Put configuration in a secret

The extension accepts APIs that implement the chat-completions request format. A local Ollama server is one option; a hosted endpoint is another. Configure the endpoint and model for your provider:

```sql
CREATE SECRET llm (
    TYPE open_prompt,
    api_url 'https://api.example.com/v1/chat/completions',
    api_token 'replace-with-your-token',
    model_name 'your-model',
    api_timeout '30'
);
```

The URL, token and model above are placeholders. The timeout is in whole seconds. A server that doesn't require authentication can omit `api_token`; the extension then sends no bearer header.

For each setting, a matching `open_prompt` secret wins over the `set_*()` session value, which wins over the corresponding `OPEN_PROMPT_*` environment variable and then the built-in default. A `model := ...` argument still overrides the configured model for that call. Scoped secrets are matched against the API URL selected by the session or environment; an unscoped secret can provide the URL itself.

`set_api_token()` remains available, but is deprecated in favor of secrets. Secret tokens are redacted by DuckDB's secret machinery. Existing applications that set both a secret and a session token should check which credential they intend to use: the secret now takes precedence.

## A failed request should look like a failed request

A rate limit, an invalid API key and a model refusal are different from a successful completion containing an empty string. Open Prompt now raises errors for failed HTTP requests, malformed JSON, missing response messages and refusals. HTTP errors carry the status and the API's error message.

For a batch where a failed row should remain in the result, enable the explicit alternative:

```sql
SET open_prompt_null_on_error = true;

SELECT open_prompt('Summarize this repair note: replaced the pump.',
                   max_tokens := 40) AS summary;

RESET open_prompt_null_on_error;
```

Request failures then return NULL. Invalid arguments, such as a negative temperature or a nonpositive token limit, still fail validation. Cancellation is still cancellation. The setting is for handling failed requests, not for hiding every error in a query.

This is an upgrade change. If a downstream query previously treated an error message as ordinary model output, fix that assumption. Decide whether the batch should stop or retain a NULL, and make that decision visible in the SQL.

## Structured output and the shared HTTP client

The `json_schema` option accepts either a schema to wrap in the API's `json_schema` response format, or a complete response-format object. The latter lets a caller specify provider-supported details such as strict mode. It is a request to the provider; the extension does not independently validate the returned text against the schema.

On native DuckDB, requests now go through `HTTPUtil`, with `httpfs` providing the POST and TLS client. DuckDB's proxy, CA and timeout settings apply. The extension retries HTTP 429 and 503 responses using `http_retries`, honoring a numeric `Retry-After` header or using bounded backoff. It checks for interruption between rows and during retry waits. It also refuses network calls when `enable_external_access` is false.

That is useful consistency for a query which already reads remote files through DuckDB. There is one place to configure its network behavior.

The [implementation change](https://github.com/Query-farm/openprompt/commit/a58292b) includes the request fixtures and failure cases. These changes are on the reviewed `v2.0` branch. The [Query Farm repository guide](/blog/duckdb-2-query-farm-repository/) covers installing `open_prompt` for DuckDB 2.0; the [source repository](https://github.com/Query-farm/openprompt/tree/v2.0) contains the implementation and request fixtures. The SQL name is `open_prompt`, even though the source repository is named `openprompt`.
