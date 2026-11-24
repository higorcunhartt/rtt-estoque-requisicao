import { handle, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readStatus } from "@/lib/store";

export const GET = handle(async (req: Request) => {
  await requireUser(req);
  const status = await readStatus();
  return json({
    ...status,
    config: {
      sistema: !!process.env.SOURCE_URL,
      agenda: process.env.SCHEDULE_LABEL || "07:00, 12:00 e 17:00 (seg a sáb)",
    },
  });
});
