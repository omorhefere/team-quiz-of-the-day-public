/**
 * A submit button that shows its own pending state.
 *
 * Every mutation in this app is a full form POST, and the app runs on a Fly
 * machine that can cold-start — so the gap between click and response is often
 * long enough that a button with no feedback reads as broken. Callers pass
 * `pending` (usually derived from `useNavigation`) and the button disables
 * itself, swaps in `pendingLabel` when one is given, and renders a spinner.
 *
 * `className` replaces the default styling rather than merging with it, so
 * callers keep full control of size and colour.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

const DEFAULT_CLASS =
  "rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** True while this button's submission is in flight. */
  pending: boolean;
  /** Label shown while pending. Falls back to `children`. */
  pendingLabel?: ReactNode;
  /** Size of the spinner glyph — shrink it on small//text-xs buttons. */
  spinnerClassName?: string;
};

export function SubmitButton({
  pending,
  pendingLabel,
  spinnerClassName,
  children,
  className,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 ${className ?? DEFAULT_CLASS}`}
    >
      {pending && <Spinner className={spinnerClassName} />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
