"use client";

import Link from "next/link";
import { BarChart3, Database, History, Home, RotateCcw, Save, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GuardrailCheckboxDefaults, GuardrailsConfig } from "@/types/guardrails";
import type { IndexedDocumentFile } from "@/types/document";

type AdminSection = "guardrails" | "history" | "analytics" | "index" | "settings";

interface GuardrailsPayload extends GuardrailsConfig {
  promptPreview: string;
}

interface QuestionLog {
  id: string;
  sourceId: string | null;
  question: string;
  answer: string;
  confidenceScore: number | null;
  confidenceLevel: "High" | "Medium" | "Low" | null;
  responseTimeMs: number | null;
  cacheHit: boolean;
  codexUsed: boolean;
  answerSource: string;
  createdAt: string;
  sources: Array<{ fileName: string; relativePath?: string; snippet?: string }>;
  retrievedChunks: Array<{ chunkId?: string; documentId?: string; relativePath?: string }>;
}

type QuestionSortKey = "createdAt" | "confidenceScore" | "responseTimeMs" | "cacheHit" | "codexUsed";
type SortDirection = "asc" | "desc";

interface Analytics {
  totalQuestions: number;
  questionsToday: number;
  questionsThisWeek: number;
  averageResponseTimeMs: number | null;
  cacheHitRate: number;
  confidenceDistribution: Record<"High" | "Medium" | "Low" | "Unknown", number>;
  mostAskedQuestions: Array<{ question: string; count: number }>;
  similarQuestionClusters: Array<{ label: string; count: number; questions: string[] }>;
  topReferencedDocuments: Array<{ source: string; count: number }>;
  unansweredOrLowConfidence: Array<{
    id: string;
    question: string;
    confidenceScore: number | null;
    createdAt: string;
  }>;
  questionsOverTime: Array<{ date: string; count: number }>;
}

interface IndexDocumentsPayload {
  ok: true;
  data: {
    documents: IndexedDocumentFile[];
  };
}

export function AdminDashboard() {
  const [activeSection, setActiveSection] = useState<AdminSection>("guardrails");
  const [guardrails, setGuardrails] = useState<GuardrailsPayload | null>(null);
  const [questions, setQuestions] = useState<QuestionLog[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [documents, setDocuments] = useState<IndexedDocumentFile[]>([]);
  const [search, setSearch] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [cacheFilter, setCacheFilter] = useState("ALL");
  const [codexFilter, setCodexFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [questionPage, setQuestionPage] = useState(1);
  const [questionSortKey, setQuestionSortKey] = useState<QuestionSortKey>("createdAt");
  const [questionSortDirection, setQuestionSortDirection] = useState<SortDirection>("desc");
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionLog | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadAdminData();
  }, []);

  async function loadAdminData() {
    const [guardrailsResponse, questionsResponse, analyticsResponse, documentsResponse] =
      await Promise.all([
        fetch("/api/admin/guardrails", { cache: "no-store" }),
        fetch("/api/admin/questions", { cache: "no-store" }),
        fetch("/api/admin/analytics", { cache: "no-store" }),
        fetch("/api/index/documents", { cache: "no-store" })
      ]);
    const [guardrailsPayload, questionsPayload, analyticsPayload, documentsPayload] =
      await Promise.all([
        guardrailsResponse.json(),
        questionsResponse.json(),
        analyticsResponse.json(),
        documentsResponse.json() as Promise<IndexDocumentsPayload>
      ]);

    if (guardrailsPayload.ok) {
      setGuardrails(guardrailsPayload.data);
    }
    if (questionsPayload.ok) {
      setQuestions(questionsPayload.data.questions);
    }
    if (analyticsPayload.ok) {
      setAnalytics(analyticsPayload.data);
    }
    if (documentsPayload.ok) {
      setDocuments(documentsPayload.data.documents);
    }
  }

  async function saveGuardrails() {
    if (!guardrails) {
      return;
    }

    setSaving(true);
    setStatus("");
    const response = await fetch("/api/admin/guardrails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        checkboxDefaults: guardrails.checkboxDefaults,
        userGuardrails: guardrails.userGuardrails
      })
    });
    const payload = await response.json();

    if (payload.ok) {
      setGuardrails(payload.data);
      setStatus("Guardrails saved.");
    } else {
      setStatus(payload.error || "Unable to save guardrails.");
    }
    setSaving(false);
  }

  async function resetGuardrails() {
    setSaving(true);
    setStatus("");
    const response = await fetch("/api/admin/guardrails/reset", { method: "POST" });
    const payload = await response.json();

    if (payload.ok) {
      setGuardrails(payload.data);
      setStatus("Guardrails reset to defaults.");
    } else {
      setStatus(payload.error || "Unable to reset guardrails.");
    }
    setSaving(false);
  }

  async function clearQuestionHistory() {
    const response = await fetch("/api/admin/questions", { method: "DELETE" });
    const payload = await response.json();

    if (payload.ok) {
      setQuestions([]);
      await loadAdminData();
      setStatus(`Cleared ${payload.data.deleted} question history entries.`);
    } else {
      setStatus(payload.error || "Unable to clear question history.");
    }
  }

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = questions.filter((question) => {
      const matchesSearch =
        !normalizedSearch ||
        question.question.toLowerCase().includes(normalizedSearch) ||
        question.answer.toLowerCase().includes(normalizedSearch);
      const matchesConfidence =
        confidenceFilter === "ALL" || question.confidenceLevel === confidenceFilter;
      const matchesSource = sourceFilter === "ALL" || question.sourceId === sourceFilter;
      const matchesCache =
        cacheFilter === "ALL" || question.cacheHit === (cacheFilter === "true");
      const matchesCodex =
        codexFilter === "ALL" || question.codexUsed === (codexFilter === "true");
      const matchesFrom = !fromDate || question.createdAt.slice(0, 10) >= fromDate;
      const matchesTo = !toDate || question.createdAt.slice(0, 10) <= toDate;

      return (
        matchesSearch &&
        matchesConfidence &&
        matchesSource &&
        matchesCache &&
        matchesCodex &&
        matchesFrom &&
        matchesTo
      );
    });

    return [...filtered].sort((a, b) => compareQuestions(a, b, questionSortKey, questionSortDirection));
  }, [
    cacheFilter,
    codexFilter,
    confidenceFilter,
    fromDate,
    questionSortDirection,
    questionSortKey,
    questions,
    search,
    sourceFilter,
    toDate
  ]);

  function updateQuestionSort(key: QuestionSortKey) {
    if (questionSortKey === key) {
      setQuestionSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setQuestionSortKey(key);
    setQuestionSortDirection("desc");
  }

  function updateQuestionFilter(update: () => void) {
    update();
    setQuestionPage(1);
  }

  return (
    <main className="page-shell">
      <header className="page-header compact">
        <div>
          <h1>Admin</h1>
          <p>Manage guardrails, question history, analytics, and the local document index.</p>
        </div>
        <Link className="button secondary" href="/">
          <Home aria-hidden="true" size={16} />
          Back to Chat
        </Link>
      </header>

      <nav className="admin-tabs" aria-label="Admin sections">
        <AdminTab
          active={activeSection === "guardrails"}
          icon={<Shield aria-hidden="true" size={16} />}
          label="Guardrails"
          onClick={() => setActiveSection("guardrails")}
        />
        <AdminTab
          active={activeSection === "history"}
          icon={<History aria-hidden="true" size={16} />}
          label="Question History"
          onClick={() => setActiveSection("history")}
        />
        <AdminTab
          active={activeSection === "analytics"}
          icon={<BarChart3 aria-hidden="true" size={16} />}
          label="Analytics"
          onClick={() => setActiveSection("analytics")}
        />
        <AdminTab
          active={activeSection === "index"}
          icon={<Database aria-hidden="true" size={16} />}
          label="Document Index"
          onClick={() => setActiveSection("index")}
        />
        <AdminTab
          active={activeSection === "settings"}
          label="Settings"
          onClick={() => setActiveSection("settings")}
        />
      </nav>

      {status ? <div className="notice warning">{status}</div> : null}

      {activeSection === "guardrails" ? (
        <GuardrailsAdmin
          guardrails={guardrails}
          saving={saving}
          onChange={setGuardrails}
          onReset={resetGuardrails}
          onSave={saveGuardrails}
        />
      ) : null}
      {activeSection === "history" ? (
        <QuestionHistory
          questions={filteredQuestions}
          allQuestions={questions}
          cacheFilter={cacheFilter}
          codexFilter={codexFilter}
          confidenceFilter={confidenceFilter}
          fromDate={fromDate}
          search={search}
          sourceFilter={sourceFilter}
          toDate={toDate}
          onClear={clearQuestionHistory}
          onCacheFilterChange={(value) => updateQuestionFilter(() => setCacheFilter(value))}
          onCodexFilterChange={(value) => updateQuestionFilter(() => setCodexFilter(value))}
          onConfidenceFilterChange={(value) => updateQuestionFilter(() => setConfidenceFilter(value))}
          onFromDateChange={(value) => updateQuestionFilter(() => setFromDate(value))}
          onSearchChange={(value) => updateQuestionFilter(() => setSearch(value))}
          onSourceFilterChange={(value) => updateQuestionFilter(() => setSourceFilter(value))}
          onToDateChange={(value) => updateQuestionFilter(() => setToDate(value))}
          page={questionPage}
          selectedQuestion={selectedQuestion}
          sortDirection={questionSortDirection}
          sortKey={questionSortKey}
          onPageChange={setQuestionPage}
          onQuestionSelect={setSelectedQuestion}
          onSort={updateQuestionSort}
        />
      ) : null}
      {activeSection === "analytics" ? <AnalyticsPanel analytics={analytics} /> : null}
      {activeSection === "index" ? <DocumentIndexAdmin documents={documents} /> : null}
      {activeSection === "settings" ? <AdminSettings /> : null}
    </main>
  );
}

function GuardrailsAdmin({
  guardrails,
  saving,
  onChange,
  onReset,
  onSave
}: {
  guardrails: GuardrailsPayload | null;
  saving: boolean;
  onChange: (guardrails: GuardrailsPayload) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  if (!guardrails) {
    return <section className="panel">Loading guardrails...</section>;
  }

  return (
    <section className="panel admin-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Guardrails</h2>
          <p className="panel-subtitle">
            System safety rules are protected. Admin edits are additive or default response preferences.
          </p>
        </div>
      </div>

      <div className="admin-grid two">
        <div>
          <h3>Protected System Guardrails</h3>
          <ul className="plain-list">
            {guardrails.systemGuardrails.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Default Response Preferences</h3>
          {Object.entries(guardrails.checkboxDefaults).map(([key, value]) => (
            <label className="checkbox-row" key={key}>
              <input
                checked={value}
                type="checkbox"
                onChange={(event) =>
                  onChange({
                    ...guardrails,
                    checkboxDefaults: {
                      ...guardrails.checkboxDefaults,
                      [key]: event.target.checked
                    } as GuardrailCheckboxDefaults
                  })
                }
              />
              <span>{formatCheckboxLabel(key)}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="form-field">
        <span>Additional Guardrails</span>
        <textarea
          className="text-area tall"
          value={guardrails.userGuardrails}
          onChange={(event) =>
            onChange({
              ...guardrails,
              userGuardrails: event.target.value
            })
          }
        />
        <span className="field-help">
          These instructions are appended after protected rules and cannot weaken document-only answering.
        </span>
      </label>

      <details className="document-file-list">
        <summary>Prompt Structure Preview</summary>
        <pre className="prompt-preview">{guardrails.promptPreview}</pre>
      </details>

      <div className="settings-actions">
        <button className="button" disabled={saving} type="button" onClick={onSave}>
          <Save aria-hidden="true" size={16} />
          Save Guardrails
        </button>
        <button className="button secondary" disabled={saving} type="button" onClick={onReset}>
          <RotateCcw aria-hidden="true" size={16} />
          Reset to Defaults
        </button>
      </div>
    </section>
  );
}

function QuestionHistory({
  allQuestions,
  questions,
  cacheFilter,
  codexFilter,
  confidenceFilter,
  fromDate,
  search,
  sourceFilter,
  toDate,
  onClear,
  onCacheFilterChange,
  onCodexFilterChange,
  onConfidenceFilterChange,
  onFromDateChange,
  onSearchChange,
  onSourceFilterChange,
  onToDateChange,
  page,
  selectedQuestion,
  sortDirection,
  sortKey,
  onPageChange,
  onQuestionSelect,
  onSort
}: {
  allQuestions: QuestionLog[];
  questions: QuestionLog[];
  cacheFilter: string;
  codexFilter: string;
  confidenceFilter: string;
  fromDate: string;
  search: string;
  sourceFilter: string;
  toDate: string;
  onClear: () => void;
  onCacheFilterChange: (value: string) => void;
  onCodexFilterChange: (value: string) => void;
  onConfidenceFilterChange: (value: string) => void;
  onFromDateChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSourceFilterChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  page: number;
  selectedQuestion: QuestionLog | null;
  sortDirection: SortDirection;
  sortKey: QuestionSortKey;
  onPageChange: (page: number) => void;
  onQuestionSelect: (question: QuestionLog | null) => void;
  onSort: (key: QuestionSortKey) => void;
}) {
  const sourceIds = Array.from(
    new Set(allQuestions.map((question) => question.sourceId).filter(Boolean))
  );
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(questions.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageQuestions = questions.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <section className="panel admin-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Question History</h2>
          <p className="panel-subtitle">Stored locally in SQLite when chat history logging is enabled.</p>
        </div>
      </div>

      <div className="document-exclusion-toolbar">
        <input
          className="text-field"
          placeholder="Search questions or answers"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <select
          className="text-field"
          value={confidenceFilter}
          onChange={(event) => onConfidenceFilterChange(event.target.value)}
        >
          <option value="ALL">All Confidence</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select
          className="text-field"
          value={sourceFilter}
          onChange={(event) => onSourceFilterChange(event.target.value)}
        >
          <option value="ALL">All Sources</option>
          {sourceIds.map((sourceId) => (
            <option key={sourceId} value={sourceId || ""}>
              {sourceId}
            </option>
          ))}
        </select>
        <select
          className="text-field"
          value={cacheFilter}
          onChange={(event) => onCacheFilterChange(event.target.value)}
        >
          <option value="ALL">All Reuse</option>
          <option value="true">Reused</option>
          <option value="false">Fresh</option>
        </select>
        <select
          className="text-field"
          value={codexFilter}
          onChange={(event) => onCodexFilterChange(event.target.value)}
        >
          <option value="ALL">All Engines</option>
          <option value="true">Codex Used</option>
          <option value="false">No Codex</option>
        </select>
        <input
          aria-label="From date"
          className="text-field"
          type="date"
          value={fromDate}
          onChange={(event) => onFromDateChange(event.target.value)}
        />
        <input
          aria-label="To date"
          className="text-field"
          type="date"
          value={toDate}
          onChange={(event) => onToDateChange(event.target.value)}
        />
        <button className="button secondary" type="button" onClick={onClear}>
          Clear History
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Question</th>
              <SortableHeader activeKey={sortKey} direction={sortDirection} label="Created At" sortKey="createdAt" onSort={onSort} />
              <SortableHeader activeKey={sortKey} direction={sortDirection} label="Confidence" sortKey="confidenceScore" onSort={onSort} />
              <SortableHeader activeKey={sortKey} direction={sortDirection} label="Response Time" sortKey="responseTimeMs" onSort={onSort} />
              <SortableHeader activeKey={sortKey} direction={sortDirection} label="Cache Hit" sortKey="cacheHit" onSort={onSort} />
              <SortableHeader activeKey={sortKey} direction={sortDirection} label="Codex Used" sortKey="codexUsed" onSort={onSort} />
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageQuestions.map((question) => (
              <tr key={question.id} onClick={() => onQuestionSelect(question)}>
                <td>{question.question}</td>
                <td>{question.createdAt}</td>
                <td>{question.confidenceLevel || "Unknown"}</td>
                <td>{question.responseTimeMs ? `${question.responseTimeMs} ms` : "n/a"}</td>
                <td>{question.cacheHit ? "Yes" : "No"}</td>
                <td>{question.codexUsed ? "Yes" : "No"}</td>
                <td>{question.sourceId || "None"}</td>
                <td>
                  <button
                    className="inline-action"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onQuestionSelect(question);
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination-row">
        <button
          className="button secondary"
          disabled={safePage <= 1}
          type="button"
          onClick={() => onPageChange(safePage - 1)}
        >
          Previous
        </button>
        <span>
          Page {safePage} of {totalPages} - {questions.length} records
        </span>
        <button
          className="button secondary"
          disabled={safePage >= totalPages}
          type="button"
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </button>
      </div>

      {selectedQuestion ? (
        <QuestionDetailDialog question={selectedQuestion} onClose={() => onQuestionSelect(null)} />
      ) : null}
    </section>
  );
}

function SortableHeader({
  activeKey,
  direction,
  label,
  sortKey,
  onSort
}: {
  activeKey: QuestionSortKey;
  direction: SortDirection;
  label: string;
  sortKey: QuestionSortKey;
  onSort: (key: QuestionSortKey) => void;
}) {
  return (
    <th>
      <button className="table-sort-button" type="button" onClick={() => onSort(sortKey)}>
        {label}
        {activeKey === sortKey ? ` ${direction === "asc" ? "↑" : "↓"}` : ""}
      </button>
    </th>
  );
}

function QuestionDetailDialog({ question, onClose }: { question: QuestionLog; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-modal="true"
        className="modal-panel"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Question Details</h2>
            <p className="panel-subtitle">{question.createdAt}</p>
          </div>
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="question-detail-grid">
          <span>Confidence</span>
          <strong>{question.confidenceLevel || "Unknown"} ({question.confidenceScore ?? "n/a"})</strong>
          <span>Response time</span>
          <strong>{question.responseTimeMs ? `${question.responseTimeMs} ms` : "n/a"}</strong>
          <span>Codex used</span>
          <strong>{question.codexUsed ? "Yes" : "No"}</strong>
          <span>Answer reused</span>
          <strong>{question.cacheHit ? "Yes" : "No"}</strong>
          <span>Answer source</span>
          <strong>{question.answerSource}</strong>
          <span>Source</span>
          <strong>{question.sourceId || "None"}</strong>
        </div>
        <h3>Question</h3>
        <p>{question.question}</p>
        <h3>Answer</h3>
        <p className="detail-answer">{question.answer}</p>
        <h3>Sources</h3>
        {question.sources.length ? (
          <ul className="plain-list compact-list">
            {question.sources.map((source, index) => (
              <li key={`${source.relativePath || source.fileName}-${index}`}>
                <strong>{source.relativePath || source.fileName}</strong>
                {source.snippet ? <p>{source.snippet}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-help">No sources were used.</p>
        )}
        <h3>Retrieved Chunks</h3>
        {question.retrievedChunks.length ? (
          <ul className="plain-list compact-list">
            {question.retrievedChunks.map((chunk, index) => (
              <li key={`${chunk.chunkId || index}`}>{chunk.relativePath || chunk.documentId || chunk.chunkId}</li>
            ))}
          </ul>
        ) : (
          <p className="field-help">No retrieved chunks were stored.</p>
        )}
      </section>
    </div>
  );
}

function AnalyticsPanel({ analytics }: { analytics: Analytics | null }) {
  if (!analytics) {
    return <section className="panel">Loading analytics...</section>;
  }

  return (
    <section className="panel admin-panel">
      <div className="metric-grid">
        <MetricCard label="Total Questions" value={analytics.totalQuestions.toString()} />
        <MetricCard label="Today" value={analytics.questionsToday.toString()} />
        <MetricCard label="This Week" value={analytics.questionsThisWeek.toString()} />
        <MetricCard
          label="Average Response"
          value={analytics.averageResponseTimeMs ? `${analytics.averageResponseTimeMs} ms` : "n/a"}
        />
        <MetricCard label="Cache Hit Rate" value={`${Math.round(analytics.cacheHitRate * 100)}%`} />
      </div>

      <div className="admin-grid two">
        <BarList
          title="Questions Over Time"
          items={analytics.questionsOverTime.map((item) => ({ label: item.date, value: item.count }))}
        />
        <BarList
          title="Confidence Distribution"
          items={Object.entries(analytics.confidenceDistribution).map(([label, value]) => ({
            label,
            value
          }))}
        />
        <BarList title="Top Questions" items={analytics.mostAskedQuestions.map(toBarItem)} />
        <BarList title="Top Source Documents" items={analytics.topReferencedDocuments.map(toSourceBarItem)} />
      </div>

      <details className="document-file-list">
        <summary>Similar Question Clusters ({analytics.similarQuestionClusters.length})</summary>
        <ul>
          {analytics.similarQuestionClusters.map((cluster) => (
            <li key={cluster.label}>
              <strong>{cluster.label}</strong> - {cluster.count} related questions
            </li>
          ))}
        </ul>
      </details>

      <details className="document-file-list">
        <summary>Low Confidence or Unanswered ({analytics.unansweredOrLowConfidence.length})</summary>
        <ul>
          {analytics.unansweredOrLowConfidence.map((item) => (
            <li key={item.id}>
              {item.question} - {item.confidenceScore ?? 0}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function DocumentIndexAdmin({ documents }: { documents: IndexedDocumentFile[] }) {
  return (
    <section className="panel admin-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Document Index</h2>
          <p className="panel-subtitle">Current active source documents available to search.</p>
        </div>
        <Link className="button secondary" href="/settings/documents">
          Document Source Settings
        </Link>
      </div>
      <div className="metric-grid">
        <MetricCard label="Indexed Documents" value={documents.length.toString()} />
        <MetricCard
          label="Chat Excluded"
          value={documents.filter((document) => document.excludedFromChat).length.toString()}
        />
        <MetricCard
          label="Index Excluded"
          value={documents.filter((document) => document.excludedFromIndexing).length.toString()}
        />
      </div>
      <ul className="plain-list compact-list">
        {documents.slice(0, 80).map((document) => (
          <li key={document.id}>
            {document.relativePath} - {document.indexedMode}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdminSettings() {
  return (
    <section className="panel admin-panel">
      <h2 className="panel-title">Settings</h2>
      <p className="panel-subtitle">
        No admin authentication is enabled in this local MVP. Add authentication before using this admin
        area in a shared environment.
      </p>
      <p className="field-help">
        Set LOG_CHAT_HISTORY=false to stop saving future question and answer logs. Existing history can
        be cleared from Question History.
      </p>
    </section>
  );
}

function AdminTab({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`admin-tab ${active ? "active" : ""}`} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BarList({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      {items.length ? (
        items.map((item) => (
          <div className="bar-row" key={item.label}>
            <span>{item.label}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
            </div>
            <strong>{item.value}</strong>
          </div>
        ))
      ) : (
        <p className="field-help">No data yet.</p>
      )}
    </div>
  );
}

function formatCheckboxLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .replace("Is", " is ");
}

function toBarItem(item: { question: string; count: number }) {
  return {
    label: item.question,
    value: item.count
  };
}

function toSourceBarItem(item: { source: string; count: number }) {
  return {
    label: item.source,
    value: item.count
  };
}

function compareQuestions(
  a: QuestionLog,
  b: QuestionLog,
  key: QuestionSortKey,
  direction: SortDirection
): number {
  const multiplier = direction === "asc" ? 1 : -1;
  const left = getSortableQuestionValue(a, key);
  const right = getSortableQuestionValue(b, key);

  if (left < right) {
    return -1 * multiplier;
  }

  if (left > right) {
    return 1 * multiplier;
  }

  return 0;
}

function getSortableQuestionValue(question: QuestionLog, key: QuestionSortKey): number | string {
  if (key === "createdAt") {
    return question.createdAt;
  }

  if (key === "confidenceScore") {
    return question.confidenceScore ?? -1;
  }

  if (key === "responseTimeMs") {
    return question.responseTimeMs ?? -1;
  }

  if (key === "cacheHit") {
    return question.cacheHit ? 1 : 0;
  }

  return question.codexUsed ? 1 : 0;
}
