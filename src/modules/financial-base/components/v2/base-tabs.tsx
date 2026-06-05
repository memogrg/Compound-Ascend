"use client";

/** Tabs reales con deep-link por hash (#ingresos, #gastos, #transacciones). */
import { useEffect, useState } from "react";

export type TabDef = { id: string; label: string; node: React.ReactNode };

export function BaseTabs({ tabs }: { tabs: TabDef[] }) {
  const first = tabs[0]?.id ?? "base";
  const [active, setActive] = useState(first);

  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "");
      setActive(tabs.some((t) => t.id === h) ? h : first);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [tabs, first]);

  return (
    <>
      <div className="base-tabs" role="tablist" aria-label="Secciones de Base Financiera">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className={active === t.id ? "base-tab active" : "base-tab"}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </a>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id} style={{ marginTop: 16 }}>
          {active === t.id ? t.node : null}
        </div>
      ))}
    </>
  );
}
