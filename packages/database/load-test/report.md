# NFR-05 load-test report

**Target:** p95 response time at or below 2 seconds for search and stock-view, under 10 concurrent users for 5 continuous minutes (CSV export excluded).

**Result:** ✅ PASS — p95 for both endpoints is at or below the 2 s budget.

## Load

- Concurrent users: 10
- Duration: 5 minute(s) (300000 ms)
- Dataset: 1,000 products, 10,000 movements

## Latency by endpoint

| Endpoint                         | Requests | min  | mean | p95       | max   | Verdict          |
| -------------------------------- | -------- | ---- | ---- | --------- | ----- | ---------------- |
| Search (GET /products)           | 280066   | 0 ms | 5 ms | **10 ms** | 69 ms | ✅ within budget |
| Stock-view (GET /stock/balances) | 280066   | 1 ms | 5 ms | **9 ms**  | 68 ms | ✅ within budget |

## Environment (for RetailOne approval)

- Environment: Docker Postgres 18 (compose) on the author machine — Apple M5, 10 cores, 16 GB; API query layer measured directly (no HTTP), recorded for RetailOne to approve the environment before UAT
- Database: `postgresql://erp:***@localhost:5432/erp_load`
- Run finished: 2026-10-27T08:38:11.414Z

## Machine

- OS: darwin 25.5.0 (arm64)
- CPU: Apple M5 × 10
- Memory: 16 GB
- Node: v24.19.0
