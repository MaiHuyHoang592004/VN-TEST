import { PRESETS, Workflow, validateDefinition } from "@orderlane/core/workflow";

/**
 * A holding page that is also a smoke test: it renders the shipped workflow
 * presets straight out of @orderlane/core. If the domain package and the app
 * ever stop agreeing, this page stops building.
 */
export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 16px" }}>
      <h1 style={{ letterSpacing: "-0.02em" }}>Orderlane</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "1.05rem" }}>
        A multi-tenant fulfillment workspace. Catalogue, orders, production and shipping, with a
        fulfillment process each merchant configures rather than inherits.
      </p>

      <h2 style={{ marginTop: "3rem", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
        Shipped workflow presets
      </h2>

      {PRESETS.map((preset) => {
        const workflow = new Workflow(preset);
        const issues = validateDefinition(preset);
        const initial = preset.states.find((s) => s.kind === "INITIAL");
        return (
          <section
            key={preset.key}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.25rem 1.5rem",
              marginBottom: "1rem",
            }}
          >
            <h3 style={{ margin: "0 0 0.25rem" }}>{preset.name}</h3>
            <p style={{ margin: 0, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
              {preset.states.length} states · {preset.transitions.length} transitions ·{" "}
              {issues.length === 0 ? "valid" : `${issues.length} issue(s)`}
            </p>
            {initial ? (
              <p style={{ marginBottom: 0, fontSize: "0.9rem" }}>
                From <strong>{initial.label}</strong>:{" "}
                {workflow.outgoing(initial.key).map((t) => t.label).join(", ")}
              </p>
            ) : null}
          </section>
        );
      })}
    </main>
  );
}
