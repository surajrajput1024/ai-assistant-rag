PACE AI Assistance POC (SSR + Azure OpenAI)
===========================================

Purpose
-------
Demonstrate the AI Assistance flows shown in the Prototype using a separate POC app: new chat creation, suggested questions (list/add/delete), and tabular answers with totals. The POC runs on Next.js with server-side rendering and uses Azure OpenAI for LLM calls. Data is mocked locally at first, with a clear path to ingest real lab data into Postgres + Azure AI Search.

Scope for the POC
-----------------
- New Chat modal with required title; created chat appears in History.
- Suggested Questions bar backed by API; clicking runs a query and renders results.
- Manage Suggested Questions modal with list/add/delete (optimistic updates).
- Results pane showing table rows and a totals line (loading/error/empty states).
- Minimal persistence: start with in-memory/mock; optional Postgres wiring if time permits.

Tech Stack
----------
- Next.js 14 (App Router) + TypeScript; server components for SSR.
- API routes (or server actions) for chats and suggested-questions.
- Azure OpenAI (GPT-4o/4o-mini) for LLM responses; temperature kept low for determinism.
- Data layer options:
  - Phase 1 (fast): in-memory store seeded at boot.
  - Phase 2 (realistic): Postgres via Prisma; Azure AI Search for semantic retrieval.
- Styling: existing design system or minimal custom components (modals, pills, table).
- State/query: TanStack Query on the client for mutations and cache invalidation.

Data to ingest (for realistic runs)
-----------------------------------
1) Tests executed: date, lab, instrument, test type, status, count.
2) Downtime events: instrument, lab, start/end, duration, reason, severity.
3) Maintenance schedules: instrument, planned date, window, status, assignee.
4) Utilization metrics: instrument, lab, interval (day/week/month), availability %, run hours.
5) Instruments and labs: IDs, names, location, model, owner, criticality.
6) Suggested questions seed list (the six shown in the UI).

Deployment/runtime assumptions
------------------------------
- Node 18+.
- Azure resources: Azure OpenAI (endpoint, deployment name, api-version, api-key); optionally Azure AI Search (endpoint, api-key, index) and Azure Postgres (connection string).
- Environment-only secrets; no keys in code or repo.

Local setup (POC)
-----------------
1) Install deps: `npm install`
2) Run dev server: `npm run dev`
3) Open: http://localhost:3000
4) Default mode: uses mock data (no Azure calls) unless env vars are set.

Environment variables (`.env.local`)
------------------------------------
```
AZURE_OPENAI_ENDPOINT=https://<your>.openai.azure.com
AZURE_OPENAI_API_KEY=***
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-08-01-preview

# Optional if enabling retrieval
AZURE_SEARCH_ENDPOINT=https://<your>.search.windows.net
AZURE_SEARCH_API_KEY=***
AZURE_SEARCH_INDEX=lab-assist

# Optional if enabling Postgres persistence
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

Planned routes / API surface
----------------------------
- `GET /api/suggested-questions` — list.
- `POST /api/suggested-questions` — add (text required).
- `DELETE /api/suggested-questions/:id` — delete.
- `POST /api/chats` — create chat session with title.
- `POST /api/query` — run a query (takes question + optional filters; returns rows + totals).
For SSR pages, server components call these directly; client components use TanStack Query for mutations and cache invalidation.

LLM flow (when Azure is enabled)
--------------------------------
1) Take the user question (or suggested question).
2) Retrieve contextual rows from Azure AI Search (and/or Postgres) filtered by lab/instrument/time.
3) Build a bounded prompt with:
   - user question
   - retrieved facts (tabular snippets)
   - instruction to answer concisely and return a table + totals
4) Call Azure OpenAI with low temperature; stream or return JSON-ish tabular payload for the UI.

Data ingestion plan (when moving past mocks)
--------------------------------------------
1) Land CSV/Parquet exports of tests, downtime, maintenance, utilization, instruments, labs into Azure Blob.
2) Ingest into Postgres with simple ELT scripts (e.g., Node or Python loaders).
3) Index the same tables into Azure AI Search (vector + keyword) with normalized fields for lab, instrument, date.
4) Keep an initial seed of suggested questions in Postgres.
For the POC, ship with seeded mock data files so the UI works without cloud dependencies.

UI slices to implement first
----------------------------
- Suggested Questions bar (read from `/api/suggested-questions`).
- Manage Suggested Questions modal (add/delete + optimistic rollback).
- New Chat modal (title required) and History list update.
- Results table component with totals row and empty/error/loading states.

Testing notes
-------------
- Component tests for modals and list interactions.
- API contract tests for suggested-questions CRUD (even against mock handlers).
- Snapshot/visual check for the table and totals line.

Next steps after POC
--------------------
- Swap mock store with Postgres + Azure AI Search.
- Add auth/roles (OEM admin vs others) to gate question management.
- Add export/share actions (copy link, CSV/PDF) on result sets.
- Add observability: request logging, latency/error metrics, and audit for question CRUD.
