# Vault print relay

Cloudflare Worker and one Durable Object per printer. The Zebra printer connects out over Weblink. Vault posts a signed job. The relay sends the ZPL on the raw channel and posts the result back.

This folder is not deployed. Nothing here changes the shop printer.

## What it speaks

- The printer connects to `wss://<worker>.workers.dev/printer/<token>`.
- The socket must offer `v1.weblink.zebra.com`. Frames are binary. A text frame is closed with code 1003.
- The main channel sends discovery JSON (`discovery_b64` and the serial). The token is checked against that serial. The secret is stored as a SHA-256 hash in KV and in the Durable Object, seeded by Vault.
- The relay opens `v1.raw.zebra.com` and sends the full ZPL, including the existing `^RF` write plus `^HV` so the printer reads the EPC back.
- Alerts registered with `configure_alert`: RFID error, job complete, paper out, head open.
- An RFID error is retried once. The retry sends the whole job again, because the voided tag is a new label. A second failure is reported and the relay stops.
- Results are `POST`ed to the Vault webhook, signed with the same HMAC secret.

`/printer/<token>` always records the handshake (headers, subprotocol, and the first frames) on the Durable Object. A signed `GET /admin/handshake?printer_id=` reads it. That is the log for the first connection test.

## Content-Length: 0

Zebra's Weblink note says the HTTP 101 response must include `Content-Length: 0` or some firmware drops the handshake. This Worker sets that header on the upgrade response. Cloudflare Workers builds the 101 itself, and it can strip or ignore `Content-Length` on a WebSocket upgrade. There is no supported way to write the raw status line. If the printer's Weblink log says the handshake failed for that reason, a Workers route cannot fix it; something in front of the Worker would have to add the header. That proxy is not part of this slice.

## Deploy

You need `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Workers edit). They are not in this repo.

1. `cd vault-print-relay`
2. `npm install`
3. `npx wrangler kv namespace create TOKENS`
4. Put the printed id into `wrangler.toml` under `[[kv_namespaces]]` `id`.
5. `npx wrangler secret put RELAY_HMAC_SECRET` and use the same value as Vault's `RFID_RELAY_HMAC_SECRET`.
6. `npx wrangler secret put VAULT_WEBHOOK_URL` and set it to `https://<vault-host>/api/rfid/relay/webhook`.
7. `CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npx wrangler deploy`
8. The test URL is `https://vault-print-relay.<account-subdomain>.workers.dev`. No custom domain is configured.

Vault stays on the shop bridge until both of these are true: `RFID_PRINT_RELAY=1` and the printer row has `relay_enabled`. Seeding the token is `POST /api/rfid/relay/seed` with a manager session, after migration `174_rfid_printer_check_and_relay.sql` is applied and a printer check has stored the serial. The route returns the token once. The printer URL is `wss://vault-print-relay.<account-subdomain>.workers.dev/printer/<token>`.

Do not point the printer at that URL in this slice. Printer settings are unchanged.

## Tests

`npm test` runs a fake printer socket: discovery, raw channel, a successful job, an RFID void with one full retry then failure, and disconnect/reconnect.
