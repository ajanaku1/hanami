import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  busy?: boolean;
  tone?: "primary" | "secondary" | "quiet";
};

export function Button({ children, busy = false, tone = "primary", className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      aria-busy={busy}
      data-tone={tone}
      className={`ui-button ui-button--${tone} ${className}`}
    >
      {children}
    </button>
  );
}
