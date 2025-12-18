PACE AI Assistance POC (Next.js + Azure OpenAI + Azure AI Search)
================================================================

What’s included
---------------
- App Router, TypeScript, and a client UI that mirrors the prototype: sidebar with Saved/History, New Chat modal, Suggested Questions bar, Manage Suggested Questions modal, and a results table with totals.
- API routes:
  - `POST /api/query` → pulls rows from Azure AI Search (or mock) and optionally asks Azure OpenAI for a short summary.
  - `GET/POST /api/suggested-questions`, `DELETE /api/suggested-questions/[id]` → in-memory CRUD for suggested questions.
  - `GET/POST /api/chats` → in-memory chat list to populate the History panel.
- Mock fallbacks: if Azure env vars are missing, `/api/query` returns seeded rows that match the screenshot table.

Run locally
-----------
```bash
cd poc-app
npm install
npm run dev
# open http://localhost:3000
```

Environment variables (`.env.local`)
------------------------------------
```
AZURE_OPENAI_ENDPOINT=https://<your>.openai.azure.com
AZURE_OPENAI_API_KEY=***
AZURE_OPENAI_DEPLOYMENT=enrisk-openai-gpt4o
AZURE_OPENAI_API_VERSION=2025-01-01-preview

AZURE_SEARCH_ENDPOINT=https://pace-poc-ai-search.search.windows.net
AZURE_SEARCH_API_KEY=***
AZURE_SEARCH_INDEX=lab-documents-index
```
If Search vars are missing, the table uses mock data. If OpenAI vars are missing, summaries are skipped but the table still renders.

Data notes
----------
- The `lab-documents-index` index should have fields like `id`, `title`, `content`, `lab`, `instrument`, `testType`, `status`, `date`, `count`, `fileName`, `fileType`.
- Documents (PDFs, CSVs) are indexed from Azure Blob Storage via the indexer. See `docs/index.json` and `docs/indexer.json` for configuration.

UI flows to try
---------------
- Click a suggested question to run `/api/query` and populate the table + totals.
- Open “Manage Suggested Questions” to add/delete pills (optimistic, in-memory).
- “New Chat” creates a history item via `/api/chats`.

Future hardening (post-POC)
---------------------------
- Persist suggested questions and chats in Postgres.
- Swap in SWR/TanStack Query for client caching and revalidation.
- Add filters (lab, instrument, date range) to the Search payload.
- Gate manage actions by role when auth is available.
