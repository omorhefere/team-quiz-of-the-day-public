import { data, Form, Link, redirect, useNavigation } from "react-router";
import { SubmitButton } from "~/components/SubmitButton";
import { MAX_CUSTOM_QUESTIONS } from "~/lib/quiz";
import { LeagueNav } from "~/components/Nav";
import { useState } from "react";
import type { Route } from "./+types/league.sources";
import {
  createSource,
  deleteSource,
  listSources,
} from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";
import { ingestUrl, ingestPdf, IngestError } from "~/lib/ingest.server";
import { getLLMService, isRealLLMConfigured } from "~/lib/llm/index.server";
import { getFlashError } from "~/lib/session.server";

export function meta() {
  return [{ title: "Sources · Team Quiz of the Day" }];
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
      usingRealAI: isRealLLMConfigured(),
      globalError,
      sources: items.map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        chars: s.chars,
        status: s.status,
        preview: s.preview,
        summary: s.summary,
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
        let summary: string | undefined;
        try { summary = await getLLMService().summariseSource(text, label); } catch { /* non-fatal */ }
        await createSource(db, { leagueId: league.id, kind: "url", label, text, summary });
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
        let summary: string | undefined;
        try { summary = await getLLMService().summariseSource(text, label); } catch { /* non-fatal */ }
        await createSource(db, { leagueId: league.id, kind: "pdf", label, text, summary });
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
  const generating =
    navigation.state !== "idle" &&
    navigation.location?.pathname?.endsWith("/generate");
  // Which source's button was clicked, so only that one shows a spinner
  // instead of every generate button on the page lighting up at once.
  const generatingSourceId = generating
    ? (navigation.formData?.get("sourceId") ?? null)
    : null;
  const deletingSourceId =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "delete"
      ? navigation.formData?.get("sourceId")
      : null;
  const generatingTopic =
    generating && navigation.formData?.get("mode") === "topic";
  const generatingAllSources =
    generating && !generatingSourceId && !generatingTopic;

  const [urlFields, setUrlFields] = useState([crypto.randomUUID()]);
  function addField() { setUrlFields((p) => [...p, crypto.randomUUID()]); }
  function removeField(id: string) { setUrlFields((p) => p.length > 1 ? p.filter((f) => f !== id) : p); }

  const urlErrors = actionData?.intent === "add" ? actionData.errors : null;
  const pdfErrors = actionData?.intent === "add-pdf" ? actionData.errors : null;
  const hasSources = loaderData.sources.length > 0;
  // Generation only ever uses sources the server considers ready, so the
  // "From your sources" card gates on that rather than on raw count —
  // otherwise a source that failed to process would offer a button that
  // always errors with "add at least one source".
  const hasReadySources = loaderData.sources.some((s) => s.status === "ready");

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
                    <SubmitButton
                      pending={adding}
                      pendingLabel="Adding…"
                      spinnerClassName="h-3.5 w-3.5"
                      // Fixed width: without it the label swap resizes the
                      // button mid-submit and the URL input jumps.
                      className="w-28 shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {i === 0 && urlFields.length === 1 ? "Add page" : `Add`}
                    </SubmitButton>
                    {urlFields.length > 1 && (
                      <button type="button" onClick={() => removeField(id)}
                        className="rounded-lg border border-gray-700 px-3 text-gray-500 hover:border-red-500/50 hover:text-red-400"
                        aria-label="Remove">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addField}
                className="mt-2 text-xs text-gray-500 hover:text-gray-300">
                + Add another URL
              </button>
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
              <label className="block cursor-pointer rounded-lg border border-dashed border-gray-700 px-3 py-2 text-center text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300">
                <input name="pdf" type="file" accept=".pdf,application/pdf" multiple className="sr-only" />
                Select PDF files
              </label>
              <p className="mt-1 text-xs text-gray-600">max 20 MB each</p>
              <SubmitButton
                pending={addingPdf}
                pendingLabel="Uploading…"
                className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                Upload PDFs
              </SubmitButton>
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
                  <SubmitButton
                    pending={deletingSourceId === s.id}
                    pendingLabel="Deleting…"
                    spinnerClassName="h-3 w-3"
                    className="shrink-0 text-xs font-semibold text-gray-500 hover:text-red-400 disabled:opacity-60"
                  >
                    Delete
                  </SubmitButton>
                </Form>
              </div>
              {s.summary ? (
                <p className="mt-3 text-sm text-gray-400">{s.summary}</p>
              ) : s.preview ? (
                <p className="mt-3 line-clamp-3 text-sm text-gray-500">{s.preview}…</p>
              ) : null}
              {s.status === "ready" && (
                <Form
                  method="post"
                  action={`/league/${loaderData.code}/generate`}
                  className="mt-3 flex items-center gap-2"
                >
                  <input type="hidden" name="count" value={MAX_CUSTOM_QUESTIONS} />
                  <input type="hidden" name="sourceId" value={s.id} />
                  <SubmitButton
                    pending={generatingSourceId === s.id}
                    pendingLabel="Generating…"
                    spinnerClassName="h-3 w-3"
                    disabled={generating}
                    className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-60"
                  >
                    Generate quiz from this source →
                  </SubmitButton>
                </Form>
              )}
            </div>
          ))}
        </div>

        {/* Generate quiz — two options side by side */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Generate a quiz</h2>
            {!loaderData.usingRealAI && (
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">dev stub</span>
            )}
          </div>
          {loaderData.globalError && (
            <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {loaderData.globalError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* From topic */}
            <div className="flex flex-col rounded-xl border border-gray-800 bg-gray-900/40 p-5">
              <p className="text-sm font-semibold text-gray-200">From a topic</p>
              <p className="mt-1 text-xs text-gray-500">
                No documents needed — AI uses its own knowledge.
              </p>
              <Form
                method="post"
                action={`/league/${loaderData.code}/generate`}
                className="mt-4 flex flex-1 flex-col gap-3"
              >
                <input type="hidden" name="count" value={MAX_CUSTOM_QUESTIONS} />
                <input type="hidden" name="mode" value="topic" />
                <input
                  name="topic"
                  required
                  maxLength={200}
                  placeholder="e.g. The French Revolution, our Q3 OKRs"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
                />
                <div className="flex gap-3">
                  {(["easy", "medium", "hard"] as const).map((d) => (
                    <label key={d} className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400">
                      <input type="radio" name="difficulty" value={d} defaultChecked={d === "medium"} className="accent-indigo-500" />
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </label>
                  ))}
                </div>
                <SubmitButton
                  pending={generatingTopic}
                  pendingLabel="Generating…"
                  disabled={generating}
                  className="mt-auto w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  Generate from topic →
                </SubmitButton>
              </Form>
            </div>

            {/* From sources */}
            <div className={`flex flex-col rounded-xl border p-5 ${hasReadySources ? "border-gray-800 bg-gray-900/40" : "border-dashed border-gray-800 bg-gray-900/20"}`}>
              <p className={`text-sm font-semibold ${hasReadySources ? "text-gray-200" : "text-gray-500"}`}>From your sources</p>
              <p className="mt-1 text-xs text-gray-500">
                AI drafts questions grounded in the documents above.
              </p>
              {hasReadySources ? (
                <Form method="post" action={`/league/${loaderData.code}/generate`} className="mt-4 flex flex-1 flex-col gap-3">
                  <input type="hidden" name="count" value={MAX_CUSTOM_QUESTIONS} />
                  <input
                    name="topic"
                    placeholder="Optional topic focus, e.g. refund policy"
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-3">
                    {(["easy", "medium", "hard"] as const).map((d) => (
                      <label key={d} className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400">
                        <input type="radio" name="difficulty" value={d} defaultChecked={d === "medium"} className="accent-indigo-500" />
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </label>
                    ))}
                  </div>
                  <SubmitButton
                    pending={generatingAllSources}
                    pendingLabel="Generating…"
                    disabled={generating}
                    className="mt-auto w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                  >
                    Generate from sources →
                  </SubmitButton>
                </Form>
              ) : (
                <p className="mt-auto pt-6 text-center text-xs text-gray-600">
                  Add a source above to unlock this.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
