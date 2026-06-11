"use client";

/**
 * Abre un modal una sola vez cuando la URL trae `?new=<key>` (deep-link desde
 * los frascos vinculados de Gastos). Tras abrir, limpia el query param para
 * que recargar/volver no lo reabra. `key` undefined desactiva el hook (así una
 * sola instancia del botón por página reacciona, aunque haya varias montadas).
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useDeepLinkModal(key: string | undefined, onMatch: () => void): void {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !key) return;
    if (params?.get("new") === key) {
      fired.current = true;
      onMatch();
      router.replace(pathname, { scroll: false });
    }
  }, [key, params, pathname, router, onMatch]);
}
