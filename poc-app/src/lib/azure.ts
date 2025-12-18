/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

type SearchDoc = {
  id?: string;
  title?: string;
  content?: string;
  lab?: string;
  instrument?: string;
  testType?: string;
  status?: string;
  date?: string;
  count?: number;
};

export type QueryRow = {
  date: string;
  testType: string;
  count: number;
  status: string;
  lab?: string;
  instrument?: string;
};

const requiredEnv = (key: string) => process.env[key];

const azureSearchConfig = () => {
  const endpoint = requiredEnv("AZURE_SEARCH_ENDPOINT");
  const apiKey = requiredEnv("AZURE_SEARCH_API_KEY");
  const index = requiredEnv("AZURE_SEARCH_INDEX");
  if (!endpoint || !apiKey || !index) return null;
  return { endpoint, apiKey, index };
};

const azureOpenAIConfig = () => {
  const endpoint = requiredEnv("AZURE_OPENAI_ENDPOINT");
  const apiKey = requiredEnv("AZURE_OPENAI_API_KEY");
  const deployment = requiredEnv("AZURE_OPENAI_DEPLOYMENT");
  const apiVersion = requiredEnv("AZURE_OPENAI_API_VERSION");
  if (!endpoint || !apiKey || !deployment || !apiVersion) return null;
  return { endpoint, apiKey, deployment, apiVersion };
};

export type DecisionPlan = {
  isGreeting: boolean;
  isDataSourceRequired: boolean;
  dataSource: "ai_search" | null;
  searchQuery: string | null;
  top: number | null;
  defaultAnswer: string | null;
};

const decisionExamples = [
  {
    isGreeting: false,
    isDataSourceRequired: true,
    dataSource: "ai_search",
    question: "Show me 10 failed tests.",
    defaultAnswer: "No results found in the data source for this query.",
    searchQuery: "failed tests",
    top: 10,
  },
  {
    isGreeting: true,
    isDataSourceRequired: false,
    dataSource: null,
    question: "Hi",
    defaultAnswer: "I'm here to help you with lab operations. How can I assist you today?",
    searchQuery: null,
    top: null,
  },
  {
    isGreeting: false,
    isDataSourceRequired: true,
    dataSource: "ai_search",
    question: "What does the OptiDist manual say about calibration?",
    defaultAnswer: "No results found in the data source for this query.",
    searchQuery: "OptiDist calibration manual",
    top: 5,
  },
  {
    isGreeting: false,
    isDataSourceRequired: true,
    dataSource: "ai_search",
    question: "Find information about maintenance procedures",
    defaultAnswer: "No results found in the data source for this query.",
    searchQuery: "maintenance procedures",
    top: 5,
  },
  {
    isGreeting: false,
    isDataSourceRequired: true,
    dataSource: "ai_search",
    question: "What's the root cause of Optidist heater error and how can i fix it?",
    defaultAnswer: "No results found in the data source for this query.",
    searchQuery: "heater error root cause",
    top: 5,
  },
  {
    isGreeting: false,
    isDataSourceRequired: true,
    dataSource: "ai_search",
    question: "What's the proactive action for Heater power error?",
    defaultAnswer: "No results found in the data source for this query.",
    searchQuery: "Heater power error proactive action",
    top: 5,
  },
];

const decisionPrompt = (question: string) => {
  return `You are a lab operations assistant. Decide how to answer or which tool to call.
Return JSON only with keys: isGreeting (boolean), isDataSourceRequired (boolean), dataSource ("ai_search" or null), searchQuery (string or null), top (number or null), defaultAnswer (string or null).

Rules:
- If it's a greeting (hi, hello, hey), isGreeting=true and no datasource.
- ALWAYS use ai_search for: error questions, root cause questions, "how to fix", "what is the cause", "proactive action", "reactive action", manual/documentation questions, OptiDist questions, heater errors, calibration, troubleshooting.
- If the user asks for lab data (tests, downtime, maintenance, utilization, trends, counts, CSV data), use ai_search.
- If the user asks about manuals, procedures, documentation, PDFs, error codes, or "what does X say", use ai_search.
- Extract key terms for searchQuery (e.g., "heater error" from "root cause of heater error", "OptiDist calibration" from "what does OptiDist manual say about calibration").
- Set top to 5-10 for error/documentation questions, 10-20 for data queries.
- If no datasource is needed (only greetings), answer via defaultAnswer.

Examples:
${JSON.stringify(decisionExamples, null, 2)}

Question: ${question}
JSON:`;
};

const safeParseJson = (text: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const decidePlan = async (question: string): Promise<DecisionPlan> => {
  const cfg = azureOpenAIConfig();
  const qLower = question.toLowerCase();
  const fallback: DecisionPlan = {
    isGreeting: /^(hi|hello|hey|hola|howdy|sup|yo)\b/i.test(question.trim()),
    isDataSourceRequired: /test|tests|downtime|maintenance|utilization|trend|count|schedule|performed|list|history|last|past|month|week|day|analysis|optidist|optiflash|error|errors|root cause|cause|fix|how to|proactive|reactive|action|manual|documentation|doc|pdf|csv|calibration|troubleshoot|heater|power/i.test(
      qLower,
    ),
    dataSource: "ai_search",
    searchQuery: question,
    top: 5,
    defaultAnswer: "I'm here to help you with lab operations. How can I assist you today?",
  };

  if (!cfg) return fallback;

  const body = {
    messages: [
      { role: "system", content: "You return JSON only." },
      { role: "user", content: decisionPrompt(question) },
    ],
    max_tokens: 200,
    temperature: 0,
    response_format: { type: "json_object" },
  };

  try {
    const res = await fetch(
      `${cfg.endpoint}/openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.apiVersion}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": cfg.apiKey,
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = content && safeParseJson(content);
    if (!parsed) return fallback;
    return {
      isGreeting: !!parsed.isGreeting,
      isDataSourceRequired: !!parsed.isDataSourceRequired,
      dataSource: parsed.dataSource === "ai_search" ? "ai_search" : null,
      searchQuery: parsed.searchQuery ?? question,
      top: parsed.top ?? 5,
      defaultAnswer: parsed.defaultAnswer ?? fallback.defaultAnswer,
    };
  } catch {
    return fallback;
  }
};

export type SearchResult = {
  rows: QueryRow[];
  documents: Array<{
    id: string;
    title: string;
    content: string;
    fileName?: string;
    fileType?: string;
  }>;
};

export const fetchSearchRows = async (query: string, top = 20): Promise<SearchResult> => {
  const cfg = azureSearchConfig();
  if (!cfg) {
    throw new Error("Azure Search env vars missing (AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY, AZURE_SEARCH_INDEX)");
  }

  const payload = {
    search: query?.trim() || "*",
    top: top > 0 ? Math.min(top, 50) : 20,
    select: "id,title,content,lab,instrument,testType,status,date,count,fileName,fileType,metadata_storage_name",
  };

  const res = await fetch(
    `${cfg.endpoint}/indexes/${cfg.index}/docs/search?api-version=2025-08-01-preview`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": cfg.apiKey,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search query failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const docs: SearchDoc[] = data.value ?? [];

  const rows: QueryRow[] = docs
    .filter((doc) => doc.testType || doc.status) // Only structured data
    .map((doc) => ({
      date: doc.date ?? "",
      testType: doc.testType ?? doc.title ?? "N/A",
      count: typeof doc.count === "number" ? doc.count : 1,
      status: doc.status ?? "Unknown",
      lab: doc.lab,
      instrument: doc.instrument,
    }));

  const documents = docs
    .filter((doc) => doc.content && doc.content.length > 50) // Has substantial content
    .map((doc) => ({
      id: doc.id ?? "",
      title: doc.title ?? "Untitled",
      content: doc.content ?? "",
      fileName: (doc as any).fileName || (doc as any).metadata_storage_name || "",
      fileType: (doc as any).fileType || "",
    }));

  return { rows, documents };
};

export const buildSummaryWithOpenAI = async (
  question: string,
  rows: QueryRow[],
  documents?: Array<{ id: string; title: string; content: string; fileName?: string; fileType?: string }>,
) => {
  const cfg = azureOpenAIConfig();
  if (!cfg) return null;

  const total = rows.reduce((acc, r) => acc + (r.count || 0), 0);
  const hasDocuments = documents && documents.length > 0;

  let systemPrompt = "You are a helpful lab operations assistant.";
  let userContent = `Question: ${question}\n`;

  if (hasDocuments) {
    systemPrompt =
      "You are a lab operations assistant. You MUST extract and explain information ONLY from the provided document excerpts. DO NOT provide generic answers. For CSV/tabular data with error codes, the data is tab-separated with columns: Code, Error Name, Root Causes, Proactive Actions, Reactive Actions. Extract the EXACT text from these columns. Format your answer with HTML: use <h3> for section headings, <ul><li> for bullet lists, <p> for paragraphs, <strong> for emphasis, and <br/> for line breaks. Always cite which document the information comes from (e.g., 'According to [Document Name]...'). If the information isn't in the documents, say 'The information is not available in the provided documents.'";
    
    // Format documents better - detect CSV and format tab-separated data more clearly
    const docSnippets = documents
      .slice(0, 5)
      .map((doc, idx) => {
        let content = doc.content.substring(0, 4000);
        // If it looks like tab-separated CSV, add a note about the structure
        if (doc.fileName?.endsWith('.csv') || doc.fileType?.includes('csv')) {
          content = `[CSV/Tabular Error Code Data - columns are separated by tabs]\n${content}`;
        }
        return `[Document ${idx + 1}: ${doc.title || doc.fileName || "Manual"}]\n${content}${doc.content.length > 4000 ? "..." : ""}`;
      })
      .join("\n\n---\n\n");
    
    userContent += `\n\nCRITICAL INSTRUCTIONS:
1. Answer using ONLY information from the document excerpts above - DO NOT make up or infer information
2. For questions about errors (like "heater error", "heater power error"), look for error code tables in the CSV documents
3. The CSV data is tab-separated. Find the row with the matching error code/name and extract:
   - Error Code number
   - Root Causes (exact text from the "Cause" or "Root Causes" column)
   - Proactive Actions (exact text from the "Proactive Actions" column)
   - Reactive Actions (exact text from the "Reactive Actions" column)
4. Copy the EXACT text from the documents - do not paraphrase or generalize
5. Format your answer with HTML: <h3>Root Causes</h3>, <ul><li> for lists, <p> for paragraphs
6. Cite the source document name
7. DO NOT provide generic troubleshooting steps - only use what's in the documents

Example: If the document shows "Error 6: Heater power - Root Causes: Product compatibility, Heater physical damage - Proactive: Regularly verify analyzer application limits", extract and use that EXACT information.

Relevant document excerpts:\n${docSnippets}`;
  } else if (rows.length > 0) {
    systemPrompt =
      "You are a concise lab operations assistant. Summarize the tabular data in 1-2 clear sentences, highlighting key insights.";
    const lines = rows
      .slice(0, 8)
      .map((r) => `${r.date} | ${r.testType} | count=${r.count} | status=${r.status}`)
      .join("\n");
    userContent += `\nTotal count: ${total}\nData:\n${lines}`;
  } else {
    systemPrompt = "You are a helpful lab operations assistant. Answer the question directly and concisely.";
  }

  const body = {
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    max_tokens: hasDocuments ? 2000 : 500,
    temperature: 0.3,
  };

  const url = `${cfg.endpoint}/openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.apiVersion}`;
  console.log(`Calling Azure OpenAI: deployment=${cfg.deployment}, api-version=${cfg.apiVersion}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": cfg.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Azure OpenAI API error: ${res.status} ${errorText}`);
    console.error(`Request URL: ${url}`);
    console.error(`Deployment name from env: ${cfg.deployment}`);
    
    // Check if it's a rate limit error
    if (res.status === 429) {
      let retryAfter = null;
      try {
        const errorJson = JSON.parse(errorText);
        const message = errorJson?.error?.message || "";
        // Extract retry time from message if available
        const retryMatch = message.match(/retry after (\d+) seconds/i);
        if (retryMatch) {
          retryAfter = parseInt(retryMatch[1], 10);
        }
      } catch {
        // Ignore JSON parse errors
      }
      const error = new Error("RATE_LIMIT_ERROR");
      (error as any).status = 429;
      (error as any).retryAfter = retryAfter;
      throw error;
    }
    
    return null;
  }

  const data = await res.json();
  const msg = data?.choices?.[0]?.message?.content;
  if (!msg) {
    console.error("Azure OpenAI returned empty content:", JSON.stringify(data, null, 2));
    console.error("Response structure:", {
      hasChoices: !!data?.choices,
      choicesLength: data?.choices?.length,
      firstChoice: data?.choices?.[0],
      hasMessage: !!data?.choices?.[0]?.message,
      messageContent: data?.choices?.[0]?.message?.content,
    });
  } else {
    console.log(`Azure OpenAI returned ${msg.length} characters of content`);
  }
  return msg ?? null;
};

export const errorResponse = (message: string, status = 500) =>
  NextResponse.json({ error: message }, { status });
