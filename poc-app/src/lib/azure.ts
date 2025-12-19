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

  const payload: any = {
    search: query?.trim() || "*",
    top: top > 0 ? Math.min(top, 50) : 20,
    select: "id,title,content,lab,instrument,testType,status,date,count,fileName,fileType,metadata_storage_name",
    // Enable highlighting to get relevant snippets (works with regular search)
    highlight: "content",
    highlightPreTag: "<mark>",
    highlightPostTag: "</mark>",
    // Note: Semantic search requires Standard tier and configuration
    // If you want to enable it, see: https://learn.microsoft.com/en-us/azure/search/semantic-search-overview
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
    .map((doc: any) => {
      const fileName = doc.fileName || doc.metadata_storage_name || "";
      const fileType = doc.fileType || "";
      
      // Use highlighted snippets from Azure AI Search if available (semantic search results)
      // Azure AI Search returns highlighted snippets in @search.highlights.content
      let content = doc.content ?? "";
      const highlightData: Array<{ position: number; text: string }> = [];
      
      // Check for highlights and use them to locate relevant sections
      if (doc["@search.highlights"] && doc["@search.highlights"].content) {
        const highlights = doc["@search.highlights"].content;
        console.log(`Found ${highlights.length} highlighted snippets from Azure AI Search for ${fileName}`);
        
        // Find positions of highlights in the full content to extract surrounding context
        const contentLower = doc.content.toLowerCase();
        for (const highlight of highlights) {
          // Remove mark tags for searching
          const cleanHighlight = highlight.replace(/<mark>/gi, '').replace(/<\/mark>/gi, '').trim();
          if (cleanHighlight.length > 10) {
            // Try to find this highlight text in the content (exact match)
            const highlightLower = cleanHighlight.toLowerCase();
            let pos = contentLower.indexOf(highlightLower);
            
            // If exact match fails, try partial matching (first 50 chars)
            if (pos === -1 && cleanHighlight.length > 50) {
              const partialHighlight = cleanHighlight.substring(0, 50).toLowerCase();
              pos = contentLower.indexOf(partialHighlight);
            }
            
            // If still not found, try finding key words from highlight
            if (pos === -1) {
              const highlightWords = cleanHighlight.split(/\s+/).filter((w: string) => w.length > 4).slice(0, 3);
              if (highlightWords.length > 0) {
                const searchPattern = highlightWords.map((w: string) => w.toLowerCase()).join('.*?');
                const regex = new RegExp(searchPattern, 'i');
                const match = doc.content.match(regex);
                if (match && match.index !== undefined) {
                  pos = match.index;
                }
              }
            }
            
            if (pos > 0 && pos < doc.content.length) {
              highlightData.push({ position: pos, text: cleanHighlight });
              console.log(`Found highlight at position ${pos}: "${cleanHighlight.substring(0, 50)}..."`);
            } else {
              // Even if we can't find position, keep the highlight text as it's relevant
              // Use a position of -1 to indicate we should use the highlight text directly
              highlightData.push({ position: -1, text: cleanHighlight });
              console.log(`Highlight text found but position not located, will use text directly: "${cleanHighlight.substring(0, 50)}..."`);
            }
          }
        }
        
        // If we have highlights, use them (even if positions weren't found)
        if (highlightData.length > 0) {
          console.log(`Using ${highlightData.length} highlights from Azure AI Search for section extraction`);
        } else {
          console.log(`No highlights found, will use full content for extraction`);
          content = doc.content;
        }
      }
      // Fallback to captions if available
      else if (doc["@search.captions"] && doc["@search.captions"].length > 0) {
        const captions = doc["@search.captions"].map((c: any) => c.text || c.highlights || "").filter(Boolean);
        content = captions.join(" ... ");
        console.log(`Using ${captions.length} captions from Azure AI Search for ${fileName}`);
      }
      // Otherwise use full content (but we'll extract relevant sections later)
      else {
        content = doc.content ?? "";
        console.log(`Using full content for ${fileName} (no highlights/captions available)`);
      }
      
      const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
      console.log(`Document found: ${fileName}, type: ${fileType || fileExt}, content length: ${content.length}`);
      
      if (content.length < 100) {
        console.warn(`WARNING: Document ${fileName} has very short content (${content.length} chars). Content may not be properly extracted.`);
      }
      
      return {
        id: doc.id ?? "",
        title: doc.title ?? "Untitled",
        content: content,
        fileName: fileName,
        fileType: fileType,
        originalContent: doc.content ?? "", // Preserve original full content for section extraction
        highlightData: highlightData, // Pass highlight data (position + text) for intelligent selection
        searchScore: doc["@search.score"] ?? 0, // Azure AI Search relevance score
      };
    });

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
      "You are a lab operations assistant. You MUST extract and explain information ONLY from the provided document excerpts. DO NOT provide generic answers. Extract information from ANY document type (PDF, CSV, TXT, DOC, DOCX, etc.) exactly as written. Format your answer with HTML: use <h3> for section headings, <ul><li> for bullet lists, <p> for paragraphs, <strong> for emphasis, and <br/> for line breaks. Always cite which document the information comes from (e.g., 'According to [Document Name]...'). If the information isn't in the documents, say 'The information is not available in the provided documents.'";
    
    // Format documents better - handle all file types generically
    // Use documents in the order returned by Azure AI Search (already sorted by relevance)
    // Limit to top 3 most relevant documents to avoid token limits
    const docSnippets = documents
      .slice(0, 3)
      .map((doc, idx) => {
        const fileName = doc.fileName || "";
        const fileType = doc.fileType || "";
        const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
        
        // Determine file type for context
        const isCSV = fileExt === 'csv' || fileType?.toLowerCase().includes('csv');
        const isPDF = fileExt === 'pdf' || fileType?.toLowerCase().includes('pdf');
        const isTXT = fileExt === 'txt' || fileType?.toLowerCase().includes('text');
        const isDOC = ['doc', 'docx'].includes(fileExt) || fileType?.toLowerCase().includes('word');
        
        // Adjust content length based on document type
        // PDFs and DOC files typically have more content, CSVs are usually shorter
        // For PDFs, we'll use section extraction to find precise sections, so default can be smaller
        // Reduced limits to avoid token rate limits
        let maxLength = 2500;
        if (isPDF || isDOC) {
          maxLength = 4000; // Default for PDFs when no match found (section extraction will override)
        } else if (isCSV) {
          maxLength = 2000; // CSV data is usually more compact
        }
        
        // Work with the content from the document (already processed by fetchSearchRows)
        let content = doc.content;
        
        // Get original full content and highlight data if available
        const originalContent = (doc as any).originalContent || doc.content;
        const highlightData: Array<{ position: number; text: string }> = (doc as any).highlightData || [];
        
        // Check if content contains highlight markers (from Azure AI Search)
        const hasHighlightMarkers = content.includes('<mark>');
        
        // Only do section extraction if:
        // 1. It's a PDF
        // 2. We have a question
        // 3. Original content is long (likely full content, not already extracted snippets)
        // 4. We have highlight data OR content doesn't contain highlight markers
        const isLongContent = originalContent.length > 10000;
        const needsExtraction = isPDF && question && isLongContent && (highlightData.length > 0 || !hasHighlightMarkers);
        
        if (needsExtraction) {
          let bestMatchIndex = -1;
          let bestMatchScore = 0;
          
          const questionLower = question.toLowerCase();
          const contentLower = originalContent.toLowerCase();
          
          // Extract keywords from question GENERICALLY (no hardcoding)
          const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
          const questionKeywords = questionLower
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w))
            .filter(w => !/^\d+$/.test(w));
          
          // PRIMARY: Use Azure AI Search highlights (they're already relevant to the query)
          // This is like CSV - Azure AI Search found the relevant parts, we just extract around them
          if (highlightData.length > 0) {
            // Score each highlight based on question keywords (GENERIC - no hardcoding)
            let bestHighlight = highlightData[0];
            let bestHighlightScore = 0;
            
            for (const highlight of highlightData) {
              const highlightLower = highlight.text.toLowerCase();
              let score = 0;
              
              // Score based on keyword matches from the question (longer keywords are more important)
              for (const keyword of questionKeywords) {
                if (highlightLower.includes(keyword)) {
                  const weight = keyword.length > 4 ? 3 : 2;
                  score += weight;
                  // Bonus if keyword appears multiple times
                  const matches = (highlightLower.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                  score += (matches - 1) * weight;
                }
              }
              
              // Bonus for exact phrase match
              if (highlightLower.includes(questionLower.trim())) {
                score += 10;
              }
              
              // Track the best highlight
              if (score > bestHighlightScore) {
                bestHighlightScore = score;
                bestHighlight = highlight;
              }
            }
            
            // Use the best scoring highlight (Azure AI Search already filtered for relevance)
            bestMatchIndex = bestHighlight.position;
            bestMatchScore = 100 + bestHighlightScore;
            console.log(`Using Azure AI Search highlight position ${bestMatchIndex} (score: ${bestHighlightScore}) as match point for ${fileName}`);
            console.log(`Selected highlight: "${bestHighlight.text.substring(0, 80)}..."`);
            
            // If position is -1, we couldn't find it in content, so use highlight text directly
            if (bestMatchIndex === -1) {
              // Combine ALL highlights as content (Azure AI Search already found the relevant parts)
              // This is like CSV - use the highlights directly as they're already relevant
              const allHighlights = highlightData
                .map(h => h.text)
                .filter((text, idx, arr) => arr.indexOf(text) === idx) // Remove duplicates
                .join(' ... ');
              
              if (allHighlights.length > 0) {
                content = allHighlights;
                console.log(`Using ${highlightData.length} highlight(s) directly (${allHighlights.length} chars) since position not found in content`);
                // Skip section extraction, use highlights as-is (like CSV rows)
                bestMatchIndex = -2; // Special marker to skip extraction
              }
            }
          }
          
          // Fallback to keyword-based search if no highlights or no valid position
          if (bestMatchIndex === -1) {
            // Extract meaningful keywords from the question (generic, no hardcoding)
            // Filter out common stop words
            const allKeywords = questionLower
              .split(/\s+/)
              .filter(w => w.length > 2 && !stopWords.has(w))
              .filter(w => !/^\d+$/.test(w)); // Remove pure numbers
            
            // If no meaningful keywords, use the question as a phrase
            if (allKeywords.length === 0) {
              allKeywords.push(questionLower.trim());
            }
            
            // First, try to find exact phrase matches from the question
            const questionPhrase = questionLower.trim();
            const phraseIndex = contentLower.indexOf(questionPhrase);
            if (phraseIndex > 0 && phraseIndex < 250000) {
              bestMatchIndex = phraseIndex;
              bestMatchScore = 100;
              console.log(`Found exact question phrase in ${fileName} at position ${phraseIndex}`);
            }
            
            // If no exact phrase match, search for keyword matches
            if (bestMatchIndex === -1) {
              const searchRange = Math.min(originalContent.length - 2000, 250000);
              for (let i = 0; i < searchRange; i += 2000) {
                const section = originalContent.substring(i, i + 20000).toLowerCase();
                let score = 0;
                
                // Score based on keyword matches (weighted by keyword length)
                for (const keyword of allKeywords) {
                  const matches = (section.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                  // Longer keywords are more important
                  const weight = keyword.length > 4 ? 3 : 2;
                  score += matches * weight;
                }
                
                if (score > bestMatchScore) {
                  bestMatchScore = score;
                  bestMatchIndex = i;
                }
              }
            }
          }
          
          // Skip extraction if we're using highlights directly (bestMatchIndex === -2)
          if (bestMatchIndex === -2) {
            // Content is already set to highlights, try to extract page number from highlights or original content
            let pageNumber: number | null = null;
            const pagePatterns = [
              /Page\s+(\d+)\s+of\s+\d+/gi,
              /page\s+(\d+)/gi,
              /\b(\d+)\s+of\s+\d+\s+page/gi,
            ];
            
            // First try to find page number in the combined highlights
            for (const pattern of pagePatterns) {
              const matches = [...content.matchAll(pattern)];
              if (matches.length > 0) {
                pageNumber = parseInt(matches[0][1], 10);
                if (pageNumber) {
                  console.log(`Found page number: ${pageNumber} in highlights`);
                  break;
                }
              }
            }
            
            // If not found in highlights, try original content
            if (!pageNumber) {
              const searchWindow = originalContent.substring(0, Math.min(originalContent.length, 50000));
              for (const pattern of pagePatterns) {
                const matches = [...searchWindow.matchAll(pattern)];
                if (matches.length > 0) {
                  pageNumber = parseInt(matches[matches.length - 1][1], 10);
                  if (pageNumber) {
                    console.log(`Found page number: ${pageNumber} in document`);
                    break;
                  }
                }
              }
            }
            
            (doc as any).pageNumber = pageNumber;
            console.log(`Using highlights directly (${content.length} chars), skipping section extraction`);
          }
          // If we found a good match, extract only the relevant section
          else if (bestMatchIndex > 0 && bestMatchScore > 0) {
            // Extract page number near the match position (GENERIC - works for any document)
            let pageNumber: number | null = null;
            const pagePatterns = [
              /Page\s+(\d+)\s+of\s+\d+/gi,
              /page\s+(\d+)/gi,
              /\b(\d+)\s+of\s+\d+\s+page/gi,
            ];
            
            const searchWindow = originalContent.substring(Math.max(0, bestMatchIndex - 3000), Math.min(originalContent.length, bestMatchIndex + 3000));
            for (const pattern of pagePatterns) {
              const matches = [...searchWindow.matchAll(pattern)];
              if (matches.length > 0) {
                // Use the page number closest to our match
                const centerPos = 3000; // Center of search window
                let closestMatch = matches[0];
                let closestDist = Math.abs((matches[0].index || 0) - centerPos);
                for (const match of matches) {
                  const dist = Math.abs((match.index || 0) - centerPos);
                  if (dist < closestDist) {
                    closestDist = dist;
                    closestMatch = match;
                  }
                }
                pageNumber = parseInt(closestMatch[1], 10);
                if (pageNumber) {
                  console.log(`Found page number: ${pageNumber} near match position`);
                  break;
                }
              }
            }
            
            // Find section boundaries (headings, chapter markers, etc.) - GENERIC patterns
            const sectionMarkers = [
              /\n\d+\.\d+\.\d+\s+[A-Z]/g,  // "3.3.1 Subsection" style
              /\n\d+\.\d+\s+[A-Z]/g,       // "3.3 Section" style
              /\n\d+\.\s+[A-Z]/g,          // "3. SECTION" style
              /\nChapter\s+\d+/gi,          // "Chapter 3" style
              /\n[A-Z][A-Z\s]{10,}\n/g,    // ALL CAPS headings
              /\n\*\*\*[A-Z]/g,            // Section separators
            ];
            
            // Find the section start (look backwards for a heading)
            let sectionStart = bestMatchIndex;
            let foundSectionStart = false;
            const lookBackDistance = 5000;
            const searchStart = Math.max(0, bestMatchIndex - lookBackDistance);
            const textBefore = originalContent.substring(searchStart, bestMatchIndex);
            
            // Try to find the most recent section heading before the match
            for (const pattern of sectionMarkers) {
              const matches = [...textBefore.matchAll(pattern)];
              if (matches.length > 0) {
                const lastMatch = matches[matches.length - 1];
                const matchPos = searchStart + (lastMatch.index || 0);
                // Use this as section start if it's reasonably close (reduced from 8000 to 4000)
                if (bestMatchIndex - matchPos < 4000) {
                  sectionStart = matchPos;
                  foundSectionStart = true;
                  console.log(`Found section heading before match at position ${sectionStart}`);
                  break;
                }
              }
            }
            
            // If no section heading found, use a smaller window before the match
            if (!foundSectionStart) {
              sectionStart = Math.max(0, bestMatchIndex - 1500); // 1500 chars before match (reduced from 2000)
              console.log(`No section heading found, using ${sectionStart} (1500 chars before match)`);
            }
            
            // Find the section end (look forwards for next heading or limit to reasonable size)
            let sectionEnd = bestMatchIndex + 4000; // Default: 4000 chars after match (reduced from 6000)
            let foundSectionEnd = false;
            const lookForwardDistance = 8000; // Reduced from 15000
            const searchEnd = Math.min(originalContent.length, bestMatchIndex + lookForwardDistance);
            const textAfter = originalContent.substring(bestMatchIndex, searchEnd);
            
            // Try to find the next section heading
            for (const pattern of sectionMarkers) {
              const matches = [...textAfter.matchAll(pattern)];
              if (matches.length > 0) {
                const firstMatch = matches[0];
                const matchPos = bestMatchIndex + (firstMatch.index || 0);
                // Use this as section end if it's after our match and not too far (reduced from 12000 to 6000)
                if (matchPos > bestMatchIndex && matchPos < bestMatchIndex + 6000) {
                  sectionEnd = matchPos;
                  foundSectionEnd = true;
                  console.log(`Found next section heading after match at position ${sectionEnd}`);
                  break;
                }
              }
            }
            
            // If no section end found, use a reasonable limit
            if (!foundSectionEnd) {
              // Limit to 3000 chars total if no boundaries found, or 5000 if we found a start (reduced)
              const maxSectionSize = foundSectionStart ? 5000 : 3000;
              sectionEnd = Math.min(bestMatchIndex + maxSectionSize, originalContent.length);
              console.log(`No next section heading found, limiting to ${sectionEnd} (${sectionEnd - sectionStart} chars total)`);
            }
            
            // Ensure we don't exceed reasonable limits (reduced from 8000 to 5000)
            const maxSectionLength = 5000; // Max 5000 chars for precision (reduced to avoid token limits)
            sectionEnd = Math.min(sectionEnd, sectionStart + maxSectionLength);
            sectionEnd = Math.min(sectionEnd, originalContent.length);
            
            // Extract the precise section
            content = originalContent.substring(sectionStart, sectionEnd);
            
            // Store page number for later use in document label
            (doc as any).pageNumber = pageNumber;
            
            console.log(`Extracted precise section for "${question}" in ${fileName}${pageNumber ? ` (Page ${pageNumber})` : ""}`);
            console.log(`Section position: ${sectionStart}-${sectionEnd} (${sectionEnd - sectionStart} chars)`);
            console.log(`Section preview (first 300 chars): ${content.substring(0, 300)}...`);
            console.log(`Section preview (last 200 chars): ...${content.substring(Math.max(0, content.length - 200))}`);
          } else {
            // No match found - use a smaller chunk from beginning
            content = originalContent.substring(0, Math.min(maxLength, 3000));
            console.log(`No strong match found for "${question}" in ${fileName}, using first ${content.length} chars`);
          }
        } else if (isPDF && content.length > maxLength) {
          // Content is long but we're not extracting - just limit it
          content = content.substring(0, maxLength);
        }
        
        // Limit individual document content to avoid token limits
        const maxDocLength = 4000; // Max 4000 chars per document
        if (content.length > maxDocLength) {
          content = content.substring(0, maxDocLength) + "...";
          console.log(`Truncated ${fileName} content to ${maxDocLength} chars to avoid token limits`);
        }
        
        // Add context based on file type (optional, helps LLM understand structure)
        let typeLabel = "";
        if (isCSV) {
          typeLabel = "[CSV/Tabular Data]";
        } else if (isPDF) {
          typeLabel = "[PDF Document]";
        } else if (isDOC) {
          typeLabel = "[Word Document]";
        } else if (isTXT) {
          typeLabel = "[Text Document]";
        } else if (fileExt) {
          typeLabel = `[${fileExt.toUpperCase()} File]`;
        }
        
        // Include metadata in document label: page number, search score
        const searchScore = (doc as any).searchScore || 0;
        const pageInfo = (doc as any).pageNumber ? `, Page ${(doc as any).pageNumber}` : "";
        const scoreInfo = searchScore > 0 ? `, Score: ${searchScore.toFixed(2)}` : "";
        const docLabel = `[Document ${idx + 1}: ${doc.title || fileName || "Document"}${typeLabel ? ` ${typeLabel}` : ""}${pageInfo}${scoreInfo}]`;
        
        return `${docLabel}\n${content}${doc.content.length > maxLength ? "..." : ""}`;
      })
      .join("\n\n---\n\n");
    
    // Limit total content to avoid token rate limits (max 15000 chars total)
    const maxTotalContentLength = 15000;
    let finalDocSnippets = docSnippets;
    if (docSnippets.length > maxTotalContentLength) {
      finalDocSnippets = docSnippets.substring(0, maxTotalContentLength) + "\n\n[Content truncated to avoid token limits...]";
      console.log(`WARNING: Total content length (${docSnippets.length} chars) exceeds limit (${maxTotalContentLength} chars). Truncated.`);
    }
    
    // Log what we're sending to OpenAI for debugging
    const totalContentLength = finalDocSnippets.length;
    console.log(`Sending ${documents.length} documents to OpenAI, total content length: ${totalContentLength} chars`);
    console.log(`User question: "${question}"`);
    console.log(`First 1000 chars of content being sent: ${finalDocSnippets.substring(0, 1000)}...`);
    console.log(`Last 500 chars of content being sent: ...${finalDocSnippets.substring(Math.max(0, totalContentLength - 500))}`);
    
    userContent += `\n\nCRITICAL INSTRUCTIONS:
1. Answer using ONLY information from the document excerpts above - DO NOT make up or infer information
2. The document labels contain: Document name, file type, page number (if available), and search relevance score
3. Extract information from ANY document type (PDF, CSV, TXT, DOC, DOCX, etc.) exactly as written
4. For tabular data (CSV files): Find the relevant row and extract exact values from columns
5. For manuals/documents (PDF, DOC, DOCX): Extract the requested information exactly as written. Look for:
   - Section headings that match the question topic
   - Numbered steps, bullet points, and structured information
   - Complete sections related to the question (not just snippets)
   - Related content even if exact phrase isn't found
6. For text files (TXT): Extract any relevant information exactly as written
7. CONTENT EXTRACTION: Search through ALL the provided document excerpts for content related to the question:
   - Look for section headings, subsections, and relevant paragraphs
   - Extract COMPLETE information - don't stop at the first match
   - Include all relevant details, steps, instructions, or specifications
   - If information spans multiple paragraphs or sections, include all of them
8. Copy the EXACT text from the documents - do not paraphrase or generalize
9. Format your answer with HTML: <h3>Section Title</h3>, <ul><li> for lists, <p> for paragraphs, <strong> for emphasis, <ol><li> for numbered steps
10. CITATION REQUIREMENT: You MUST cite the source in your answer. Include:
    - Document name (from the document label, e.g., "OptiFuel Operation Manual G2.pdf")
    - Page number (if provided in the document label)
    - Search relevance score (if provided, e.g., "Score: 10.72")
    - Format: "According to [Document Name] (Page X, Score: Y)..." or "Source: [Document Name], Page X, Score Y"
11. DO NOT say "information is not available" unless you have thoroughly searched ALL the provided document excerpts and confirmed the information is truly missing
12. If the document contains tables, lists, or structured data, preserve that structure in your answer
13. Include relevant context like prerequisites, warnings, and related information when available
14. IMPORTANT: The document excerpts above contain relevant information. Read them carefully and extract the answer from them.

Relevant document excerpts:\n${finalDocSnippets}`;
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
    max_tokens: hasDocuments ? 2000 : 500, // Reduced to avoid token rate limits while still providing detailed answers
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
    // Log first 200 chars of response for debugging
    console.log(`Response preview: ${msg.substring(0, 200)}${msg.length > 200 ? "..." : ""}`);
    
    // If response is suspiciously short, log warning
    if (msg.length < 100) {
      console.warn(`WARNING: OpenAI response is very short (${msg.length} chars). This might indicate an issue with the prompt or content.`);
      console.warn(`Full response: "${msg}"`);
    }
  }
  return msg ?? null;
};

export const errorResponse = (message: string, status = 500) =>
  NextResponse.json({ error: message }, { status });
