# NFR-05 load-test report

**Target:** p95 response time at or below 2 seconds for search and stock-view, under 10 concurrent users for 5 continuous minutes (CSV export excluded).

**Result:** ✅ PASS — p95 for both endpoints is at or below the 2 s budget.

## Load

- Concurrent users: 10
- Duration: 5 minute(s) (300000 ms)
- Dataset: 1,000 products, 10,000 movements

## Latency by endpoint

Measured at the HTTP API (`http://localhost:3100/api`): each request is a real call through oRPC, the auth guard and JSON serialization, not a direct database query.

| Endpoint                         | Requests | min  | mean  | p95       | max   | Verdict          |
| -------------------------------- | -------- | ---- | ----- | --------- | ----- | ---------------- |
| Search (GET /products)           | 152252   | 2 ms | 10 ms | **15 ms** | 80 ms | ✅ within budget |
| Stock-view (GET /stock/balances) | 152252   | 3 ms | 10 ms | **13 ms** | 72 ms | ✅ within budget |

## Environment (for RetailOne approval)

- Environment: Docker Postgres 18 (compose) + API over HTTP on the author machine — Apple M5, 10 cores, 16 GB. Recorded for RetailOne to approve the environment before UAT.
- API: http://localhost:3100
- Database: `postgresql://erp:***@localhost:5432/erp_load`
- Run finished: 2026-10-27T08:51:44.611Z

## Machine

- OS: darwin 25.5.0 (arm64)
- CPU: Apple M5 × 10
- Memory: 16 GB
- Node: v24.19.0
