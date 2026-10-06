import { usesDefaultPins } from "@/server/auth/pins";
import { apiRoute } from "@/server/http/api";

export const GET = apiRoute("public", ({ role }) => ({
  role,
  defaultPins: role === "owner" ? usesDefaultPins() : undefined,
}));
