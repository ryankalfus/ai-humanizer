# AI Essay Humanizer

Private local Next.js web app for rewriting essays with hard guardrails and a multi-pass AI rewrite flow.

## What it does
- Paste an essay and rewrite it with an AI model
- Keep selected words or phrases exactly unchanged
- Choose `casual`, `formal`, or `academic`
- Choose a writing level from middle school through graduate
- Limit the output to a chosen `± word` range
- Preserve citations and paragraph count as validation rules
- Run multiple rewrite and repair passes before accepting a result
- Show the exact settings used in the result panel

## Setup
1. Install packages:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local`.
3. Add your OpenAI API key to `OPENAI_API_KEY`.
4. Optional: set `OPENAI_MODEL` in `.env.local`.
5. Restart the dev server after env changes.
6. Start the app:
   ```bash
   npm run dev
   ```

## Notes
- The app is designed for local private use.
- The rewrite pipeline uses one rewrite pass plus up to two repair passes.
- The app only returns a result when every required guardrail passes.
- The result view echoes the applied settings so you can confirm the request was followed.
- This tool is intended only for ethical use. It is not intended for academic dishonesty, fraud, or other unethical contexts.

## Testing
```bash
npm test
```

## Validation checks
The app validates:
- paragraph count before vs after
- citation exact matches
- protected term exact matches
- output word count tolerance
- readability band vs chosen target
- naturalness heuristics such as repeated sentence openers and sentence-length uniformity
