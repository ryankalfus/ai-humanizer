import OpenAI from "openai";
import { getHumanizerConfig } from "@/lib/humanizer/config";

let client: OpenAI | null = null;
let cachedApiKey: string | null = null;

export function getOpenAIClient() {
  const { apiKey } = getHumanizerConfig();

  if (!client || cachedApiKey !== apiKey) {
    client = new OpenAI({ apiKey });
    cachedApiKey = apiKey;
  }

  return client;
}

export function getModelName() {
  return getHumanizerConfig().modelName;
}
