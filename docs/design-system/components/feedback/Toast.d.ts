/**
 * Action-confirmation toast. `Toast` is one row; `ToastStack` is the
 * fixed-position container a screen renders once, feeding it from its own
 * toasts array and dismiss timer (same role as the source's
 * toastSuccess/toastError).
 */
export interface ToastProps {
  tone?: "success" | "progress" | "info" | "pending" | "attention" | "critical" | "neutral";
  icon?: React.ReactNode;
  onDismiss?: () => void;
  children?: React.ReactNode;
}
export function Toast(props: ToastProps): JSX.Element;

export interface ToastStackProps {
  toasts: Array<{ id: string | number; tone?: ToastProps["tone"]; message: React.ReactNode }>;
  onDismiss?: (id: string | number) => void;
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
}
export function ToastStack(props: ToastStackProps): JSX.Element;
