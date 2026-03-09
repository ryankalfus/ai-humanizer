import { z } from "zod";
import { humanizeEssay } from "@/lib/humanizer";
import type { GradeLevel, Tone } from "@/lib/humanizer/types";

const bodySchema = z.object({
  text: z.string().min(1, "Essay text is required."),
  protectedTerms: z.array(z.string()).default([]),
  tone: z.enum(["casual", "formal", "academic"]),
  gradeLevel: z.enum(["middle_school", "high_school", "college", "graduate"]),
  wordDelta: z.number().int().min(0).max(250),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json()) as {
      text: string;
      protectedTerms: string[];
      tone: Tone;
      gradeLevel: GradeLevel;
      wordDelta: number;
    };
    const result = await humanizeEssay(body);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? "Invalid request."
        : error instanceof Error
          ? error.message
          : "Unexpected error.";

    return Response.json({ error: message }, { status: 400 });
  }
}
