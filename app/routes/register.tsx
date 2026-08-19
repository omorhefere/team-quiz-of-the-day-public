import { useState } from "react";
import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/register";
import { SubmitButton } from "~/components/SubmitButton";
import { getDb } from "~/db/client";
import { createLeague, createTeam } from "~/db/repository";
import { commitTeamId } from "~/lib/session.server";
import {
  DISPLAY_NAME_ERROR_MESSAGES,
  validateDisplayName,
} from "~/lib/profanity";

// No loader redirect: the loader re-runs during the post-action render, so
// redirecting here would discard the action result. Direct GETs fall through to
// the form rendered by the component.
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league")?.trim().slice(0, 30) || null;
  return { league };
}

export async function action({ request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const pendingLeague = url.searchParams.get("league")?.trim().slice(0, 30) || null;

  const form = await request.formData();
  const displayName = String(form.get("displayName") ?? "");

  const error = validateDisplayName(displayName);
  if (error) {
    return data({ error: DISPLAY_NAME_ERROR_MESSAGES[error] }, { status: 400 });
  }

  const db = await getDb();
  const team = await createTeam(db, displayName);
  const cookie = await commitTeamId(request, team.id);

  // If a league name was passed in the URL, create it now and go straight to setup.
  if (pendingLeague) {
    const league = await createLeague(db, { name: pendingLeague, createdByTeamId: team.id });
    throw redirect(`/league/${league.code}/admin/setup`, {
      headers: { "Set-Cookie": cookie },
    });
  }

  return data(
    { code: team.code, displayName: team.displayName },
    { headers: { "Set-Cookie": cookie } },
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* clipboard unavailable — button stays in default state */});
  }
  return (
    <button
      onClick={copy}
      className="mt-3 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-indigo-500/50 hover:text-indigo-300"
    >
      {copied ? "Copied!" : "Copy code"}
    </button>
  );
}

export default function Register() {
  const result = useActionData<typeof action>();

  if (result && "error" in result) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold text-red-400">Couldn&rsquo;t create team</h1>
        <p className="mt-3 text-gray-400">{result.error}</p>
        <Link to="/" className="mt-8 inline-block text-indigo-400 hover:underline">
          ← Try again
        </Link>
      </Centered>
    );
  }

  if (result && "code" in result) {
    return (
      <Centered>
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
          {result.displayName}
        </p>
        <h1 className="mt-3 text-2xl font-bold">Your team code</h1>
        <p className="mt-6 select-all rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-6 py-4 text-3xl font-bold tracking-widest text-indigo-300">
          {result.code}
        </p>
        <CopyButton text={result.code} />
        <p className="mt-4 max-w-sm text-sm text-gray-500">
          📌 Save this code — anyone on your team enters it to play together.
        </p>

        {/* League join prompt */}
        <div className="mt-8 w-full max-w-sm rounded-xl border border-gray-800 p-5 text-left">
          <p className="text-sm font-semibold text-gray-200">Joining a league?</p>
          <p className="mt-1 text-xs text-gray-500">
            If someone gave you a league code, enter it here.
          </p>
          <Form method="post" action="/leagues/join" className="mt-3 flex gap-2">
            <input
              name="code"
              required
              placeholder="e.g. JADE-LYNX-08"
              autoCapitalize="characters"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm uppercase tracking-wider text-gray-100 outline-none focus:border-indigo-500"
            />
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Join
            </button>
          </Form>
        </div>

        <Link
          to="/play"
          className="mt-4 text-sm text-gray-500 hover:text-gray-300 hover:underline"
        >
          Skip — play today&rsquo;s global quiz →
        </Link>
      </Centered>
    );
  }

  const { league } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <Centered>
      {league ? (
        <>
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
            Creating league: {league}
          </p>
          <h1 className="mt-3 text-2xl font-bold">First, set up your team</h1>
          <p className="mt-2 max-w-sm text-sm text-gray-400">
            Give your team a name — your team code lets everyone play together.
          </p>
        </>
      ) : (
        <h1 className="text-2xl font-bold">Create your team</h1>
      )}
      <Form method="post" className="mt-6 w-full max-w-sm space-y-3">
        <input
          name="displayName"
          required
          maxLength={30}
          placeholder="e.g. Platform Engineering"
          disabled={submitting}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 disabled:opacity-50"
        />
        <SubmitButton
          pending={submitting}
          pendingLabel={league ? "Setting up…" : "Creating your team…"}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold disabled:opacity-60"
        >
          {league ? "Create team & set up league →" : "Get our team code"}
        </SubmitButton>
      </Form>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-center text-gray-100">
      {children}
    </main>
  );
}
