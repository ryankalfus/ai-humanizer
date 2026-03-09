# AI Essay Humanizer

Private local Next.js web app for rewriting essays with guardrails.

## What it does
- Paste an essay and rewrite it with an AI model
- Keep selected words or phrases exactly unchanged
- Choose `casual`, `formal`, or `academic`
- Choose a writing level from middle school through graduate
- Limit the output to a chosen `± word` range
- Preserve citations and paragraph count as validation rules

## Setup
1. Install packages:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local`.
3. Add your OpenAI API key to `OPENAI_API_KEY`.
4. Start the app:
   ```bash
   npm run dev
   ```

## Notes
- The app is designed for local private use.
- Detector scores are best-effort only. GPTZero, ZeroGPT, and Originality may change over time and are not guaranteed.
- The validation layer checks structure and wording constraints after the model responds.

## Testing
```bash
npm test
```

## Evaluation harness
Use a small sample set of essays and compare:
- paragraph count before vs after
- citation exact matches
- protected term exact matches
- output word count tolerance
- readability band vs chosen target
- naturalness score

Manual detector checks should be done periodically because those services may block automation or change scoring behavior.
