"use client";

import { Laptop, Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemePreference } from "@/components/theme/ThemeProvider";

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const active = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2];
  const ActiveIcon = active.icon;

  const cycleTheme = () => {
    const index = OPTIONS.findIndex((option) => option.value === theme);
    setTheme(OPTIONS[(index + 1) % OPTIONS.length].value);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={cycleTheme}
      aria-label={`Theme: ${active.label}. Activate to change theme.`}
      title={`Theme: ${active.label}`}
      className="min-h-[44px] min-w-[44px] px-2 sm:px-3"
    >
      <ActiveIcon className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{active.label}</span>
    </Button>
  );
}
