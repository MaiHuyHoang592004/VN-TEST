/**
 * The ported GoodWoodPrint design-system layer.
 *
 * Everything here is a PORT of a component in docs/design-system/components —
 * same prop contract, rewritten in this app's stack (React 19 + Tailwind v4 +
 * the token layer in src/app/gwp.theme.css). The DS's own .jsx files run only
 * in its sandbox and are never imported.
 *
 * Pages import from "@/components/ds", never from a file inside it.
 */
export { KeyValueRow, type KeyValueRowProps } from "./key-value-row";
export { MetricCard, type MetricCardProps } from "./metric-card";
export { SectionHeading, type SectionHeadingProps } from "./section-heading";
export { StatusBadge, type StatusBadgeProps } from "./status-badge";
export { STATUS_TONES, toneFor, type StatusTone } from "./status-tones";
export { Surface, type SurfaceProps } from "./surface";
