"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  ApiErrorResponse,
  AppStatusResponse,
  GradeLevel,
  HumanizeResponse,
  Tone,
} from "@/lib/humanizer/types";
import { parseProtectedTerms } from "@/lib/humanizer/text";

const gradeOptions: Array<{ value: GradeLevel; label: string }> = [
  { value: "middle_school", label: "Middle school" },
  { value: "high_school", label: "High school" },
  { value: "college", label: "College" },
  { value: "graduate", label: "Graduate" },
];

const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
];

export default function HomePage() {
  const [essay, setEssay] = useState("");
  const [protectedTermsInput, setProtectedTermsInput] = useState("");
  const [tone, setTone] = useState<Tone>("formal");
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>("college");
  const [wordDelta, setWordDelta] = useState(35);
  const [wordDeltaInput, setWordDeltaInput] = useState("35");
  const [humanLikeLevel, setHumanLikeLevel] = useState(70);
  const [result, setResult] = useState<HumanizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AppStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [essayExpanded, setEssayExpanded] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultAlignmentOffset, setResultAlignmentOffset] = useState(0);
  const [resultPanelHeight, setResultPanelHeight] = useState(840);
  const [resultTextareaHeight, setResultTextareaHeight] = useState<number | null>(null);
  const [resultMetricsHeight, setResultMetricsHeight] = useState<number | null>(null);
  const modalResultRef = useRef<HTMLTextAreaElement | null>(null);
  const protectedTermsFieldRef = useRef<HTMLDivElement | null>(null);
  const resultOutputAnchorRef = useRef<HTMLDivElement | null>(null);
  const resultPanelRef = useRef<HTMLElement | null>(null);
  const resultTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const essayTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resultMetricsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const response = await fetch("/api/status");
        const data = (await response.json()) as AppStatusResponse;
        setStatus(data);
      } catch {
        setStatus({
          aiConfigured: false,
          errorCode: "STATUS_UNAVAILABLE",
          setupMessage: "The app could not verify whether the model is configured.",
        });
      }
    }

    void loadStatus();
  }, []);

  useEffect(() => {
    if (resultModalOpen && modalResultRef.current) {
      modalResultRef.current.focus();
      modalResultRef.current.setSelectionRange(0, 0);
    }
  }, [resultModalOpen]);

  useLayoutEffect(() => {
    function syncResultAlignment() {
      if (
        !protectedTermsFieldRef.current ||
        !resultOutputAnchorRef.current ||
        !resultPanelRef.current ||
        !resultTextareaRef.current ||
        !submitButtonRef.current ||
        window.innerWidth <= 980
      ) {
        setResultAlignmentOffset(0);
        setResultPanelHeight(840);
        setResultTextareaHeight(null);
        setResultMetricsHeight(null);
        return;
      }

      const leftTop = protectedTermsFieldRef.current.getBoundingClientRect().top;
      const rightTop = resultOutputAnchorRef.current.getBoundingClientRect().top;
      const nextOffset = Math.round(leftTop - rightTop);
      setResultAlignmentOffset((current) => (current === nextOffset ? current : nextOffset));

      const buttonBottom = submitButtonRef.current.getBoundingClientRect().bottom;
      const textareaTop = resultTextareaRef.current.getBoundingClientRect().top;
      const panelTop = resultPanelRef.current.getBoundingClientRect().top;
      const nextTextareaHeight = Math.max(260, Math.round(buttonBottom - textareaTop));
      const nextPanelHeight = Math.max(840, Math.round(buttonBottom - panelTop + 22));

      if (essayTextareaRef.current && resultMetricsRef.current) {
        const essayBottom = essayTextareaRef.current.getBoundingClientRect().bottom;
        const metricsTop = resultMetricsRef.current.getBoundingClientRect().top;
        const nextMetricsHeight = Math.max(220, Math.round(essayBottom - metricsTop));
        setResultMetricsHeight((current) =>
          current === nextMetricsHeight ? current : nextMetricsHeight,
        );
      }

      setResultTextareaHeight((current) =>
        current === nextTextareaHeight ? current : nextTextareaHeight,
      );
      setResultPanelHeight((current) => (current === nextPanelHeight ? current : nextPanelHeight));
    }

    syncResultAlignment();
    window.addEventListener("resize", syncResultAlignment);

    return () => window.removeEventListener("resize", syncResultAlignment);
  }, [essay, protectedTermsInput, result, error, status, resultAlignmentOffset]);

  function normalizeWordDelta(rawValue: string) {
    if (!rawValue.trim()) {
      return 0;
    }

    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed)) {
      return wordDelta;
    }

    return Math.min(250, Math.max(0, Math.round(parsed)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const normalizedWordDelta = normalizeWordDelta(wordDeltaInput);
    setWordDelta(normalizedWordDelta);
    setWordDeltaInput(String(normalizedWordDelta));

    try {
      const response = await fetch("/api/humanize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: essay,
          protectedTerms: parseProtectedTerms(protectedTermsInput),
          tone,
          gradeLevel,
          wordDelta: normalizedWordDelta,
          humanLikeLevel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const apiError = data as ApiErrorResponse;
        throw new Error(apiError.details ? `${apiError.error} ${apiError.details}` : apiError.error);
      }

      setResult(data as HumanizeResponse);
      setResultModalOpen(false);
      setStatus((current) =>
        current
          ? {
              ...current,
              aiConfigured: true,
            }
          : current,
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unexpected error.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const displayResult = result;
  const desktopResultOffset = Math.max(resultAlignmentOffset, 0);
  const canSubmit = essay.trim().length > 0 && !loading;
  const statValue = (value?: string | number) => (value ?? "--");
  const flagValue = (matched?: boolean, positive = "Matched") =>
    matched === undefined ? "--" : matched ? positive : "Needs review";
  const naturalnessTone = (score?: number) => {
    if (score === undefined) {
      return "";
    }

    if (score <= 30) {
      return "score-red";
    }

    if (score <= 40) {
      return "score-dark-yellow";
    }

    if (score <= 60) {
      return "score-yellow";
    }

    if (score <= 80) {
      return "score-light-green";
    }

    return "score-dark-green";
  };
  const resultMetrics = [
    {
      label: "Original word count",
      value: statValue(displayResult?.originalWordCount),
      tone: "",
    },
    {
      label: "Output word count",
      value: statValue(displayResult?.outputWordCount),
      tone: "",
    },
    {
      label: "Paragraph count",
      value: flagValue(displayResult?.constraintReport.paragraphCountMatched),
      tone: displayResult
        ? displayResult.constraintReport.paragraphCountMatched
          ? "good"
          : "warn"
        : "",
    },
    {
      label: "Citations",
      value: flagValue(displayResult?.constraintReport.citationsPreserved, "Preserved"),
      tone: displayResult
        ? displayResult.constraintReport.citationsPreserved
          ? "good"
          : "warn"
        : "",
    },
    {
      label: "Protected terms",
      value: flagValue(displayResult?.constraintReport.protectedTermsPreserved, "Preserved"),
      tone: displayResult
        ? displayResult.constraintReport.protectedTermsPreserved
          ? "good"
          : "warn"
        : "",
    },
    {
      label: "Word range",
      value: flagValue(displayResult?.constraintReport.wordRangeMatched),
      tone: displayResult
        ? displayResult.constraintReport.wordRangeMatched
          ? "good"
          : "warn"
        : "",
    },
    {
      label: "Reading level",
      value: flagValue(displayResult?.constraintReport.readabilityMatched),
      tone: displayResult
        ? displayResult.constraintReport.readabilityMatched
          ? "good"
          : "warn"
        : "",
    },
    {
      label: "Naturalness score",
      value: displayResult ? `${displayResult.constraintReport.naturalnessScore}/100` : "--",
      tone: displayResult ? naturalnessTone(displayResult.constraintReport.naturalnessScore) : "",
    },
  ];

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Humanize AI Writing</h1>
      </section>

      <div className="layout">
        <form className="panel composer" onSubmit={handleSubmit}>
          <h2>Essay</h2>

          <div className="field grow-field essay-input-field">
            <textarea
              ref={essayTextareaRef}
              id="essay"
              aria-label="Essay"
              className={essayExpanded ? "expandable expanded" : "expandable"}
              value={essay}
              placeholder="Paste your essay here"
              onChange={(event) => setEssay(event.target.value)}
              onFocus={() => setEssayExpanded(true)}
              onBlur={() => setEssayExpanded(false)}
              minLength={1}
            />
          </div>

          <div className="field matched-field" ref={protectedTermsFieldRef}>
            <label htmlFor="protectedTerms">Words or phrases to keep</label>
            <textarea
              id="protectedTerms"
              value={protectedTermsInput}
              placeholder="Use commas or new lines"
              onChange={(event) => setProtectedTermsInput(event.target.value)}
            />
          </div>

          <div className="control-grid">
            <div className="field matched-field">
              <label htmlFor="tone">Tone</label>
              <select
                id="tone"
                value={tone}
                onChange={(event) => setTone(event.target.value as Tone)}
              >
                {toneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field matched-field">
              <label htmlFor="gradeLevel">Writing level</label>
              <select
                id="gradeLevel"
                value={gradeLevel}
                onChange={(event) => setGradeLevel(event.target.value as GradeLevel)}
              >
                {gradeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field matched-field">
              <label htmlFor="wordDelta">Word flexibility</label>
              <input
                id="wordDelta"
                type="number"
                min={0}
                max={250}
                value={wordDeltaInput}
                onChange={(event) => setWordDeltaInput(event.target.value)}
                onBlur={() => {
                  const normalized = normalizeWordDelta(wordDeltaInput);
                  setWordDelta(normalized);
                  setWordDeltaInput(String(normalized));
                }}
              />
            </div>
          </div>

          <div className="field matched-field">
            <label htmlFor="humanLikeLevel">
              Human-like rewrite strength: {humanLikeLevel}
            </label>
            <input
              id="humanLikeLevel"
              className="strength-slider"
              type="range"
              min={0}
              max={100}
              value={humanLikeLevel}
              onChange={(event) => setHumanLikeLevel(Number(event.target.value))}
            />
            <div className="slider-scale" aria-hidden="true">
              <span>0</span>
              <span>100</span>
            </div>
          </div>

          <div className="submit-row">
            <button
              ref={submitButtonRef}
              className={`button${loading ? " is-loading" : ""}`}
              type="submit"
              disabled={!canSubmit}
            >
              {loading ? (
                <span className="button-loading-text">
                  Humanizing
                  <span className="loading-dots" aria-hidden="true">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </span>
              ) : (
                "Humanize essay"
              )}
            </button>
            {loading ? (
              <p className="submit-note">This may take up to 5 minutes</p>
            ) : null}
          </div>
        </form>

        <section
          ref={resultPanelRef}
          className="panel results"
          style={{
            minHeight: `${resultPanelHeight}px`,
            height: `${resultPanelHeight}px`,
          }}
        >
          <h2>Result</h2>

          {status && !status.aiConfigured ? (
            <div className="card empty-state">
              <h3>OpenAI setup needed</h3>
              <p>{status.setupMessage || "OpenAI is not set up yet."}</p>
              <ol className="warning-list">
                <li>Create `.env.local` in this project.</li>
                <li>Add `OPENAI_API_KEY=your_key_here`.</li>
                <li>Optional: add `OPENAI_MODEL=gpt-4.1-mini` or your preferred model.</li>
                <li>Restart `npm run dev`.</li>
              </ol>
            </div>
          ) : null}

          {error ? <div className="card empty-state">{error}</div> : null}

          <>
            <div
              ref={resultMetricsRef}
              className="result-metrics"
              style={
                resultMetricsHeight
                  ? {
                      minHeight: `${resultMetricsHeight}px`,
                      height: `${resultMetricsHeight}px`,
                    }
                  : undefined
              }
            >
              {resultMetrics.map((item) => (
                <div key={item.label} className={`metric-card ${item.tone}`.trim()}>
                  <strong>{item.label}</strong>
                  <span className={item.tone.startsWith("score-") ? item.tone : undefined}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="result-output-anchor" ref={resultOutputAnchorRef}>
              <div
                className="field matched-field result-output-field"
                style={{
                  transform: resultAlignmentOffset
                    ? `translateY(${resultAlignmentOffset}px)`
                    : undefined,
                }}
              >
                <div className="result-header">
                  <h3>Humanized essay</h3>
                  <button
                    className="icon-toggle"
                    type="button"
                    onClick={() => displayResult && setResultModalOpen(true)}
                    aria-label="Open result fullscreen"
                    title="Open result fullscreen"
                    disabled={!displayResult}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M8 3H4a1 1 0 0 0-1 1v4h2V5h3V3Zm13 1a1 1 0 0 0-1-1h-4v2h3v3h2V4ZM5 16H3v4a1 1 0 0 0 1 1h4v-2H5v-3Zm16 0h-2v3h-3v2h4a1 1 0 0 0 1-1v-4Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
                <textarea
                  ref={resultTextareaRef}
                  className="result-text"
                  value={displayResult?.outputText ?? ""}
                  placeholder="Your humanized essay will generate here"
                  style={
                    resultTextareaHeight
                      ? {
                          minHeight: `${resultTextareaHeight}px`,
                          height: `${resultTextareaHeight}px`,
                        }
                      : undefined
                  }
                  readOnly
                />
              </div>
            </div>
          </>
        </section>
      </div>

      {resultModalOpen && result ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Humanized essay fullscreen"
          onClick={() => setResultModalOpen(false)}
        >
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            onKeyDownCapture={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
                event.preventDefault();
                modalResultRef.current?.focus();
                modalResultRef.current?.select();
              }
            }}
          >
            <div className="modal-header">
              <h3>Humanized essay</h3>
              <button
                className="icon-toggle"
                type="button"
                onClick={() => setResultModalOpen(false)}
                aria-label="Close fullscreen result"
                title="Close fullscreen result"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6.7 5.3 5.3 6.7 10.6 12l-5.3 5.3 1.4 1.4 5.3-5.3 5.3 5.3 1.4-1.4-5.3-5.3 5.3-5.3-1.4-1.4-5.3 5.3-5.3-5.3Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <textarea
              ref={modalResultRef}
              className="modal-result-text"
              value={result.outputText}
              readOnly
            />
          </div>
        </div>
      ) : null}

      <footer className="footer-note">
        This tool is intended only for ethical use. It is not intended for academic dishonesty,
        fraud, or other unethical contexts.
      </footer>
    </main>
  );
}
