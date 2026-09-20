import * as React from "react";
import { cn } from "./button";

type Variant = "default" | "destructive" | "secondary" | "outline";

export const Badge = ({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) => {
  const styles: Record<Variant, string> = {
    default: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    outline: "border text-foreground",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", styles[variant], className)} {...props} />
  );
};

export const Switch = ({
  checked,
  onCheckedChange,
  id,
  className,
  ...aria
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    {...aria}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      checked ? "bg-primary" : "bg-input",
      className
    )}
  >
    <span
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
        checked ? "translate-x-6" : "translate-x-0.5"
      )}
      aria-hidden="true"
    />
  </button>
);