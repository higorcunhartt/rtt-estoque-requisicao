import { handle } from "@/lib/server/http";
import { createUser, listUsers } from "@/lib/server/users";

export const GET = handle(listUsers);
export const POST = handle(createUser);
