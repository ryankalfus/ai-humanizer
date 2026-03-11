import { z } from "zod";
import { humanizeEssay } from "@/lib/humanizer";
import { HumanizerError } from "@/lib/humanizer/errors";
import type { ApiErrorResponse, GradeLevel, Tone } from "@/lib/humanizer/types";

export const maxDuration = 300;

const bodySchema = z.object({
  text: z.string().trim().min(1, "Essay text is required."),
  protectedTerms: z.array(z.string().trim()).default([]),
  tone: z.enum(["casual", "formal"]),
  gradeLevel: z.enum(["middle_school", "high_school", "college", "graduate"]),
  wordDelta: z.number().int().min(0).max(250),
  humanLikeLevel: z.number().int().min(0).max(100),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json()) as {
      text: string;
      protectedTerms: string[];
      tone: Tone;
      gradeLevel: GradeLevel;
      wordDelta: number;
      humanLikeLevel: number;
    };

    return Response.json(
      await humanizeEssay({
        ...body,
        protectedTerms: body.protectedTerms.filter(Boolean),
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      const response: ApiErrorResponse = {
        error: error.issues[0]?.message ?? "Invalid request.",
        code: "INVALID_REQUEST",
      };

      return Response.json(response, { status: 400 });
    }

    if (error instanceof HumanizerError) {
      const response: ApiErrorResponse = {
        error: error.message,
        code: error.code,
        details: error.details,
      };

      const status =
        error.code === "MODEL_NOT_CONFIGURED" || error.code === "INVALID_REQUEST" ? 400 : 422;

      return Response.json(response, { status });
    }

    const response: ApiErrorResponse = {
      error: error instanceof Error ? error.message : "Unexpected error.",
      code: "HUMANIZER_ERROR",
    };

    return Response.json(response, { status: 500 });
  }
}
