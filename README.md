# Class A Packet System

Internal iPad-facing staff tool for Vault that digitises paper repair/order packets.

**Store:** Vault, 40 North East Road, Walkerville SA 5081  
**Contact:** +61 8 8344 7722 | customercare@classa.com.au  
**Stack:** Next.js 14 · TypeScript · Tailwind CSS · Supabase · Vercel

---

## Prerequisites

- Node.js 18+
- [Supabase](https://supabase.com) account
- [Vercel](https://vercel.com) account
- GitHub account
- [Dymo Connect for Windows](https://www.dymo.com/support/DYMO-Software.html) installed on each counter PC
- Klaviyo account (for email/CRM)
- Podium account (for SMS)
- Google Cloud service account with Sheets API access
- Google Cloud project with Maps JavaScript API + Places API enabled

---

## 1 · Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run each migration in order:
   - `/supabase/migrations/001_init.sql` — creates all base tables and the `increment_packet_counter` RPC
   - `/supabase/migrations/002_staff_member.sql` — renames `staff_initials` → `staff_member`
   - `/supabase/migrations/003_address_fields.sql` — splits address into street / suburb / state / postcode
   - `/supabase/migrations/004_valuation.sql` — renames `value_declared` → `valuation_required`
   - `/supabase/migrations/005_remove_ordered.sql` — drops unused `ordered` column
   - `/supabase/migrations/006_online_order.sql` — adds online order columns
   - `/supabase/migrations/007_counter_online.sql` — adds `online_order_count` counter + `increment_online_order_counter` RPC
3. Copy your credentials from **Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## 2 · Local Development

```bash
npm install
cp .env.local.example .env.local
# Fill in all keys in .env.local
npm run dev
```

App: http://localhost:3000  
Admin: http://localhost:3000/admin

---

## 3 · Google Maps Setup (Address Autocomplete)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Library**.
2. Enable **Maps JavaScript API** and **Places API**.
3. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **API Key**.
4. (Recommended) Restrict the key to your Vercel deployment domain and to the Maps JavaScript + Places APIs.
5. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in both Vercel env vars and `.env.local`.

Without this key the address fields still work — staff just type manually.

---

## 4 · Google Sheets Setup

1. Create a Google Cloud project and enable the **Google Sheets API**.
2. Create a **service account** and download the JSON key.
3. Share your Google Sheet with the service account email (Editor access).
4. Add column headers to row 1:  
   `Timestamp | Reference No. | Packet Type | Customer Name | Phone | Email | Articles | Instructions | Total Charges | Deposit | Balance | Due Date | Staff Member | Referral Source | ARMS Entered | Notes | Order Number | Shipping Method`
5. Set environment variables from the JSON key:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY`
   - Sheet URL ID → `GOOGLE_SHEETS_ID`

---

## 5 · GitHub + Vercel Deployment

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-org/class-a-packet-system.git
git push -u origin main
```

1. Vercel → **Add New Project** → Import GitHub repo.
2. Add all env vars from `.env.local.example` under **Settings → Environment Variables**.
3. Deploy — every push to `main` auto-deploys.

---

## 6 · Dymo Connect Setup (Counter PCs)

1. Install **[Dymo Connect for Windows](https://www.dymo.com/support/DYMO-Software.html)** on each counter PC.
2. Add Dymo Connect to the Windows startup folder so it launches at login:
   - Press `Win + R` → type `shell:startup` → Enter.
   - Create a shortcut to `C:\Program Files\DYMO\DYMO Connect\DYMOConnect.exe`.
3. Find the counter PC's local IP: open Command Prompt → `ipconfig` → note the **IPv4 Address** (e.g. `192.168.1.50`).
4. Set `NEXT_PUBLIC_DYMO_SERVICE_HOST` to that IP in both Vercel env vars and `.env.local`.
5. Ensure the iPad and counter PC are on the **same local Wi-Fi network**.
6. If Dymo is unreachable, the app automatically opens a print-ready A6 HTML label in a new tab using `window.print()`.

---

## 7 · Klaviyo Email Template

Have the Klaviyo marketing team create a **Flow** triggered by the metric **"Packet Confirmation Email"** using these event properties:

| Property | Example |
|---|---|
| `customer_name` | Jane Smith |
| `reference_number` | CA-20260506-0014 |
| `packet_type` | Repair Job |
| `articles` | 9ct gold ring |
| `instructions` | Polish and resize |
| `in_date` | 06/05/2026 |
| `due_date` | 20/05/2026 |
| `total_charges` | $250.00 |
| `deposit` | $50.00 |
| `balance` | $200.00 |
| `staff_member` | Josh Mucklow |
| `store_name` | Vault |
| `store_phone` | +61 8 8344 7722 |

---

## 8 · Shopify Integration

The packet system integrates with Shopify in two ways:

### Automatic order packets (webhook)

When a customer places an order on the Shopify store, Shopify sends a webhook to `/api/shopify/webhook`. The app verifies the signature, maps the order data to an Online Order packet, and inserts it into Supabase automatically. Staff see the new packet in the admin view without any manual entry.

**Setup steps:**

1. **Create a Shopify app and get an Admin API token:**
   - In Shopify admin go to **Apps → Develop apps → Create an app**.
   - Under **Configuration → Admin API scopes**, enable `read_orders` and `read_customers`.
   - Click **Install app**, then copy the **Admin API access token**.
   - Add to env: `SHOPIFY_ADMIN_API_TOKEN=<token>`

2. **Register the webhook:**
   - In Shopify admin go to **Settings → Notifications → Webhooks**.
   - Click **Create webhook**.
   - **Event:** Order creation
   - **URL:** `https://your-vercel-url.vercel.app/api/shopify/webhook`
   - **Format:** JSON
   - Click **Save**. Copy the **Signing secret** shown on the webhook detail page.
   - Add to env: `SHOPIFY_WEBHOOK_SECRET=<signing secret>`

3. **Set store domain:**
   - Add to env: `SHOPIFY_STORE_DOMAIN=classajewellers.myshopify.com`

4. **Add all three env vars to Vercel** under Settings → Environment Variables, then redeploy.

### Customer auto-fill (email lookup)

On the New Packet form, when staff type an email address, the app queries the Shopify customer database after 500 ms. If a matching customer is found, it auto-fills the name, phone, and most recent shipping address. A green **Found in Shopify** badge appears next to the email field to confirm the lookup. Fields that already have content are never overwritten.

This feature requires `SHOPIFY_ADMIN_API_TOKEN` and `SHOPIFY_STORE_DOMAIN` to be set. If they're not set the form still works normally — the lookup just silently does nothing.

---

## 9 · Updating Staff Members



Edit the `STAFF_MEMBERS` array in [`/components/ReferralStaffSection.tsx`](./components/ReferralStaffSection.tsx) and redeploy:

```tsx
const STAFF_MEMBERS = [
  "Aisha Scott",
  "Arissa Michos",
  // ... 23 staff members total
];
```

---

## Reference Number Formats

- Standard packets: `CA-YYYYMMDD-XXXX` — e.g. `CA-20260506-0014`. Counter resets daily.
- Online orders: `ON-YYYYMMDD-XXXX` — e.g. `ON-20260506-0003`. Separate daily counter.
- Repair tracker: `RT-YYYYMMDD-XXXX` (same sequence as CA, derived automatically).

## Project Structure

```
/app
  page.tsx                    Main packet form
  /admin/page.tsx             Admin view
  /api/submit/route.ts        Submission handler
  /api/retry/route.ts         Retry failed outputs
  /api/admin/packets/route.ts Fetch/update packets
  /api/admin/export/route.ts  CSV export
/components                   All UI components
/lib                          Integrations + utilities
/supabase/migrations/         DB migrations 001–007
/public/class-a-logo.png      Store logo (add this file)
```
