"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  requestCodeAction,
  signInAction,
  signInWithCodeAction,
  signUpAction,
  type AuthFormState,
} from "./actions";

const field: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.65rem",
  borderRadius: "calc(var(--radius) - 3px)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  font: "inherit",
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{ width: "100%", marginTop: "0.25rem" }}>
      {pending ? "…" : label}
    </button>
  );
}

function Feedback({ state }: { state: AuthFormState }) {
  if (state.error) {
    return (
      <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: 0 }}>
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p role="status" style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 0 }}>
        {state.notice}
      </p>
    );
  }
  return null;
}

type Mode = "password" | "code" | "register";

export function SignInForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("password");

  const [passwordState, submitPassword] = useActionState<AuthFormState, FormData>(signInAction, {});
  const [registerState, submitRegister] = useActionState<AuthFormState, FormData>(signUpAction, {});
  const [requestState, submitRequest] = useActionState<AuthFormState, FormData>(requestCodeAction, {});
  const [codeState, submitCode] = useActionState<AuthFormState, FormData>(signInWithCodeAction, {});

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      style={{
        border: "none",
        background: "none",
        padding: "0.25rem 0",
        marginRight: "1.25rem",
        color: mode === value ? "var(--text)" : "var(--text-muted)",
        borderBottom: mode === value ? "2px solid var(--accent)" : "2px solid transparent",
        borderRadius: 0,
      }}
    >
      {label}
    </button>
  );

  // The code step remembers its address, so a person is not asked to type it
  // again between "send me a code" and "here is the code".
  const codeEmail = codeState.email ?? requestState.email ?? "";
  const showCodeEntry = requestState.step === "code" || codeState.step === "code";

  return (
    <>
      <nav style={{ marginBottom: "1.25rem", fontSize: "0.95rem" }}>
        {tab("password", "Password")}
        {tab("code", "Email a code")}
        {tab("register", "Create account")}
      </nav>

      {mode === "password" ? (
        <form action={submitPassword} style={{ display: "grid", gap: "0.65rem" }}>
          <input type="hidden" name="next" value={next} />
          <label>
            Email
            <input style={field} type="email" name="email" autoComplete="username" required defaultValue={passwordState.email} />
          </label>
          <label>
            Password
            <input style={field} type="password" name="password" autoComplete="current-password" required />
          </label>
          <Submit label="Sign in" />
          <Feedback state={passwordState} />
        </form>
      ) : null}

      {mode === "code" ? (
        showCodeEntry ? (
          <form action={submitCode} style={{ display: "grid", gap: "0.65rem" }}>
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="email" value={codeEmail} />
            <label>
              Six-digit code sent to {codeEmail}
              <input
                style={{ ...field, letterSpacing: "0.35em", fontFamily: "var(--font-mono)" }}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
            </label>
            <Submit label="Sign in" />
            <Feedback state={codeState.error ? codeState : requestState} />
          </form>
        ) : (
          <form action={submitRequest} style={{ display: "grid", gap: "0.65rem" }}>
            <label>
              Email
              <input style={field} type="email" name="email" autoComplete="username" required />
            </label>
            <Submit label="Send me a code" />
            <Feedback state={requestState} />
          </form>
        )
      ) : null}

      {mode === "register" ? (
        <form action={submitRegister} style={{ display: "grid", gap: "0.65rem" }}>
          <input type="hidden" name="next" value={next} />
          <label>
            Name
            <input style={field} name="name" autoComplete="name" />
          </label>
          <label>
            Email
            <input style={field} type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input style={field} type="password" name="password" autoComplete="new-password" required minLength={10} />
            <small style={{ color: "var(--text-muted)" }}>
              At least 10 characters. A memorable phrase beats a short scramble.
            </small>
          </label>
          <Submit label="Create account" />
          <Feedback state={registerState} />
        </form>
      ) : null}
    </>
  );
}
