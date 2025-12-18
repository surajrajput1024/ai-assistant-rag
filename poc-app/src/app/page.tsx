"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

type SuggestedQuestion = { id: string; text: string };
type ChatSession = { id: string; title: string; createdAt: string };
type ResultRow = { date: string; testType: string; count: number; status: string };
type Conversation = {
  id: string;
  question: string;
  createdAt: string;
  messages: Array<
    | { type: "text"; content: string }
    | { type: "table"; rows: ResultRow[]; totalCount: number | null }
  >;
};

const mockSaved = [
  { id: "s1", title: "Downtime trend for OptiDist", timeAgo: "2 hours ago" },
  { id: "s2", title: "Performance metrics comparison", timeAgo: "1 week ago" },
];

export default function Home() {
  const [suggested, setSuggested] = useState<SuggestedQuestion[]>([]);
  const [question, setQuestion] = useState("");
  const [conversationsByChat, setConversationsByChat] = useState<Record<string, Conversation[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showManageModal, setShowManageModal] = useState(false);
  const [newSuggestion, setNewSuggestion] = useState("");

  const [showChatModal, setShowChatModal] = useState(false);
  const [chatTitle, setChatTitle] = useState("");
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  useEffect(() => {
    const fetchSuggested = async () => {
      const res = await fetch("/api/suggested-questions", { cache: "no-store" });
      const data = await res.json();
      setSuggested(data.items ?? []);
    };
    const fetchChats = async () => {
      const res = await fetch("/api/chats", { cache: "no-store" });
      const data = await res.json();
      setChats(data.items ?? []);
      if (data.items?.length) {
        setActiveChatId(data.items[0].id);
      }
    };
    fetchSuggested();
    fetchChats();
  }, []);

  const askQuestion = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    let chatId = activeChatId;
    // if no active chat, create a local chat
    if (!chatId) {
      chatId = `${Date.now()}`;
      const localChat: ChatSession = { id: chatId, title: trimmed.slice(0, 40) || "New Chat", createdAt: new Date().toISOString() };
      setChats((prev) => [localChat, ...prev]);
      setActiveChatId(chatId);
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to fetch results");
      }
      const data = await res.json();
      const convo: Conversation = {
        id: `${Date.now()}`,
        question: trimmed,
        createdAt: new Date().toISOString(),
        messages: data.messages ?? [],
      };
      setConversationsByChat((prev) => {
        const current = prev[chatId!] ?? [];
        return { ...prev, [chatId!]: [convo, ...current] };
      });
      setQuestion("");
      setChats((prev) => {
        // if chat already exists, keep order with this chat on top
        const existing = prev.filter((c) => c.id !== chatId);
        const current = prev.find((c) => c.id === chatId);
        const updated = current
          ? [{ ...current, title: current.title || trimmed }, ...existing]
          : [{ id: chatId!, title: trimmed, createdAt: new Date().toISOString() }, ...existing];
        return updated;
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSuggestion = async () => {
    if (!newSuggestion.trim()) return;
    const res = await fetch("/api/suggested-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newSuggestion }),
    });
    if (res.ok) {
      const item = await res.json();
      setSuggested((prev) => [item, ...prev]);
      setNewSuggestion("");
    }
  };

  const handleDeleteSuggestion = async (id: string) => {
    await fetch(`/api/suggested-questions/${id}`, { method: "DELETE" });
    setSuggested((prev) => prev.filter((s) => s.id !== id));
  };

  const handleCreateChat = async () => {
    if (!chatTitle.trim()) return;
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: chatTitle }),
    });
    if (res.ok) {
      const item = await res.json();
      setChats((prev) => [item, ...prev]);
      setChatTitle("");
      setShowChatModal(false);
      setActiveChatId(item.id);
    }
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.nav}>
        <div className={styles.navBrand}>
          <div className={styles.logoMark}>P</div>
          <span className={styles.logoText}>PACE</span>
        </div>
        <div className={styles.navSectionTitle}>LAB OPERATIONS</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>Labs</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>Instruments</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>Progress Planner</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>Service Requests</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>Spare Parts</div>

        <div className={styles.navSectionTitle}>INSIGHTS & ANALYTICS</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>Advanced Analytics</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>Calibration & QC</div>
        <div className={`${styles.navItem} ${styles.navActive}`}>AI Assistance</div>

        <div className={styles.navSectionTitle}>IOT & CONNECTIVITY</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>IOT Gateway</div>

        <div className={styles.navSectionTitle}>ADMINISTRATION</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>User Management</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>PACe Knowledge Base</div>
        <div className={`${styles.navItem} ${styles.navInactive}`}>Org Management</div>

        <div className={styles.navFooter}>Version: 1.2.1 | Release Date: 30 Dec, 2024</div>
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.topBar}>
          <div className={styles.breadcrumb}>
            <span>AI Assistance</span>
          </div>
          <div className={styles.topActions}>
            <button className={styles.manageButton} onClick={() => setShowManageModal(true)}>
              Manage Suggested Questions
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <section className={styles.leftColumn}>
            <div className={styles.savedBlock}>
              <div className={styles.blockHeader}>
                <span>Saved</span>
                <span className={styles.subtle}>{mockSaved.length} Results</span>
              </div>
              {mockSaved.map((item) => (
                <div className={styles.savedCard} key={item.id}>
                  <div className={styles.cardTitle}>{item.title}</div>
                  <div className={styles.subtle}>{item.timeAgo}</div>
                  <div className={styles.star}>★</div>
                </div>
              ))}
            </div>

            <div className={styles.historyBlock}>
              <div className={styles.blockHeader}>History</div>
              <div className={styles.historyList}>
                {chats.length === 0 && <div className={styles.subtle}>No chats yet</div>}
                {chats.map((chat) => (
                <div
                  className={`${styles.historyCard} ${activeChatId === chat.id ? styles.historyCardActive : ""}`}
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                >
                  <div className={styles.cardTitle}>{chat.title}</div>
                  <div className={styles.subtle}>Just now</div>
                </div>
              ))}
              </div>
            </div>

            <button className={styles.newChatButton} onClick={() => setShowChatModal(true)}>
              New Chat
            </button>
          </section>

          <section className={styles.rightColumn}>
            <div className={styles.hero}>
              <div className={styles.orb} />
              <h2>What&apos;s happening today?</h2>
              <p>Ask questions about your lab operations, tests, and equipment performance</p>
              <div className={styles.suggestionRow}>
                {suggested.map((item) => (
                  <button
                    key={item.id}
                    className={styles.suggestionPill}
                    onClick={() => {
                      setQuestion(item.text);
                      askQuestion(item.text);
                    }}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.convoList}>
              {(conversationsByChat[activeChatId || ""] ?? []).map((c) => (
                <div className={styles.resultCard} key={c.id}>
                  <div className={styles.chatHeader}>
                    <span>{c.question}</span>
                    <span className={styles.chatTime}>
                      {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {c.messages.map((m, idx) => {
                    if (m.type === "text") {
                      // If content contains HTML tags, render as HTML; otherwise convert newlines to <br/>
                      const hasHTML = /<[a-z][\s\S]*>/i.test(m.content);
                      const htmlContent = hasHTML ? m.content : m.content.replace(/\n/g, "<br/>");
                      return (
                        <div key={idx} className={styles.summaryTop} dangerouslySetInnerHTML={{ __html: htmlContent }} />
                      );
                    }
                    if (m.type === "table") {
                      return (
                        <div key={idx} className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Test Type</th>
                                <th>Count</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.rows.map((row, rIdx) => (
                                <tr key={`${row.date}-${rIdx}`}>
                                  <td>{row.date || "-"}</td>
                                  <td>{row.testType}</td>
                                  <td>{row.count}</td>
                                  <td>
                                    <span className={styles.statusBadge}>{row.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {m.rows.length === 0 && !loading && <div className={styles.subtle}>No results yet.</div>}
                          {m.totalCount != null && <div className={styles.totals}>{`Total: ${m.totalCount} tests conducted`}</div>}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              ))}
            </div>

            <div className={styles.inputRow}>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && question.trim()) {
                    e.preventDefault();
                    askQuestion(question);
                  }
                }}
                placeholder="Type your question here..."
              />
              <button
                className={styles.sendButton}
                onClick={() => askQuestion(question)}
                disabled={loading || !question.trim()}
                aria-label="Send"
              >
                {loading ? "…" : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M21 3L3 11.5L10.5 13.5M21 3L14.5 21L10.5 13.5M21 3L10.5 13.5"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
          </section>
        </div>
      </div>

      {showManageModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>Manage Suggested Questions</h3>
            </div>
            <div className={styles.modalList}>
              {suggested.map((item) => (
                <div className={styles.modalRow} key={item.id}>
                  <span>{item.text}</span>
                  <button className={styles.iconButton} onClick={() => handleDeleteSuggestion(item.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className={styles.modalFooter}>
              <input
                value={newSuggestion}
                onChange={(e) => setNewSuggestion(e.target.value)}
                placeholder="Add new question..."
              />
              <button className={styles.primaryButton} onClick={handleAddSuggestion}>
                Save
              </button>
              <button className={styles.ghostButton} onClick={() => setShowManageModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showChatModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>Start New Chat</h3>
            </div>
            <div className={styles.modalBody}>
              <input
                value={chatTitle}
                onChange={(e) => setChatTitle(e.target.value)}
                placeholder="e.g., Monthly Lab Performance Review"
              />
              <div className={styles.tip}>Give your chat a descriptive title to easily find it later in your chat history</div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.ghostButton} onClick={() => setShowChatModal(false)}>
                Skip & Start Chat
              </button>
              <button className={styles.primaryButton} onClick={handleCreateChat}>
                Create Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
