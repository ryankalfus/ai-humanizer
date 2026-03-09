"use client";

import { useEffect, useState } from "react";
import type {
  ApiErrorResponse,
  AppStatusResponse,
  GradeLevel,
  HumanizeResponse,
  Tone,
} from "@/lib/humanizer/types";
import { parseProtectedTerms } from "@/lib/humanizer/text";

const defaultEssay = `Artificial intelligence tools have changed how students write, but they have also created new questions about voice and originality. Many essays now sound polished yet repetitive, with smooth transitions and predictable wording. That consistency can make the writing feel less personal, even when the ideas are strong.

Students still need help revising their work in a way that sounds natural and keeps their original points clear. A strong humanizer should not simply swap in random synonyms. Instead, it should keep the same core meaning, preserve citations like (Smith, 2023), and make the writing sound more like a real person with a distinct style.`;

const gradeOptions: Array<{ value: GradeLevel; label: string }> = [
  { value: "middle_school", label: "Middle school" },
  { value: "high_school", label: "High school" },
  { value: "college", label: "College" },
  { value: "graduate", label: "Graduate" },
];

const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "academic", label: "Academic" },
];

export default function HomePage() {
  const [essay, setEssay] = useState(defaultEssay);
  const [protectedTermsInput, setProtectedTermsInput] = useState("originality\nthree prongs");
  const [tone, setTone] = useState<Tone>("formal");
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>("college");
  const [wordDelta, setWordDelta] = useState(35);
  const [result, setResult] = useState<HumanizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AppStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [essayExpanded, setEssayExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

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
          wordDelta,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const apiError = data as ApiErrorResponse;
        throw new Error(apiError.details ? `${apiError.error} ${apiError.details}` : apiError.error);
      }

      setResult(data as HumanizeResponse);
      setResultExpanded(false);
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

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="eyebrow">AI-guided rewrite • Guardrail-first</div>
        <h1>Humanize AI Writing</h1>
      </section>

      <div className="layout">
        <form className="panel composer" onSubmit={handleSubmit}>
          <div className="field grow-field">
            <label htmlFor="essay">Essay</label>
            <textarea
              id="essay"
              className={essayExpanded ? "expandable expanded" : "expandable"}
              value={essay}
              onChange={(event) => setEssay(event.target.value)}
              onFocus={() => setEssayExpanded(true)}
              onBlur={() => setEssayExpanded(false)}
              minLength={1}
            />
          </div>

          <div className="field">
            <label htmlFor="protectedTerms">Words or phrases to keep exactly</label>
            <small>Use commas or new lines. Example: thesis statement, three prongs, originality.</small>
            <textarea
              id="protectedTerms"
              value={protectedTermsInput}
              onChange={(event) => setProtectedTermsInput(event.target.value)}
            />
          </div>

          <div className="control-grid">
            <div className="field">
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

            <div className="field">
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

            <div className="field">
              <label htmlFor="wordDelta">Word flexibility (± words)</label>
              <input
                id="wordDelta"
                type="number"
                min={0}
                max={250}
                value={wordDelta}
                onChange={(event) => setWordDelta(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="submit-row">
            <button className="button" type="submit" disabled={loading}>
              {loading ? "Humanizing..." : "Humanize essay"}
            </button>
          </div>
        </form>

        <section className="panel results">
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

          {result ? (
            <>
              <div className="stats">
                <div className="stat">
                  <strong>Original word count</strong>
                  <span>{result.originalWordCount}</span>
                </div>
                <div className="stat">
                  <strong>Output word count</strong>
                  <span>{result.outputWordCount}</span>
                </div>
                <div className="stat">
                  <strong>Estimated reading band</strong>
                  <span>{result.readabilityBand}</span>
                </div>
              </div>

              <div className="flags">
                <div className={`flag ${result.constraintReport.paragraphCountMatched ? "good" : "warn"}`}>
                  <strong>Paragraph count</strong>
                  <span>{result.constraintReport.paragraphCountMatched ? "Matched" : "Needs review"}</span>
                </div>
                <div className={`flag ${result.constraintReport.citationsPreserved ? "good" : "warn"}`}>
                  <strong>Citations</strong>
                  <span>{result.constraintReport.citationsPreserved ? "Preserved" : "Needs review"}</span>
                </div>
                <div className={`flag ${result.constraintReport.protectedTermsPreserved ? "good" : "warn"}`}>
                  <strong>Protected terms</strong>
                  <span>{result.constraintReport.protectedTermsPreserved ? "Preserved" : "Needs review"}</span>
                </div>
                <div className={`flag ${result.constraintReport.wordRangeMatched ? "good" : "warn"}`}>
                  <strong>Word range</strong>
                  <span>{result.constraintReport.wordRangeMatched ? "Matched" : "Needs review"}</span>
                </div>
                <div className={`flag ${result.constraintReport.readabilityMatched ? "good" : "warn"}`}>
                  <strong>Reading level</strong>
                  <span>{result.constraintReport.readabilityMatched ? "Matched" : "Needs review"}</span>
                </div>
                <div className="flag good">
                  <strong>Naturalness score</strong>
                  <span>{result.constraintReport.naturalnessScore}/100</span>
                </div>
              </div>

              <div className="card">
                <div className="result-header">
                  <h3>Humanized essay</h3>
                  <button
                    className="text-toggle"
                    type="button"
                    onClick={() => setResultExpanded((current) => !current)}
                  >
                    {resultExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>
                <textarea
                  className={resultExpanded ? "result-text expanded" : "result-text"}
                  value={result.outputText}
                  readOnly
                  onFocus={() => setResultExpanded(true)}
                />
              </div>
            </>
          ) : null}
        </section>
      </div>

      <footer className="footer-note">
        This tool is intended only for ethical use. It is not intended for academic dishonesty,
        fraud, or other unethical contexts.
      </footer>
    </main>
  );
}
