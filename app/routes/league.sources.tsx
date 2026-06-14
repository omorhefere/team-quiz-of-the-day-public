import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/league.sources";
import { createSource, deleteSource, listSources } from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";
import { ingestUrl, IngestError } from "~/lib/ingest.server";

export function meta() {
  return [{ title: "Sources · Office Trivia League" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const items = await listSources(db, league.id);
  return {
    code: league.code,
    sources: items.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      chars: s.text.length,
      status: s.status,
      preview: s.text.slice(0, 240),
    })),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    const id = form.get("sourceId");
    if (typeof id === "string") await deleteSource(db, id);
    throw redirect(`/league/${league.code}/sources`);
  }

  if (intent === "add") {
    const url = String(form.get("url") ?? "");
    try {
      // Ingest synchronously: fetch + extract, then store the clean text.
      const { label, text } = await ingestUrl(url);
      await createSource(db, { leagueId: league.id, kind: "url", label, text });
    } catch (err) {
      // Surface a friendly reason; don't persist a broken source.
      const message =
        err instanceof IngestError ? err.message : "Couldn't ingest that URL.";
      return { error: message };
    }
    throw redirect(`/league/${league.code}/sources`);
  }

  return null;
}

export default function Sources({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const adding =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "add";

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          to={`/league/${loaderData.code}/manage`}
          className="text-sm text-indigo-400 hover:underline"
        >
          ← Back to quizzes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Sources</h1>
        <p className="mt-1 text-sm text-gray-400">
          Add web pages to generate quizzes from. We extract the readable text and
          store it.
        </p>

        <Form method="post" className="mt-6 flex gap-2">
          <input type="hidden" name="intent" value="add" />
          <input
            name="url"
            type="url"
            required
            placeholder="https://your-company.com/about"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none focus:border-indigo-500"
          />
          <button
            disabled={adding}
            className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </Form>
        {actionData?.error && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {actionData.error}
          </p>
        )}

        <div className="mt-8 space-y-3">
          {loaderData.sources.length === 0 && (
            <p className="rounded-xl border border-gray-800 px-4 py-8 text-center text-gray-500">
              No sources yet. Add a page above.
            </p>
          )}
          {loaderData.sources.map((s) => (
            <div key={s.id} className="rounded-xl border border-gray-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.label}</p>
                  <p className="text-xs text-gray-500">
                    {s.kind} · {s.chars.toLocaleString()} chars · {s.status}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="sourceId" value={s.id} />
                  <button className="shrink-0 text-xs font-semibold text-gray-500 hover:text-red-400">
                    Delete
                  </button>
                </Form>
              </div>
              {s.preview && (
                <p className="mt-3 line-clamp-3 text-sm text-gray-400">
                  {s.preview}…
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
