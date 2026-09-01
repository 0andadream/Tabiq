# Tabiq

**Split the bill. Settle in NIM.**

Tabiq is an instant group expense splitter that runs as a [Nimiq Pay Mini App](https://nimiq.dev/mini-apps/). Friends create or join a group, add a bill, split it equally or with custom amounts, and settle their share in one tap with **NIM** or **USDT on Polygon**.

Payments are the product. Tabiq does not custody funds, does not ask for private keys, and does not mark a bill as paid unless the wallet provider actually submitted a transaction.

## Why it exists

Splitting a dinner is easy. Getting paid is not. IOUs linger in chats, bank transfers take days, and crypto payments are usually a separate, clumsy flow. Tabiq keeps the whole path inside Nimiq Pay: see the share, tap Pay, approve in the native wallet, done.

## Core user flow

1. Open Tabiq inside Nimiq Pay.
2. Connect the wallet (usually under 10 seconds).
3. Create a group, or join with a short code / QR.
4. Add an expense: title, amount, currency, payer, participants.
5. Split equally or enter custom amounts.
6. Each person sees exactly what they owe.
7. Tap **Pay**.
8. Approve the native wallet confirmation.
9. Tabiq records the payment only after the provider returns a transaction id.
10. Balances and activity update. The share shows **Settled ✓**.

If the user rejects the payment, the network fails, the hash is missing, or the transaction stays pending, Tabiq does **not** mark it as paid. Retry is available when it is safe.

## Architecture

```
Nimiq Pay WebView
  └── Tabiq (Vite + React + TypeScript)
        ├── @nimiq/mini-app-sdk  → NIM accounts & NIM transfers
        ├── window.ethereum      → USDT on Polygon (EIP-1193)
        └── Cloudflare Worker + D1
              └── shared groups, expenses, splits, payment status
```

- **Frontend:** Vite, React, TypeScript, Tailwind CSS. Mobile-first, desktop framed for development.
- **Backend:** Cloudflare Worker (Hono) + D1. Canonical shared state for groups across wallets and devices.
- **Local cache:** `localStorage` for display name, default currency, and last-known group snapshots. It is never the source of truth for shared groups.
- **No custody:** the Worker stores members, amounts, payment status, and transaction hashes. It never sees private keys.

## Local development

Requirements: Node.js 18+ and npm.

```bash
git clone https://github.com/0andadream/Tabiq.git
cd Tabiq
npm install
cp .env.example .env
npm run dev
```

This starts:

- Vite at `http://localhost:5173` (also on your LAN IP)
- Cloudflare Worker + local D1 at `http://127.0.0.1:8787`

Vite proxies `/api` to the Worker, so the Mini App can call same-origin `/api`.

```bash
npm run dev:web     # UI only
npm run dev:api     # Worker only
npm run build
```

## Environment variables

Frontend (`.env`, see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Worker origin. Leave empty in local dev (Vite proxy). Set in production if the UI is hosted separately. |
| `VITE_APP_URL` | Public Mini App origin used in invite links and QR payloads. |

The Worker does not need API secrets. It does not custody funds.

## Backend setup

Local D1 is created automatically by `wrangler dev`. Schema and the **Friday Dinner** demo group are applied on first API request.

For a remote Cloudflare deployment:

```bash
npx wrangler login
npx wrangler d1 create tabiq
```

Put the returned database id in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "tabiq"
database_id = "<your-d1-id>"
```

Optional, if you prefer migrations over first-request bootstrap:

```bash
npm run db:migrate          # local
npm run db:migrate:remote   # production
```

Deploy the API:

```bash
npx wrangler deploy
```

Host the Vite `dist/` build on Cloudflare Pages, Workers static assets, or any HTTPS static host. Point `VITE_API_URL` at the Worker if they are on different origins.

Stored data (minimum):

- group name and join code
- members (display name, NIM address, optional Polygon address)
- expenses, split amounts, payer
- payment status, network, transaction hash, timestamps

## How to load / test inside Nimiq Pay

Mini App testing currently requires Nimiq Pay allowlist access. See the [official tutorial](https://nimiq.dev/mini-apps/mini-app-tutorial/).

1. Run `npm run dev`.
2. Note the LAN URL printed by Vite, for example `http://192.168.1.20:5173`.
3. In Nimiq Pay, open Mini Apps and enter that URL.
4. Tabiq waits for the injected Nimiq provider via `init()` from `@nimiq/mini-app-sdk`.
5. Connect, join **Friday Dinner**, and send a real NIM payment.

Deeplink formats (after you publish an HTTPS origin):

```text
nimiqpay://miniapp?url=your-app.com
https://nimpay.app/miniapps/open/your-app.com
```

Desktop browsers are supported for layout and group logic. Real NIM / USDT settlement requires Nimiq Pay (or another host that injects the same providers).

## NIM payment implementation

Inspected from the installed `@nimiq/mini-app-sdk@0.1.0` types and official docs:

```ts
import { init } from '@nimiq/mini-app-sdk'

const nimiq = await init({ timeout: 10_000 })
const accounts = await nimiq.listAccounts()

const result = await nimiq.sendBasicTransactionWithData({
  recipient,          // NQ-… address
  value: luna,        // integer luna; 1 NIM = 100_000 luna
  data: 'Tabiq …',    // optional memo, max 64 bytes
})
```

- `sendBasicTransaction` / `sendBasicTransactionWithData` open native confirmation in Nimiq Pay.
- Values are **luna**, not NIM.
- The methods return a `string` (serialized tx / hash) or `{ error: { type, message } }`.
- Tabiq stores the returned string as `txHash` only when it is a non-empty success value.
- User rejection, missing tx id, or provider errors leave the payment **unpaid**.

The SDK does not expose `getBalance`. Insufficient NIM balance is reported from the wallet error after the user tries to send.

## USDT payment implementation

USDT is sent on **Polygon** through the injected EIP-1193 provider (`window.ethereum`).

- Token: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` (USDT, 6 decimals)
- Chain id: `0x89` (137)
- Flow: `eth_requestAccounts` → `wallet_switchEthereumChain` / `wallet_addEthereumChain` → `eth_call` `balanceOf` → `eth_sendTransaction` with ERC-20 `transfer(to, amount)`
- The payment is recorded only if `eth_sendTransaction` returns a `0x` transaction hash
- Receipt `status === 0x0` is treated as a failed payment, not settled

Tabiq never builds raw signed transactions and never asks for private keys.

## Network requirements

| Asset | Network | Provider |
| --- | --- | --- |
| NIM | Nimiq | `@nimiq/mini-app-sdk` (`window.nimiq`) |
| USDT | Polygon | `window.ethereum` |

Wrong-network, wallet-unavailable, and insufficient-USDT states are explicit in the Pay screen.

## How shared groups work

A group is identified by a short code (for example `FRIDAY`). Anyone with the code can join from another device or wallet. The Worker is the source of truth:

- creating / joining a group
- adding expenses and splits
- recording payment attempts and submitted hashes
- computing who owes whom from expenses minus settled payments

Clients may cache the last snapshot for resilience. If the backend is down, Tabiq says so and does not pretend a payment settled.

## How to run the demo

The Worker seeds **Friday Dinner** on first request.

| | |
| --- | --- |
| Group | Friday Dinner |
| Code | `FRIDAY` |
| Members | You, Alex, Sarah, David |
| Expense | Dinner — 40 NIM, paid by Alex |
| Split | Equal, 10 NIM each |

Judge path:

1. Open Tabiq in Nimiq Pay.
2. Tap **Join Friday Dinner** (or enter `FRIDAY`).
3. See the 40 NIM dinner and a 10 NIM share.
4. Tap **Pay** / **Pay your share**.
5. Approve the real NIM transaction in Nimiq Pay.
6. Return to Tabiq and see **Settled ✓** plus the transaction id / explorer link when the provider returns one.

Demo recipient addresses for Alex, Sarah, and David are deterministic Nimiq / Polygon addresses derived from labels. They are real on-chain destinations, not simulated balances. Do not send large amounts to the demo group.

## Known limitations

- NIM preflight balance checks are not possible with the current Mini App SDK (no `getBalance`).
- Tabiq treats a successful provider submission (tx id / hash) as settled. It does not wait for deep Nimiq confirmations.
- USDT is Polygon only.
- Paying a demo member sends real tokens to that demo address.
- Mini App provider methods only work inside Nimiq Pay (or a compatible host).
- Join codes do not expire; an unknown code is rejected as invalid.

## License

[MIT](./LICENSE)
