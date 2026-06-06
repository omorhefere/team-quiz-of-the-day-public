import { useState } from "react";
import { Form } from "react-router";
import { MAX_CUSTOM_QUESTIONS } from "~/lib/quiz";

interface BuilderQuestion {
  q: string;
  choices: string[]; // length 4
  correct_idx: number;
}

export interface QuizBuilderProps {
  /** Form action URL (create or update). */
  action: string;
  /** Pre-fill for editing. */
  initialTitle?: string;
  initialQuestions?: BuilderQuestion[];
  submitLabel: string;
  /** Optional server-side error to show. */
  error?: string | null;
}

function emptyQuestion(): BuilderQuestion {
  return { q: "", choices: ["", "", "", ""], correct_idx: 0 };
}

/**
 * Client-interactive quiz builder. The visible fields are React-controlled; on
 * submit the whole quiz is serialized into a single hidden `payload` field that
 * the route action parses + validates (Zod). Used for both create and edit.
 */
export function QuizBuilder({
  action,
  initialTitle = "",
  initialQuestions,
  submitLabel,
  error,
}: QuizBuilderProps) {
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<BuilderQuestion[]>(
    initialQuestions && initialQuestions.length > 0
      ? initialQuestions
      : [emptyQuestion()],
  );

  function update(i: number, patch: Partial<BuilderQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function setChoice(qi: number, ci: number, value: string) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi
          ? { ...q, choices: q.choices.map((c, j) => (j === ci ? value : c)) }
          : q,
      ),
    );
  }

  return (
    <Form method="post" action={action} className="space-y-6">
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({ title, questions })}
      />

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300">
          {error}
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">
          Quiz title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="e.g. Onboarding: our product"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none focus:border-indigo-500"
        />
      </div>

      {questions.map((question, qi) => (
        <fieldset
          key={qi}
          className="rounded-xl border border-gray-800 bg-gray-900/50 p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <legend className="text-sm text-gray-500">Question {qi + 1}</legend>
            {questions.length > 1 && (
              <button
                type="button"
                onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))}
                className="text-xs text-gray-500 hover:text-red-400"
              >
                Remove
              </button>
            )}
          </div>
          <input
            value={question.q}
            onChange={(e) => update(qi, { q: e.target.value })}
            placeholder="Question text"
            className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 outline-none focus:border-indigo-500"
          />
          <p className="mb-2 text-xs text-gray-500">
            Enter 4 choices and select the correct one.
          </p>
          <div className="space-y-2">
            {question.choices.map((choice, ci) => (
              <label key={ci} className="flex items-center gap-3">
                <input
                  type="radio"
                  name={`correct-${qi}`}
                  checked={question.correct_idx === ci}
                  onChange={() => update(qi, { correct_idx: ci })}
                  className="accent-indigo-500"
                />
                <input
                  value={choice}
                  onChange={(e) => setChoice(qi, ci, e.target.value)}
                  placeholder={`Choice ${ci + 1}`}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        {questions.length < MAX_CUSTOM_QUESTIONS && (
          <button
            type="button"
            onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-900"
          >
            + Add question
          </button>
        )}
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-500"
        >
          {submitLabel}
        </button>
      </div>
    </Form>
  );
}
