import type { AppStatusResponse } from "@/lib/humanizer/types";
import { HumanizerError } from "@/lib/humanizer/errors";

const DEFAULT_MODEL = "gpt-4.1-mini";
const SETUP_MESSAGE =
  "Create .env.local, add OPENAI_API_KEY=..., optionally add OPENAI_MODEL=..., then restart npm run dev.";

export function getHumanizerConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const modelName = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const crossModelKey = process.env.CROSS_MODEL_API_KEY?.trim();
  const crossModelName = process.env.CROSS_MODEL_NAME?.trim();

  if (!apiKey) {
    throw new HumanizerError("OpenAI is not set up yet.", "MODEL_NOT_CONFIGURED", SETUP_MESSAGE);
  }

  return {
    apiKey,
    modelName,
    crossModelKey: crossModelKey || null,
    crossModelName: crossModelName || null,
  };
}

export function getHumanizerStatus(): AppStatusResponse {
  try {
    const config = getHumanizerConfig();

    return {
      aiConfigured: true,
      modelName: config.modelName,
    };
  } catch (error) {
    if (error instanceof HumanizerError) {
      return {
        aiConfigured: false,
        errorCode: error.code,
        setupMessage: error.details ?? error.message,
      };
    }

    return {
      aiConfigured: false,
      errorCode: "STATUS_CHECK_FAILED",
      setupMessage: "The app could not verify model setup.",
    };
  }
}
