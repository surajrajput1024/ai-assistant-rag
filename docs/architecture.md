AI Assistance POC – High-Level Flow
===================================

```mermaid
flowchart LR
  subgraph Client["Next.js UI (App Router)"]
    UIChat["New Chat modal"]
    UISuggest["Suggested Questions"]
    UIPrompt["Question input"]
    UITable["Results table"]
  end

  subgraph API["Next.js API routes (/api)"]
    APIQuery["/api/query"]
    APISugg["/api/suggested-questions"]
    APIChats["/api/chats"]
  end

  subgraph Azure["Azure Services"]
    Search["Azure AI Search<br/>index: labs"]
    OpenAI["Azure OpenAI<br/>deployment: gpt-4o"]
  end

  Client -->|selects/creates| APIChats
  Client -->|add/list/delete| APISugg
  Client -->|asks question| APIQuery

  APIQuery -->|fetch rows<br/>(lab/testType/status/date/count)| Search
  APIQuery -->|LLM summary| OpenAI
  Search -->|rows| APIQuery
  OpenAI -->|short summary| APIQuery
  APIQuery -->|rows + totals + summary| UITable

  classDef client fill:#e8f0fe,stroke:#1a73e8,stroke-width:1.5px,color:#0d1b2a;
  classDef api fill:#e6f4ea,stroke:#137333,stroke-width:1.5px,color:#0d1b2a;
  classDef azure fill:#e8f5fe,stroke:#0066cc,stroke-width:1.5px,color:#0d1b2a;

  class UIChat,UISuggest,UIPrompt,UITable client
  class APIQuery,APISugg,APIChats api
  class Search,OpenAI azure
```

Notes
-----
- If `AZURE_SEARCH_*` env vars are missing, `/api/query` falls back to mock rows (no outbound call).
- If `AZURE_OPENAI_*` env vars are missing, the summary is skipped but table rows still return.
- Data shape expected from Search: `id`, `title`, `content`, `lab`, `instrument`, `testType`, `status`, `date`, `count`.
