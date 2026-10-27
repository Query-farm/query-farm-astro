# Crossfield website checks

Browser checks reuse the local Astro preview at port 4455, or start it when absent:

```sh
npx playwright test --config tests/crossfield/playwright.config.ts
```

Set `CROSSFIELD_PREVIEW_PORT` to use a separate checkout without reusing another review server.

WebKit covers 18 routes on desktop/mobile, internal links and fragments, downloads,
metadata, overflow, keyboard-operated query controls and reading without JavaScript.

`native/*.test` uses DuckDB's standard SQLLogicTest runner, not a website/Python engine.
Run only on the maintained Crossfield EC2 workspace through `./dev shell`. Extract the
matching downloads there first. Set `WEBSITE_EXAMPLE_DIR` to the absolute extracted
fixture directory; supply the test file through the runner's `-f` list and load the
matching Crossfield extension using `--on-init`. Repeat with `PRAGMA disable_optimizer`.
Use `--env-passthrough WEBSITE_EXAMPLE_DIR`, a 60-second timeout and captured output.
SQLLogicTest changes its working directory, so setup paths in these wrappers use
that environment variable. The downloaded CLI sessions retain relative paths and
are checked independently as extracted. Expected answers are manually specified.

Fresh and recorded evidence are separated in `public/crossfield/examples/verification.txt`.
Source ZIPs are deterministic outputs of `scripts/crossfield-example-assets.mjs`;
regenerate only when intentionally refreshing their pinned fixture inputs. Review
native setup wrappers and expectations if refreshing fixture data or setup SQL.
