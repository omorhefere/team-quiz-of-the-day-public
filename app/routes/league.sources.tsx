import { Form, Link, redirect, useNavigation } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/league.sources";
import {
  createSource,
  deleteSource,
  isLeaguePro,
  listSources,
} from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";
import { ingestUrl, IngestError } from "~/lib/ingest.server";
import { isRealLLMConfigured } from "~/lib/llm/index.server";

export function meta() {
  return [{ title: "Sources · Office Trivia League" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const items = await listSources(db, league.id);
  const url = new URL(request.url);
  return {
    code: league.code,
    isPro: isLeaguePro(league),
    usingRealAI: isRealLLMConfigured(),
    globalError: url.searchParams.get("error"),
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
    // Collect all URL fields — form.getAll returns every input named "url".
    const rawUrls = form
      .getAll("url")
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);

    if (rawUrls.length === 0) {
      return { errors: [{ url: "", message: "Enter at least one URL." }] };
    }

    // Ingest each URL independently — successes are saved, failures are
    // collected so the admin sees exactly which ones had problems.
    const errors: { url: string; message: string }[] = [];
    let added = 0;

    for (const raw of rawUrls) {
      try {
        const { label, text } = await ingestUrl(raw);
        await createSource(db, { leagueId: league.id, kind: "url", label, text });
        added++;
      } catch (err) {
        const message =
          err instanceof IngestError ? err.message : "Couldn't ingest this URL.";
        errors.push({ url: raw, message });
      }
    }

    // If everything succeeded, redirect so the page refreshes with the new
    // sources. If some failed, stay on the page and show what went wrong
    // (the successes are already saved).
    if (errors.length === 0) {
      throw redirect(`/league/${league.code}/sources`);
    }
    return { errors, added };
  }

  return null;
}

export default function Sources({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const adding =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "add";

  // Dynamic URL input list — starts with one field.
  const [urlFields, setUrlFields] = useState([crypto.randomUUID()]);

  function addField() {
    setUrlFields((prev) => [...prev, crypto.randomUUID()]);
  }

  function removeField(id: string) {
    setUrlFields((prev) => (prev.length > 1 ? prev.filter((f) => f !== id) : prev));
  }

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

        <Form method="post" className="mt-6">
          <input type="hidden" name="intent" value="add" />
          <div className="space-y-2">
            {urlFields.map((id, i) => (
              <div key={id} className="flex gap-2">
                <input
                  name="url"
                  type="url"
                  required
                  placeholder={
                    i === 0
                      ? "https://your-company.com/about"
                      : "https://..."
                  }
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none focus:border-indigo-500"
                />
                {urlFields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeField(id)}
                    className="rounded-lg border border-gray-700 px-3 py-3 text-gray-500 hover:border-red-500/50 hover:text-red-400"
                    aria-label="Remove this URL"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={addField}
              className="rounded-lg border border-dashed border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300"
            >
              + Add another URL
            </button>
            <button
              disabled={adding}
              className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {adding
                ? "Adding…"
                : urlFields.length === 1
                  ? "Add source"
                  : `Add ${urlFields.length} sources`}
            </button>
          </div>
        </Form>

        {/* Per-URL error feedback */}
        {actionData?.errors && (
          <div className="mt-3 space-y-2">
            {(actionData.added ?? 0) > 0 && (
              <p className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm text-green-300">
                {actionData.added} source{actionData.added !== 1 ? "s" : ""} added
                successfully.
              </p>
            )}
            {actionData.errors.map(
              (e: { url: string; message: string }, i: number) => (
                <p
                  key={i}
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300"
                >
                  {e.url ? (
                    <>
                      <span className="font-medium text-red-200">{e.url}</span>
                      {" — "}
                    </>
                  ) : null}
                  {e.message}
                </p>
              ),
            )}
          </div>
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

        {/* AI generation (Pro feature). Produces a draft quiz from the sources,
            then opens it in the builder for review. */}
        <section className="mt-10 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Generate a quiz with AI</h2>
            {!loaderData.usingRealAI && (
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                dev stub (no API key)
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Drafts questions grounded in your sources. You review and edit before
            it goes live.
          </p>
          {loaderData.globalError && (
            <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {loaderData.globalError}
            </p>
          )}
          {loaderData.isPro ? (
            <Form method="post" action={`/league/${loaderData.code}/generate`} className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-3">
                <input
                  name="count"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={5}
                  className="w-24 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
                  aria-label="Number of questions"
                />
                <input
                  name="topic"
                  placeholder="Optional focus, e.g. refund policy"
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
                />
              </div>
              <button className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-500">
                Generate draft →
              </button>
            </Form>
          ) : (
            <p className="mt-4 rounded-lg border border-gray-700 px-4 py-3 text-sm text-gray-400">
              AI generation is a Pro feature.{" "}
              <Link to={`/league/${loaderData.code}/manage`} className="text-indigo-400 hover:underline">
                Manage plan →
              </Link>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
