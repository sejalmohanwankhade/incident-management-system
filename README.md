# 🛡 Incident Management System (IMS)

> Mission-critical incident management for distributed stacks — built for Zeotap Infrastructure/SRE Intern Assignment.

**GitHub:** _[add your link here]_

---

## Architecture Diagram

```
                         ┌─────────────────────────────────────────────────────┐
                         │                  CLIENT (Browser)                    │
                         │          React SPA  ·  WebSocket Live Feed           │
                         └────────────────────┬────────────────────────────────┘
                                              │ HTTP / WS
                         ┌────────────────────▼────────────────────────────────┐
                         │            BACKEND (Node.js / Express)               │
                         │                                                       │
                         │  ┌──────────────┐   Rate Limiter (express-rate-limit)│
  Signals (HTTP) ───────►│  │  Ingestion   │   5000 req/min per IP              │
                         │  │  API Layer   │                                     │
                         │  └──────┬───────┘                                    │
                         │         │ enqueue (non-blocking)                     │
                         │  ┌──────▼───────────────────────────────────┐       │
                         │  │   RingBuffer (100k cap, in-memory)        │       │
                         │  │   ← Backpressure: shed load if full       │       │
                         │  └──────┬───────────────────────────────────┘       │
                         │         │ drain (50ms poll, 200 items/batch)         │
                         │  ┌──────▼────────┐  ┌──────────────────────┐        │
                         │  │  Debouncer    │  │  Alert Strategy      │        │
                         │  │  (10s window) │  │  (Strategy Pattern)  │        │
                         │  └──────┬────────┘  └──────────────────────┘        │
                         │         │                                            │
                         │  ┌──────▼──────────────────────────────────┐        │
                         │  │  WorkItem State Machine (State Pattern)  │        │
                         │  │  OPEN → INVESTIGATING → RESOLVED → CLOSED│        │
                         │  └──────┬──────────────────────────────────┘        │
                         │         │                                            │
                         └─────────┼──────────────────────────────────────────-┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
   ┌──────────▼──────┐  ┌──────────▼──────┐  ┌─────────▼────────┐
   │   PostgreSQL     │  │    MongoDB       │  │     Redis        │
   │  (Source of      │  │  (Data Lake)     │  │  (Hot Cache +    │
   │   Truth)         │  │  Raw Signals     │  │   Timeseries)    │
   │  Work Items      │  │  Audit Log       │  │  Dashboard State │
   │  RCA Records     │  │  90-day TTL      │  │  Throughput      │
   │  Transactional   │  │  Queryable       │  │  Aggregations    │
   └──────────────────┘  └─────────────────┘  └──────────────────┘
```

### Data Flow

1. **Ingestion** — Signals arrive via `POST /api/signals` (single) or `/batch` (up to 1000). Rate-limited to 5000 req/min.
2. **RingBuffer** — Non-blocking enqueue into a 100k-capacity circular buffer. System never crashes under load.
3. **Async Consumer** — Polls the buffer every 50ms in a tight loop, processing in parallel batches of 200.
4. **Debouncer** — Groups signals by `componentId` in 10-second windows. Creates exactly one Work Item per component burst.
5. **Persistence** — Raw signals → MongoDB (audit log). Work Items + RCA → PostgreSQL (transactional). Dashboard state → Redis (10s TTL).

---

## Design Patterns

| Pattern | Where used | Why |
|---|---|---|
| **Strategy** | `AlertStrategyContext` | Swap alerting logic (severity, channels) per component type without conditionals |
| **State** | `WorkItemStateMachine` | Enforces valid transitions; prevents illegal state jumps at compile time |
| **Ring Buffer** | `RingBuffer` | Absorbs traffic spikes without blocking the HTTP thread |
| **Repository** | `workItemService.js` | Separates business logic from storage concerns |

---

## Tech Stack Justification

| Component | Choice | Reason |
|---|---|---|
| Runtime | Node.js 20 | Event loop is ideal for I/O-bound signal ingestion; async/await concurrency |
| API | Express | Lightweight; easy rate-limit and middleware composition |
| Source of Truth | PostgreSQL 16 | ACID transactions for Work Item + RCA writes; relational integrity |
| Data Lake | MongoDB 7 | Schema-free; handles heterogeneous signal payloads; TTL index for auto-cleanup |
| Cache + TS | Redis 7 | Sub-ms reads for dashboard; `INCR` for throughput counters; hash-per-bucket for timeseries |
| Frontend | React 18 | Component model suits incident dashboard; react-router for SPA navigation |
| Proxy | Nginx | Serves React build; reverse-proxies API + WebSocket in production |

---

## Backpressure Strategy

The ingestion API and the persistence layer are deliberately decoupled:

1. **HTTP handlers never await database writes.** They enqueue into the `RingBuffer` and immediately return `202 Accepted`.
2. **RingBuffer is bounded at 100,000 items.** If the buffer is full (persistence is extremely slow), the oldest item is overwritten. The `droppedCount` metric surfaces this.
3. **Async consumer uses `Promise.allSettled`** so a single failing signal doesn't block the batch.
4. **Retry logic** (`queryWithRetry`) handles transient PostgreSQL errors with exponential back-off (up to 3 attempts).
5. **Rate limiter** on the ingestion route (5000 req/min) prevents a single upstream from exhausting the buffer.

---

## Setup & Running

### Prerequisites
- Docker 24+ and Docker Compose v2

### Quick Start

```bash
git clone <your-repo-url>
cd ims

# Start everything
docker compose up --build

# Dashboard
open http://localhost:3000

# API health check
curl http://localhost:3001/health
```

### Simulate a Failure (requires Node.js locally)

```bash
# Cascading failure: RDBMS → MCP → Cache → API → Queue
node scripts/mock-failure.js

# Debounce burst test (110 signals → 1 work item)
node scripts/mock-failure.js --burst

# Target a custom host
node scripts/mock-failure.js --url http://localhost:3001
```

### Run Backend Tests

```bash
cd backend
npm install
npm test
```

---

## API Reference

### Signal Ingestion
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/signals` | Ingest a single signal |
| `POST` | `/api/signals/batch` | Ingest up to 1000 signals |
| `GET` | `/api/signals/processor-stats` | Buffer/consumer stats |

### Work Items
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/work-items/active` | Live dashboard feed (cached) |
| `GET` | `/api/work-items` | All incidents (paginated, filterable) |
| `GET` | `/api/work-items/:id` | Incident detail + raw signals |
| `PATCH` | `/api/work-items/:id/transition` | Change status |
| `POST` | `/api/work-items/:id/rca` | Submit/update RCA |

### Observability
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health of all subsystems |
| `GET` | `/metrics` | Throughput stats |
| `GET` | `/metrics/timeseries/:componentId` | Per-component timeseries |

---

## Bonus Features Implemented

- **WebSocket live feed** — dashboard auto-refreshes on work item changes without polling
- **TTL index on signals** — MongoDB auto-expires raw signals after 90 days (data hygiene)
- **Helmet** security headers on all responses
- **Graceful shutdown** — `SIGTERM`/`SIGINT` handlers drain in-flight work before exit
- **Timeseries aggregations** in Redis — per-component, per-minute signal counts queryable via API
- **MTTR auto-calculation** — computed and stored on incident close from RCA timestamps
- **Pagination** on the all-incidents view
- **Comprehensive unit tests** — state machine, RCA validation, alert strategies, ring buffer

---

## Prompts & Planning

See [`PROMPTS.md`](./PROMPTS.md) for the specification prompts and plan used to design this system.
