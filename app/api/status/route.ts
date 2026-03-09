import { getHumanizerStatus } from "@/lib/humanizer/config";

export async function GET() {
  return Response.json(getHumanizerStatus());
}
