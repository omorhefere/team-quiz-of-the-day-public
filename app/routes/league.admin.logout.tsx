import { redirect } from "react-router";
import type { Route } from "./+types/league.admin.logout";
import { clearAdminSession } from "~/lib/admin-session.server";

export async function action({ request, params }: Route.ActionArgs) {
  const code = params.code as string;
  const cookie = await clearAdminSession(request);
  throw redirect(`/league/${code}`, {
    headers: { "Set-Cookie": cookie },
  });
}

export function loader() {
  throw redirect("/");
}
