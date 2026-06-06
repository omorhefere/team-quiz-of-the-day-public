import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { clearTeam } from "~/lib/session.server";

/** Clears the team bond on this device. */
export async function action({ request }: Route.ActionArgs) {
  const cookie = await clearTeam(request);
  throw redirect("/", { headers: { "Set-Cookie": cookie } });
}

export async function loader() {
  throw redirect("/");
}
