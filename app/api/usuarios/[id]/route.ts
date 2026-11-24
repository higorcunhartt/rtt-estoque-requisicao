import { handle } from "@/lib/server/http";
import { updateUser } from "@/lib/server/users";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((r) => updateUser(r, id))(req);
}
