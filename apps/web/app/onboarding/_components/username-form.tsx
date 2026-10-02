"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "../../../components/ui/button";
import { normalizeUsername, validateUsername } from "../../../lib/client/onboarding";

export interface UsernameFormProps {
  initialValue: string;
  submitLabel: string;
  pending: boolean;
  /** Server side error to show under the field. */
  error: string | null;
  onSubmit: (username: string) => void;
  testIdPrefix: string;
  label?: string;
  hint?: string;
  /** When set, submit is disabled while the input equals this username (normalized). */
  unchangedFrom?: string;
}

export function UsernameForm({
  initialValue,
  submitLabel,
  pending,
  error,
  onSubmit,
  testIdPrefix,
  label = "Sleeper username",
  hint,
  unchangedFrom,
}: UsernameFormProps) {
  const id = useId();
  const [value, setValue] = useState(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);
  const shown = localError ?? error;

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateUsername(value);
    setLocalError(problem);
    if (problem === null) onSubmit(value.trim());
  }

  const unchanged =
    unchangedFrom !== undefined && normalizeUsername(value) === normalizeUsername(unchangedFrom);
  const describedBy = [hint ? `${id}-hint` : null, shown ? `${id}-err` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="-mt-2 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        name="username"
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setLocalError(null);
        }}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        aria-invalid={shown ? true : undefined}
        aria-describedby={describedBy || undefined}
        data-testid={`${testIdPrefix}-username-input`}
        className="min-h-11 w-full rounded-control border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground"
      />
      {shown ? (
        <p
          id={`${id}-err`}
          role="alert"
          className="text-sm text-negative"
          data-testid={`${testIdPrefix}-username-error`}
        >
          {shown}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending || unchanged}
        aria-describedby={unchanged ? `${id}-why` : undefined}
        data-testid={`${testIdPrefix}-username-submit`}
      >
        {pending ? "Working..." : submitLabel}
      </Button>
      {unchanged ? (
        <p id={`${id}-why`} className="-mt-2 text-sm text-muted-foreground">
          Enter a different username to continue.
        </p>
      ) : null}
    </form>
  );
}
