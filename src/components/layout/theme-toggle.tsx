"use client";

import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/components/layout/theme-provider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <div
      className="theme-toggle"
      role="switch"
      aria-label="Cambiar tema"
      aria-checked={theme === "dark"}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <span className="sun">
        <Icon name="sun" width={2} />
      </span>
      <span className="moon">
        <Icon name="moon" width={2} />
      </span>
    </div>
  );
}
