import { handle } from "@/lib/server/http";
import { logout } from "@/lib/server/auth-flow";

export const POST = handle(logout);
