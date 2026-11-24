import { handle } from "@/lib/server/http";
import { login } from "@/lib/server/auth-flow";

export const POST = handle(login);
