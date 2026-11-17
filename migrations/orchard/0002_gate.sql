-- The hosted OAuth gate in front of each Fly deployment fetches its user
-- allow-list from /api/orchard/gate/deployments/:id/allowlist, presenting a
-- per-deployment secret. Only its SHA-256 (hex) is stored; the secret itself
-- is shown once in the admin tracker and set as a Fly secret.
ALTER TABLE deployments ADD COLUMN gate_secret_hash TEXT;
