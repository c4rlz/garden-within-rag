"use client";

import { useState, type FormEvent } from "react";
import type { Answer } from "@/lib/answer";
import { answerParts, boldParts, MAX_QUESTION_LENGTH } from "@/lib/ask";
import styles from "./page.module.css";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; answer: Answer }
  | { status: "error"; error: string };

const UNREACHABLE = "Couldn't reach the server. Is `npm run dev` still running?";

export function AskBox() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const loading = state.status === "loading";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = (await res.json()) as Answer | { error?: string };
      if (!res.ok || !("answer" in body)) {
        setState({ status: "error", error: ("error" in body && body.error) || UNREACHABLE });
        return;
      }
      setState({ status: "done", answer: body });
    } catch {
      setState({ status: "error", error: UNREACHABLE });
    }
  }

  return (
    <section className={styles.section}>
      <form className={styles.askForm} onSubmit={submit}>
        <h2>
          <label htmlFor="ask-question">Ask your garden</label>
        </h2>
        <textarea
          id="ask-question"
          rows={2}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="What did I say I could let go of last week?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      <div aria-live="polite">
        {loading && <p className={styles.muted}>Answers can take up to a minute.</p>}
        {state.status === "done" && <AnswerView answer={state.answer} />}
      </div>
      {state.status === "error" && (
        <p className={styles.notice} role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}

function AnswerView({ answer }: { answer: Answer }) {
  return (
    <div className={styles.section}>
      {answer.range && (
        <p className={styles.muted}>
          Looking at {answer.range.label}: {answer.range.from} to {answer.range.to} ({answer.entriesConsidered} entries)
        </p>
      )}
      {answer.filter && (
        <p className={styles.muted}>
          {answer.filter} ({answer.entriesConsidered} entries)
        </p>
      )}
      <p className={styles.answer}>
        {answerParts(answer.answer, answer.citations).map((part, i) =>
          "cite" in part ? (
            <a key={i} className={styles.cite} href={part.cite.url} target="_blank" rel="noreferrer">
              [{part.cite.n}]
            </a>
          ) : (
            <span key={i}>
              {boldParts(part.text).map((piece, j) => (piece.bold ? <strong key={j}>{piece.text}</strong> : piece.text))}
            </span>
          ),
        )}
      </p>
      {answer.citations.length > 0 && (
        <div>
          <h3>Sources</h3>
          <ol className={styles.sources}>
            {answer.citations.map((c) => (
              <li key={c.n}>
                <a href={c.url} target="_blank" rel="noreferrer">
                  [{c.n}] {c.label}, {c.date}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
