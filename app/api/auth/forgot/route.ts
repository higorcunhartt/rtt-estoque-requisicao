import { handle } from "@/lib/server/http";
import { forgot } from "@/lib/server/auth-flow";

export const POST = handle(forgot);
