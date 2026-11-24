import { handle } from "@/lib/server/http";
import { me } from "@/lib/server/auth-flow";

export const GET = handle(me);
