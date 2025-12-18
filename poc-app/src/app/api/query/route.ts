import { NextResponse } from "next/server";
import { buildSummaryWithOpenAI, decidePlan, errorResponse, fetchSearchRows } from "@/lib/azure";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = body?.question ?? "Show me last month's downtime trend for OptiDist.";
    const plan = await decidePlan(question);
    console.log("Decision plan:", JSON.stringify(plan, null, 2));
    const availableTools = ["ai_search"];

    let rows: Awaited<ReturnType<typeof fetchSearchRows>>["rows"] = [];
    let documents: Awaited<ReturnType<typeof fetchSearchRows>>["documents"] = [];
    let usedDataSource = false;
    let dataSource: string | null = null;
    let answer: string | null = null;
    let llmSummary: string | null = null;

    if (plan.isGreeting) {
      answer = plan.defaultAnswer;
    } else if (plan.isDataSourceRequired && plan.dataSource === "ai_search") {
      try {
        console.log(`Calling Azure AI Search with query: "${plan.searchQuery || question}", top: ${plan.top ?? 5}`);
        const res = await fetchSearchRows(plan.searchQuery || question, plan.top ?? 5);
        rows = res.rows;
        documents = res.documents || [];
        console.log(`Azure AI Search results: ${rows.length} rows, ${documents.length} documents`);
        usedDataSource = true;
        dataSource = "ai_search";
      } catch (err) {
        console.error("Azure AI Search error:", err);
        usedDataSource = false;
        dataSource = null;
      }
    } else {
      console.log("AI Search NOT called - plan.isDataSourceRequired:", plan.isDataSourceRequired, "plan.dataSource:", plan.dataSource);
    }

    const totalCount = rows.reduce((sum, r) => sum + (r.count || 0), 0);
    let isRateLimitError = false;
    let retryAfterSeconds: number | null = null;
    
    // Always try to get LLM summary if we have documents or rows
    if (documents.length > 0 || rows.length > 0) {
      console.log(`Calling buildSummaryWithOpenAI with ${documents.length} documents, ${rows.length} rows`);
      llmSummary = await buildSummaryWithOpenAI(question, rows, documents.length > 0 ? documents : undefined).catch(
        (err: any) => {
          console.error("Error building summary:", err);
          console.error("Error details:", err instanceof Error ? err.message : String(err));
          
          // Check if it's a rate limit error
          if (err?.message === "RATE_LIMIT_ERROR" || err?.status === 429) {
            isRateLimitError = true;
            retryAfterSeconds = err?.retryAfter || null;
            console.log(`Rate limit detected. Retry after: ${retryAfterSeconds} seconds`);
          }
          
          return null;
        },
      );
      console.log(`buildSummaryWithOpenAI result: ${llmSummary ? `SUCCESS (${llmSummary.length} chars)` : "NULL/EMPTY"}`);
    }

    if (!llmSummary) {
      if (plan.isGreeting) {
        llmSummary = answer;
      } else if (isRateLimitError) {
        // Special handling for rate limit errors - don't show raw document excerpts
        const retryMessage = retryAfterSeconds 
          ? ` Please try again in about ${retryAfterSeconds} seconds.`
          : " Please try again in a few moments.";
        llmSummary = `I found relevant documents about your query, but I'm currently experiencing high demand.${retryMessage}`;
      } else if (usedDataSource && documents.length > 0 && rows.length === 0) {
        // Documents found but LLM processing failed (non-rate-limit error)
        const docNames = documents.map((d) => d.title || d.fileName || "Document").join(", ");
        llmSummary = `I found ${documents.length} relevant document(s) about your query: ${docNames}. However, I encountered an issue processing the content. Please try again or rephrase your question.`;
      } else if (usedDataSource && rows.length === 0 && documents.length === 0) {
        llmSummary = plan.defaultAnswer || "No results found in the data source for this query.";
      } else if (plan.isDataSourceRequired && !usedDataSource) {
        llmSummary = "I can’t answer this with the available resources.";
      } else {
        llmSummary = "Here’s my best take based on what I know.";
      }
    }

    if (!answer) answer = llmSummary ?? null;

    const messages = [];
    if (answer) {
      messages.push({ type: "text", content: answer });
    }
    if (rows.length) {
      messages.push({
        type: "table",
        rows,
        totalCount,
      });
    }

    return NextResponse.json({
      question,
      messages,
      usedDataSource,
      dataSource,
      availableTools,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return errorResponse(message);
  }
}
