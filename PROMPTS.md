# Prompts, Spec & Planning

> Required by submission guidelines: all markdowns and prompts used to create this repository.

---

## Initial Spec Analysis

**Assignment understood as:**
- High-throughput signal ingestion (10k/sec burst) with in-memory backpressure
- Debounce: 100 signals/component/10s → 1 Work Item
- Three persistence layers with distinct roles (PostgreSQL, MongoDB, Redis)
- Strategy Pattern for alerting, State Pattern for incident lifecycle
- React dashboard: live feed, detail view, RCA form
- Mandatory RCA to close an incident; MTTR auto-calc

---

## System Design Decisions

### Why decouple ingestion from persistence?
The HTTP thread must never block on DB writes. A `RingBuffer` acts as the backpressure valve — the ring buffer absorbs bursts while the async consumer drains at a sustainable rate. If persistence is slow, signals are dropped (with a counter) rather than crashing the process.

### Why PostgreSQL for Work Items?
Work Item transitions and RCA writes must be **ACID-transactional**. A partial write (status changed but RCA missing) would corrupt the incident lifecycle. PostgreSQL's `BEGIN/COMMIT/ROLLBACK` guarantees atomicity.

### Why MongoDB for signals?
Raw signals are schemaless blobs. Different component types have different `metadata` shapes. MongoDB's document model fits this perfectly. The 90-day TTL index handles automatic data hygiene. Querying signals by `workItemId` is efficient with a secondary index.

### Why Redis?
- **Dashboard cache**: PostgreSQL queries with JOINs are expensive. A 10s Redis TTL gives fast reads for the live feed.
- **Throughput counters**: `INCR` on per-second keys is O(1) and allows computing signals/sec without scanning the DB.
- **Timeseries**: Hash-per-minute-bucket (`HINCRBY`) stores severity counts per component. Queried as a range by key pattern.

### Strategy Pattern rationale
Alert properties (severity, channels, escalation time) vary by component type. Using a Strategy instead of a giant `if/else` means: (a) adding a new component type is one new class, zero changes to existing code; (b) each strategy is independently testable.

### State Pattern rationale
The incident lifecycle has strict valid transitions. The State pattern encodes these as compile-time constraints — an `OpenState` simply doesn't implement `resolve()`, so calling it throws `InvalidTransitionError`. This is safer than a string-comparison switch.

---

## Implementation Plan (executed in order)

1. Storage layer (postgres.js, mongo.js, redis.js) — foundation
2. RingBuffer — backpressure primitive
3. Debouncer — signal grouping logic
4. AlertStrategy — severity assignment
5. StateMachine — lifecycle enforcement
6. WorkItemService — business logic tying everything together
7. SignalProcessor — async consumer loop
8. API routes (signals, work-items, health)
9. WebSocket for live broadcast
10. React frontend (Dashboard, IncidentDetail, AllIncidents, IngestSignal)
11. Docker Compose + Nginx
12. Unit tests
13. Mock failure script
14. README + PROMPTS.md

---

## RCA Validation Rules

A Work Item **cannot** transition to `CLOSED` unless the RCA has all of:
- `incident_start` — valid ISO datetime
- `incident_end` — valid ISO datetime, strictly after `incident_start`
- `root_cause_category` — one of the 8 defined categories
- `fix_applied` — non-empty string (min 10 chars)
- `prevention_steps` — non-empty string (min 10 chars)

This is enforced at two levels:
1. **State Machine** (`validateRCA`) — throws `RCAMissingError` before any DB write
2. **API layer** (`Joi`) — rejects malformed payloads before they reach the service layer
