import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Add it to your environment before using the app.");
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}

export function getModelName() {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}
