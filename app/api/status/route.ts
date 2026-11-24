import { readStatus } from "@/lib/store";

export async function GET() {
  const status = await readStatus();
  return Response.json(
    {
      ...status,
      config: {
        sistema: !!process.env.SOURCE_URL,
        protegido: !!process.env.ADMIN_TOKEN,
        agenda: process.env.SCHEDULE_LABEL || "07:00, 12:00 e 17:00 (seg a sáb)",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
