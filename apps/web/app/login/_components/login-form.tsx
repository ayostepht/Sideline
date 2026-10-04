"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/ui/button";
import { apiJson } from "../../../lib/client/api";
import { validatePassword } from "../../../lib/client/login";

/**
 * T6.1c (HOST-8): the password form for `POST /api/login`. Structurally mirrors
 * `UsernameForm` (same id/error/aria pattern) but owns its own submit and redirect, since
 * there is no parent flow to hand the result to here.
 */
export function LoginForm() {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validatePassword(value);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    const r = await apiJson("/api/login", "LoginResponseSchema", {
      method: "POST",
      body: { password: value },
    });
    if (!r.ok) {
      setPending(false);
      setError(r.message);
      return;
    }
    // Keep the button disabled through the redirect; no need to clear `pending`.
    router.replace("/");
  }

  const describedBy = error ? `${id}-err` : undefined;

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Password
      </label>
      <input
        id={id}
        name="password"
        type="password"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        autoComplete="current-password"
        autoFocus
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-testid="login-password-input"
        className="min-h-11 w-full rounded-control border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground"
      />
      {error ? (
        <p
          id={`${id}-err`}
          role="alert"
          className="text-sm text-negative"
          data-testid="login-error"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-1" data-testid="login-submit">
        {pending ? "Logging in..." : "Log in"}
      </Button>
    </form>
  );
}
