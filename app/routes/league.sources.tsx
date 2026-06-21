import { data, Form, Link, redirect, useNavigation } from "react-router";
import { LeagueNav } from "~/components/Nav";
import { useState } from "react";
import type { Route } from "./+types/league.sources";
import {
  createSource,
  deleteSource,
  isLeaguePro,
  listSources,
} from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";
import { ingestUrl, ingestPdf, IngestError } from "~/lib/ingest.server";
import { isRealLLMConfigured } from "~/lib/llm/index.server";
import { getFlashError } from "~/lib/session.server";

export function meta() {
  return [{ title: "Sources · Office Trivia League" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const [items, [globalError, cookie]] = await Promise.all([
    listSources(db, league.id),
    getFlashError(request),
  ]);
  return data(
    {
      code: league.code,
      isPro: isLeaguePro(league),
      usingRealAI: isRealLLMConfigured(),
      globalError,
      sources: items.map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        chars: s.chars,
        status: s.status,
        preview: s.preview,
      })),
    },
    { headers: { "Set-Cookie": cookie } },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    const id = form.get("sourceId");
    if (typeof id === "string") await deleteSource(db, league.id, id);
    throw redirect(`/league/${league.code}/sources`);
  }

  if (intent === "add") {
    // Collect all URL fields — form.getAll returns every input named "url".
    const rawUrls = form
      .getAll("url")
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);

    if (rawUrls.length === 0) {
      return { intent: "add" as const, errors: [{ url: "", message: "Enter at least one URL." }], added: 0 };
    }

    // Ingest all URLs concurrently — each fetch is independent.
    const results = await Promise.allSettled(
      rawUrls.map(async (raw) => {
        const { label, text } = await ingestUrl(raw);
        await createSource(db, { leagueId: league.id, kind: "url", label, text });
      }),
    );
    const errors = results
      .map((r, i) =>
        r.status === "rejected"
          ? {
              url: rawUrls[i],
              message:
                r.reason instanceof IngestError
                  ? r.reason.message
                  : "Couldn't ingest this URL.",
            }
          : null,
      )
      .filter((e): e is { url: string; message: string } => e !== null);
    const added = results.filter((r) => r.status === "fulfilled").length;

    if (errors.length === 0) {
      throw redirect(`/league/${league.code}/sources`);
    }
    return { intent: "add" as const, errors, added };
  }

  if (intent === "add-pdf") {
    const files = form.getAll("pdf").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return { intent: "add-pdf" as const, errors: [{ name: "", message: "Select at least one PDF file." }], added: 0 };
    }

    const results = await Promise.allSettled(
      files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const { label, text } = await ingestPdf(buffer, file.name);
        await createSource(db, { leagueId: league.id, kind: "pdf", label, text });
      }),
    );
    const errors = results
      .map((r, i) =>
        r.status === "rejected"
          ? {
              name: files[i].name,
              message:
                r.reason instanceof IngestError
                  ? r.reason.message
                  : "Couldn't parse this PDF.",
            }
          : null,
      )
      .filter((e): e is { name: string; message: string } => e !== null);
    const added = results.filter((r) => r.status === "fulfilled").length;

    if (errors.length === 0) {
      throw redirect(`/league/${league.code}/sources`);
    }
    return { intent: "add-pdf" as const, errors, added };
  }

  return null;
}

export default function Sources({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const adding =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "add";
  const addingPdf =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "add-pdf";

  const [urlFields, setUrlFields] = useState([crypto.randomUUID()]);
  function addField() { setUrlFields((p) => [...p, crypto.randomUUID()]); }
  function removeField(id: string) { setUrlFields((p) => p.length > 1 ? p.filter((f) => f !== id) : p); }

  const urlErrors = actionData?.intent === "add" ? actionData.errors : null;
  const pdfErrors = actionData?.intent === "add-pdf" ? actionData.errors : null;
  const hasSources = loaderData.sources.length > 0;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <LeagueNav code={loaderData.code} isAdmin />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">Sources</h1>
        <p className="mt-1 text-sm text-gray-400">
          Add web pages or PDFs — we extract the text so AI can generate quiz questions from them.
        </p>

        {/* Upload cards — side by side to make the two types distinct */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">

          {/* Web pages */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-200">From a web page</p>
            <Form method="post">
              <input type="hidden" name="intent" value="add" />
              <div className="space-y-2">
                {urlFields.map((id, i) => (
                  <div key={id} className="flex gap-2">
                    <input
                      name="url"
                      type="url"
                      required
                      placeholder={i === 0 ? "https://your-company.com/about" : "https://…"}
                      className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
                    />
                    {urlFields.length > 1 && (
                      <button type="button" onClick={() => removeField(id)}
                        className="rounded-lg border border-gray-700 px-3 text-gray-500 hover:border-red-500/50 hover:text-red-400"
                        aria-label="Remove">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={addField}
                  className="rounded-lg border border-dashed border-gray-700 px-3 py-2 text-xs text-gray-400 hover:border-gray-500">
                  + Add URL
                </button>
                <button disabled={adding}
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                  {adding ? "Adding…" : urlFields.length === 1 ? "Add page" : `Add ${urlFields.length} pages`}
                </button>
              </div>
            </Form>
            {urlErrors && (
              <div className="mt-3 space-y-1.5">
                {(actionData?.added ?? 0) > 0 && (
                  <p className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-300">
                    {actionData!.added} page{actionData!.added !== 1 ? "s" : ""} added.
                  </p>
                )}
                {urlErrors.map((e, i) => (
                  <p key={i} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {"url" in e && e.url ? <span className="font-medium text-red-200">{e.url} — </span> : null}
                    {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* PDF documents */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-200">From a PDF</p>
            <Form method="post" encType="multipart/form-data">
              <input type="hidden" name="intent" value="add-pdf" />
              <label className="block cursor-pointer rounded-lg border border-dashed border-gray-700 px-3 py-6 text-center text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300">
                <input name="pdf" type="file" accept=".pdf,application/pdf" multiple className="sr-only" />
                Click to select PDF files
                <span className="mt-1 block text-xs text-gray-600">max 20 MB each</span>
              </label>
              <button disabled={addingPdf}
                className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                {addingPdf ? "Uploading…" : "Upload PDFs"}
              </button>
            </Form>
            {pdfErrors && (
              <div className="mt-3 space-y-1.5">
                {(actionData?.added ?? 0) > 0 && (
                  <p className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-300">
                    {actionData!.added} PDF{actionData!.added !== 1 ? "s" : ""} added.
                  </p>
                )}
                {pdfErrors.map((e, i) => (
                  <p key={i} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {"name" in e && e.name ? <span className="font-medium text-red-200">{e.name} — </span> : null}
                    {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Source list */}
        <div className="mt-8 space-y-3">
          {!hasSources && (
            <p className="rounded-xl border border-gray-800 px-4 py-8 text-center text-gray-500">
              No sources yet. Add a web page or PDF above.
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
                  <button className="shrink-0 text-xs font-semibold text-gray-500 hover:text-red-400">Delete</button>
                </Form>
              </div>
              {s.preview && (
                <p className="mt-3 line-clamp-3 text-sm text-gray-400">{s.preview}…</p>
              )}
            </div>
          ))}
        </div>

        {/* Next step CTA — shown once there's at least one source */}
        {hasSources && (
          <div className="mt-6 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Ready to generate a quiz?</h2>
              {!loaderData.usingRealAI && (
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                  dev stub
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-400">
              AI drafts questions from your sources. You review and edit before it goes live.
            </p>
            {loaderData.globalError && (
              <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {loaderData.globalError}
              </p>
            )}
            {loaderData.isPro ? (
              <Form method="post" action={`/league/${loaderData.code}/generate`} className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-3">
                  <input name="count" type="number" min={1} max={20} defaultValue={5}
                    className="w-24 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
                    aria-label="Number of questions" />
                  <input name="topic" placeholder="Optional topic focus, e.g. refund policy"
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm" />
                </div>
                <button className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-500">
                  Generate quiz with AI →
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
          </div>
        )}
      </div>
    </main>
  );
}
