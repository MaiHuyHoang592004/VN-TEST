/**
 * Labelled text field. Use `mono` for anything machine-owned — Order IDs,
 * SKUs, tracking numbers, barcodes.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Helper text under the field. */
  hint?: string;
  /** Error text — replaces `hint` and turns the field red. */
  error?: string;
  size?: "sm" | "md" | "lg";
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** Set the value in IBM Plex Mono — for IDs, SKUs and tracking numbers. */
  mono?: boolean;
  /** `inset` uses the pale sky well; use it when the field sits on white. */
  surface?: "white" | "inset";
  containerStyle?: React.CSSProperties;
}
export function Input(props: InputProps): JSX.Element;
