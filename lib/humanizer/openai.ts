import OpenAI from "openai";
import { getHumanizerConfig } from "@/lib/humanizer/config";

let client: OpenAI | null = null;
let cachedApiKey: string | null = null;
let crossClient: OpenAI | null = null;
let cachedCrossApiKey: string | null = null;

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

export function getCrossModelClient(): OpenAI | null {
  const config = getHumanizerConfig();

  if (!config.crossModelKey) {
    return null;
  }

  if (!crossClient || cachedCrossApiKey !== config.crossModelKey) {
    crossClient = new OpenAI({ apiKey: config.crossModelKey });
    cachedCrossApiKey = config.crossModelKey;
  }

  return crossClient;
}

export function getCrossModelName(): string | null {
  return getHumanizerConfig().crossModelName;
}
