import { apiRoute } from "@/server/http/api";
import { hasOwner } from "@/server/services/users";

export const GET = apiRoute("public", ({ user, ctx }) => ({
  needsSetup: !hasOwner(ctx),
  user: user ? { id: user.id, name: user.name, role: user.role, username: user.username } : null,
}));
