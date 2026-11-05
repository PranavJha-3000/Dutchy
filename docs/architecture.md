# Dutchy — Architecture

## Overview

Dutchy is a small shared-bill splitter for a household ("home"). A home has members.
A bill is split into one share per member. Each member can pay their own share.
Outstanding balances aggregate unpaid shares across all bills of the home.

The system is a two-tier web application:

- **Frontend:** React + Vite + TanStack Router, served as a static SPA.
- **Backend:** Hono running on Cloudflare Workers, persisting data in Cloudflare D1 (SQLite).

## Technology roles

| Technology         | Role                                      |
| ------------------ | ----------------------------------------- |
| React 19           | Component-based UI, state, forms          |
| Vite 8             | Build tool, dev server, development proxy |
| TanStack Router    | File-based routing (`/`, `/home/$homeId`) |
| Hono               | Lightweight HTTP framework for the API    |
| Cloudflare Workers | Serverless runtime for the Hono app       |
| Cloudflare D1      | SQLite database binding (`DB`)            |
| Biome              | Formatting and linting                    |
| Vitest             | API tests in the Workers runtime          |

## Diagram 1 — System Architecture

```mermaid
flowchart TD
  subgraph Browser["Browser"]
    UI["React UI components"]
    RT["TanStack Router"]
    AC["Frontend API client (fetch)"]
  end

  subgraph DevOnly["Development only"]
    VP["Vite dev proxy (/api -> localhost:8787)"]
  end

  subgraph Cloudflare["Cloudflare"]
    Hono["Hono API (app)"]
    WR["Cloudflare Workers runtime"]
    D1["Cloudflare D1 (SQLite)"]
  end

  subgraph Tables["D1 tables"]
    homes["homes (id, name, created_at)"]
    members["members (id, home_id, name, position, created_at)"]
    bills["bills (id, home_id, title, total_cents, created_at)"]
    shares["shares (id, bill_id, member_id, amount_cents, paid_at, paid_by_key)"]
  end

  UI --> RT --> AC
  AC -->|development| VP --> Hono
  AC -->|production| Hono
  Hono --> WR --> D1
  D1 --> homes
  D1 --> members
  D1 --> bills
  D1 --> shares

  homes -->|1:N| members
  homes -->|1:N| bills
  bills -->|1:N| shares
  members -->|1:N| shares
```

### Notes

- In development, Vite proxies `/api/*` to the local Wrangler dev server (`http://localhost:8787`).
  This proxy exists only during development.
- In production, the frontend calls the API directly; there is no Vite proxy.
- `homes` owns members and bills. `bills` owns shares. `members` owns shares (who owes what).
- All amounts are stored as integer paise (`total_cents`, `amount_cents`).
## Diagram 2 — Bill Creation Sequence

```mermaid
sequenceDiagram
  participant U as User
  participant R as React UI
  participant C as API client
  participant H as Hono API
  participant D as Cloudflare D1

  U->>R: Submit bill form (title, total)
  R->>C: createBill(homeId, title, totalCents)
  C->>H: POST /api/homes/:homeId/bills
  H->>H: Validate JSON body and fields
  H->>D: SELECT home (existence check)
  H->>D: SELECT members ORDER BY position
  D-->>H: ordered members
  H->>H: Split totalCents (base + remainder)
  H->>D: Prepare INSERT bills + INSERT shares
  H->>D: DB.batch(statements)
  D-->>H: batch results
  H-->>C: 201 { id, homeId, title, totalCents, shares }
  C-->>R: created bill
  R->>C: getBills(homeId) + getBalances(homeId)
  C->>H: GET bills, GET balances
  H->>D: Query bills/shares/balances
  D-->>H: data
  H-->>C: bills and balances
  C-->>R: refresh UI
```

### Notes

- Validation rejects non-positive or non-integer totals and homes with no members.
- Remainder cents are distributed one-by-one to the first members in position order.
- `DB.batch()` makes bill + share inserts atomic.

## Diagram 3 — Payment and Idempotency Sequence

```mermaid
sequenceDiagram
  participant U as User
  participant R as React UI
  participant K as payKeysRef
  participant C as API client
  participant H as Hono API
  participant D as D1

  U->>R: Click Pay
  R->>K: key = existing ?? crypto.randomUUID()
  R->>C: payShare(billId, shareId, key)
  C->>H: POST /api/bills/:billId/shares/:shareId/pay
  H->>D: UPDATE shares SET paid_at, paid_by_key WHERE id=? AND bill_id=? AND paid_at IS NULL
  D-->>H: meta.changes
  alt changes == 1
    H->>D: SELECT member_id, amount_cents
    D-->>H: share
    H-->>C: 200 { id, memberId, amountCents, paidAt }
  else changes == 0 (already paid)
    H->>D: SELECT share (paid_at, paid_by_key)
    D-->>H: share
    alt paid_by_key == key
      H-->>C: 200 (original payment replayed)
    else
      H-->>C: 409 share already paid
    end
  end
  C-->>R: result or error
  R->>C: loadData() (getBills + getBalances)
  C->>H: GET bills, GET balances
  H-->>C: refreshed data
  C-->>R: update UI
```

### Notes

- Each share has its own idempotency key stored in `payKeysRef`.
- On a confirmed 200 the key is cleared; on an uncertain failure it is retained for retry.
- On a 409 (already paid) the key is cleared after refreshing server data.
- The `paid_at IS NULL` condition ensures only unpaid shares can be transitioned.
- Concurrency safety relies on the conditional UPDATE. Visible tests do not assert
  multi-request concurrency outcomes beyond the documented behavior.

## Diagram 4 — Database Entity Relationship Diagram

```mermaid
erDiagram
  HOMES ||--o{ MEMBERS : "has"
  HOMES ||--o{ BILLS : "has"
  BILLS ||--o{ SHARES : "split into"
  MEMBERS ||--o{ SHARES : "owes"

  HOMES {
    TEXT id PK
    TEXT name
    TEXT created_at
  }
  MEMBERS {
    TEXT id PK
    TEXT home_id FK
    TEXT name
    INTEGER position
    TEXT created_at
  }
  BILLS {
    TEXT id PK
    TEXT home_id FK
    TEXT title
    INTEGER total_cents
    TEXT created_at
  }
  SHARES {
    TEXT id PK
    TEXT bill_id FK
    TEXT member_id FK
    INTEGER amount_cents
    TEXT paid_at
    TEXT paid_by_key
  }
```

### Notes

Named constraints from `0001_init.sql`:

- `members_home_fk`: FK `members.home_id -> homes.id` (ON DELETE CASCADE)
- `members_position_nonnegative`: CHECK `position >= 0`
- `members_home_position_unique`: UNIQUE `(home_id, position)`
- `bills_home_fk`: FK `bills.home_id -> homes.id` (ON DELETE CASCADE)
- `bills_total_positive`: CHECK `total_cents > 0`
- `shares_bill_fk`: FK `shares.bill_id -> bills.id` (ON DELETE CASCADE)
- `shares_member_fk`: FK `shares.member_id -> members.id`
- `shares_amount_nonnegative`: CHECK `amount_cents >= 0`
- `shares_bill_member_unique`: UNIQUE `(bill_id, member_id)`

## Engineering decisions

From `README.md`:

1. **Integer cents and deterministic splitting.** Monetary values are stored as integer
   cents to avoid floating-point precision issues. When a total does not divide evenly,
   remainder cents go to the first members in position order (e.g. 1000 cents across 3
   members -> 334, 333, 333).

2. **Atomic bill creation with `DB.batch()`.** Bill insertion and all share insertions run
   in a single batch so a failure rolls back the whole operation; no partial data persists.

3. **Idempotent, concurrency-safe payment transition.** Payment uses a conditional
   UPDATE (`... WHERE id = ? AND bill_id = ? AND paid_at IS NULL`). Same key retries
   return 200; a different key on an already-paid share returns 409.

## Testing notes

- API tests live in `api/test/` (homes, bills, payments) and run under Vitest in the
  Workers runtime.
- `pnpm test`, `pnpm check`, `pnpm typecheck`, and `pnpm build` are the required
  verification commands.
- Concurrency claims are limited to the documented conditional-update behavior; the
  visible tests do not prove multi-request concurrency outcomes.
