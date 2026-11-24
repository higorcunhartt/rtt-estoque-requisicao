import { handle } from "@/lib/server/http";
import { changePassword } from "@/lib/server/auth-flow";

export const POST = handle(changePassword);
