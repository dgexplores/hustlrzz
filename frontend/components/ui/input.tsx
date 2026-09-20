import * as React from "react";
import { cn } from "./button";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, autoComplete = "off", ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      autoComplete={autoComplete}
      className={cn(
        "flex h-11 w-full rounded-xl border border-input bg-background/80 px-3.5 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50",
        className
      )}
      spellCheck={type === "email" || type === "text" ? false : undefined}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[100px] w-full rounded-xl border border-input bg-background/80 px-3.5 py-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, htmlFor, ...props }, ref) => (
    <label ref={ref} className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed", className)} htmlFor={htmlFor} {...props} />
  )
);
Label.displayName = "Label";
