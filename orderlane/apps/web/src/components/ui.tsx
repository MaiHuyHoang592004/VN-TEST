/**
 * The small shared vocabulary every screen uses.
 *
 * One rule, inherited from the design system: status colour comes from
 * `stateTone` and nowhere else. A ternary picking a colour at a call site is
 * how a palette stops meaning anything — two screens disagree about what
 * "packed" looks like and neither is wrong.
 */

export type Tone = "neutral" | "progress" | "positive" | "warning" | "danger";

const TONE_STYLE: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: "color-mix(in oklch, var(--text-muted) 12%, transparent)", fg: "var(--text-muted)" },
  progress: { bg: "color-mix(in oklch, var(--accent) 14%, transparent)", fg: "var(--accent)" },
  positive: { bg: "color-mix(in oklch, var(--positive) 16%, transparent)", fg: "var(--positive)" },
  warning: { bg: "color-mix(in oklch, var(--warning) 18%, transparent)", fg: "var(--warning)" },
  danger: { bg: "color-mix(in oklch, var(--danger) 16%, transparent)", fg: "var(--danger)" },
};

/**
 * Workflow states are per-tenant configuration, so this maps by the STATE KIND
 * the definition declares plus a few well-known keys — never by an exhaustive
 * list of state names, which a merchant can change without telling us.
 */
export function stateTone(stateKey: string, kind?: string): Tone {
  if (kind === "TERMINAL") {
    return /cancel|reject|fail/.test(stateKey) ? "danger" : /return/.test(stateKey) ? "warning" : "positive";
  }
  if (kind === "INITIAL") return "neutral";
  if (/exception|hold|block|await/.test(stateKey)) return "warning";
  return "progress";
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  const style = TONE_STYLE[tone];
  return (
    <span
      style={{
        background: style.bg,
        color: style.fg,
        padding: "0.15rem 0.5rem",
        borderRadius: 999,
        fontSize: "0.78rem",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Minor units in, a string out. Never the other way round. */
export function money(amountMinor: number | bigint, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amountMinor) / 100);
}

export function Card({ children, ...rest }: React.ComponentProps<"section">) {
  return (
    <section
      {...rest}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1.25rem 1.5rem",
        ...rest.style,
      }}
    >
      {children}
    </section>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--text-muted)" }}>{children}</span>;
}
