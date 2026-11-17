# Hosted Orchard: sign-in, console and billing

Query.Farm runs Orchard workers on Fly.io for customers. The site handles
sign-in, the console, the request tracker and billing. **Fly provisioning is
manual**: a customer's request emails the team, someone runs `fly deploy`, then
marks the request done in the tracker.

Pricing is **Fly.io list price × 1.35**, metered per instance-minute, **plus a
monthly license** for each deployment of a worker whose
`offering.pricing === 'paid'`. Sizes, Fly prices, the markup, the license
price, regions and the instance cap all live in `src/lib/orchard/pricing.ts`.

## Pieces

| Path | What it does |
| --- | --- |
| `functions/api/auth/{login,callback,logout}.ts` → `src/lib/orchard/auth.ts` | WorkOS AuthKit authorization-code flow with fetch (no SDK). First sign-in creates a WorkOS Organization (user as `admin`), a `leads` row and a Resend email. |
| `src/lib/orchard/session.ts` | AES-GCM sealed `qf_session` cookie (key from `SESSION_SECRET`; the cookie name is bound as AAD). Holds user/org ids, the org-scoped refresh token and the WorkOS `sid`. 14 days. `requireSession()` and `isAdmin()`. |
| `functions/api/orchard/[[path]].ts` → `src/lib/orchard/api.ts` | Console API: `me`, `deployments`, scale/stop, billing checkout/portal, `admin/requests`, `meter`. |
| `functions/api/stripe/webhook.ts` → `src/lib/orchard/stripe.ts` | Stripe signature verification (`t=…,v1=…`), subscription/payment status onto `orgs`, deduped by event id. |
| `src/lib/orchard/meter.ts` + `.github/workflows/orchard-meter.yml` | Daily: integrate `deployment_events` into instance-minutes per (org, size, UTC day) and send Stripe meter events with identifier `orchard-<org>-<size>-<day>`. |
| `migrations/orchard/0001_init.sql` | D1 schema: `orgs`, `members`, `deployments`, `deployment_events`, `requests`, `leads`, `stripe_events`, `meter_reports`. |
| `src/pages/products/orchard/console/{index,new,admin}.astro` + `src/scripts/orchard-console.ts` | Static, `noindex` console pages; client JS calls `/api/orchard/*`. |
| `src/pages/products/orchard/hosted/index.astro` | Product page; prices computed from `pricing.ts`. |
| `src/pages/products/orchard/hosted/workers.json.ts` | Slim worker list (slug, name, catalog, open/paid, release) read by the console and, through `env.ASSETS`, by the Functions. The full catalog is far too big to bundle. |

Every Function route is listed in `public/_routes.json`. Every route returns 503
while a secret it needs is missing.

## Why instance-minutes, not hours

Stripe meter event values must be positive integers. Usage is therefore metered
in **instance-minutes**, one meter per size, and each size's price is the hourly
price ÷ 60 as `unit_amount_decimal` (cents, 12 decimals). The console and the
product page show hours and months.

## One-time setup

### 1. D1

```sh
npx wrangler d1 create orchard
# paste the printed database_id into wrangler.jsonc (ORCHARD_DB) — before merging:
# a Pages deploy with the placeholder id fails
npx wrangler d1 migrations apply orchard --remote
npx wrangler d1 migrations apply orchard --local   # for wrangler pages dev
```

The binding needs to exist for **both** the production and preview
environments of the `query-farm-website` Pages project; `wrangler.jsonc`
provides it to both.

### 2. WorkOS (staging first, then production)

In the WorkOS dashboard, for each environment:

1. **AuthKit / User Management** enabled, with the sign-in methods you want
   (email + password or magic code, Google, GitHub…).
2. **Redirect URIs** for the site's confidential client (`WORKOS_CLIENT_ID`):
   - `http://localhost:8788/api/auth/callback` (local `wrangler pages dev`;
     **not yet registered in staging: WorkOS currently answers
     redirect-uri-invalid**)
   - `https://<branch>.query-farm-website.pages.dev/api/auth/callback` for a preview you test on
   - `https://query.farm/api/auth/callback` (production environment only)
   Set the default redirect URI to the production or local one.
3. **Sign-out redirect**: allow `https://query.farm/products/orchard/` (and
   `http://localhost:8788/products/orchard/`), the `return_to` the logout route sends.
4. **Organizations**: enabled. The site creates one per new user through the
   API, and adds the user with role slug **`admin`**, which must exist in
   Roles (it does by default; if you rename roles, change `role_slug` in
   `src/lib/orchard/auth.ts`).
5. **Public OAuth client for VGI** (`WORKOS_VGI_CLIENT_ID`, the "Connect" app
   DuckDB uses): public client, PKCE, loopback redirects
   (`http://localhost` / `http://127.0.0.1`, any port). The site doesn't read it
   yet; the hosted gateway (plan step 5) serves it in its OAuth
   protected-resource metadata, with `WORKOS_AUTHKIT_DOMAIN` as the
   authorization server. Verified in staging: the AuthKit discovery `issuer`
   equals the AuthKit domain exactly; token endpoint `/oauth2/token`, JWKS
   `/oauth2/jwks`.
6. Copy the API key and client ids into the secrets below.

### 3. Stripe (test mode first)

1. **Billing Meters**: create three meters, aggregation **Sum**, customer
   mapping key `stripe_customer_id`, value key `value`, with event names exactly:
   - `orchard_instance_minutes_s`
   - `orchard_instance_minutes_m`
   - `orchard_instance_minutes_l`
2. **Product "Hosted Orchard instances"** with three **usage-based** monthly
   prices, each attached to its meter, priced per unit with
   `unit_amount_decimal` (cents per instance-minute). Current values, from
   `minuteUnitAmountDecimal()` in `pricing.ts`:

   | Size | Fly preset | Fly $/month | Our $/month | cents / instance-minute |
   | --- | --- | --- | --- | --- |
   | S | shared-cpu-1x, 1 GB | 6.70 | 9.05 | 0.020937500000 |
   | M | shared-cpu-2x, 2 GB | 13.39 | 18.08 | 0.041843750000 |
   | L | performance-2x, 4 GB | 66.00 | 89.10 | 0.206250000000 |

   (`node --import tsx -e "import('./src/lib/orchard/pricing.ts').then(p => p.SIZES.forEach(s => console.log(s.id, p.minuteUnitAmountDecimal(s))))"`)
3. **Product "Orchard worker license"** with a licensed (per-unit) monthly
   recurring price of **$49** (`LICENSE_MONTHLY_USD`). Its quantity is kept
   equal to the org's live deployments of paid workers.
4. **Customer Portal**: enable it (Settings → Billing → Customer portal) with
   invoices, payment methods and cancellation as you prefer.
5. **Webhook endpoint** `https://query.farm/api/stripe/webhook` with events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `invoice.payment_failed`. Copy its signing secret.
   Locally: `stripe listen --forward-to localhost:8788/api/stripe/webhook`.

Changing a price later means a new Stripe price (prices are immutable), the new
id in the secret, and the matching edit to `pricing.ts`.

### 4. Secrets

Pages project → Settings → Variables and secrets (production and preview), or
`npx wrangler pages secret put NAME --project-name=query-farm-website`.
Locally, copy `.dev.vars.example` to `.dev.vars`.

| Name | Value |
| --- | --- |
| `SESSION_SECRET` | ≥ 32 random characters (`openssl rand -base64 48`). Rotating it signs everyone out. |
| `WORKOS_CLIENT_ID`, `WORKOS_API_KEY` | The site's confidential client and API key. |
| `WORKOS_REDIRECT_URI` | Optional; defaults to `<origin>/api/auth/callback`. |
| `WORKOS_VGI_CLIENT_ID`, `WORKOS_AUTHKIT_DOMAIN` | For the hosted gateway (step 5); unused by the site. |
| `ORCHARD_ADMINS` | Comma-separated emails for the request tracker. The email must be verified in WorkOS. |
| `RESEND_API_KEY` | Already set for the enquiry form. `ORCHARD_NOTIFY_TO` / `ORCHARD_NOTIFY_FROM` optional. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | |
| `STRIPE_PRICE_S`, `STRIPE_PRICE_M`, `STRIPE_PRICE_L`, `STRIPE_PRICE_LICENSE` | Price ids from step 3. |
| `ORCHARD_METER_TOKEN` | Random token (`openssl rand -hex 32`); also the GitHub secret below. |

### 5. The daily meter Action

GitHub repo → Settings → Secrets and variables → Actions:

- secret `ORCHARD_METER_TOKEN` (same value as the Pages secret)
- variable `ORCHARD_METER_URL` = `https://query.farm/api/orchard/meter`

The workflow skips itself until the variable exists. It runs at 02:17 UTC and
reports the three complete UTC days before today; already-sent days are
skipped (D1 `meter_reports`) and Stripe rejects duplicate identifiers within 24
hours. Run it by hand with specific days (`workflow_dispatch`, `days`) to
backfill; Stripe accepts timestamps up to 35 days old. A run fails (and GitHub
emails you) if any report fails; failed days are retried on the next run.

## Running a request (the manual part)

1. A request email arrives ("Orchard create request: … × 2 (M, iad)") with the
   deployment id, worker release and `fly --vm-size` preset.
2. Open `/products/orchard/console/admin/`, mark it **in progress**.
3. Deploy on Fly.io (app per deployment, the size's preset, the region, the
   instance count; behind the OAuth gateway once step 5 exists).
4. Mark it **done** with the `https://` endpoint and the instance count actually
   running. That writes `deployment_events`, which is what gets billed, and
   syncs the license quantity for paid workers.

Scale and stop requests work the same way; repeated +/− clicks fold into one
unstarted request. Reject a request to close it without changing anything.

## Local walkthrough

```sh
npm run build
npx wrangler d1 migrations apply orchard --local
npx wrangler pages dev dist          # http://localhost:8788
stripe listen --forward-to localhost:8788/api/stripe/webhook
```

Sign up at `/products/orchard/console/`, request a deployment (Stripe test card
`4242 4242 4242 4242`), mark it done in the tracker, scale it, then run the
meter for a past day:

```sh
curl -X POST localhost:8788/api/orchard/meter -H "Authorization: Bearer $ORCHARD_METER_TOKEN" \
  -H 'Content-Type: application/json' -d '{"days":["2026-11-15"]}'
```

## Tests

`npm run test:orchard` runs the real migration on `node:sqlite` with stubbed
WorkOS, Stripe and Resend: session sealing and tampering, the callback (new
org, multi-org selection, failures), the request/scale/admin journey, webhook
signatures and ordering, checkout/portal/licenses, and meter aggregation and
idempotency.

## Open decisions

- **Price list**: the S/M/L presets, the $49 license and the regions offered
  are first guesses in `pricing.ts`.
- **Non-US regions** are priced at US-East rates on the page; the request email
  is the point to confirm a difference.
- **Bandwidth/volumes** are not metered or mentioned in the terms.
- **Terms and privacy** text for the hosted service is new and should get a
  legal read before launch.
