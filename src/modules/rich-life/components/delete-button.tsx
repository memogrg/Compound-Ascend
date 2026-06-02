"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { removeAssetAction, removeLiabilityAction } from "@/modules/rich-life/api/actions";

export function DeleteButton({ id, kind }: { id: string; kind: "asset" | "liability" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const onClick = () =>
    startTransition(async () => {
      const res = kind === "asset" ? await removeAssetAction(id) : await removeLiabilityAction(id);
      if (res.ok) router.refresh();
    });
  return (
    <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Eliminar" onClick={onClick} disabled={pending}>
      <Icon name="x" width={2} />
    </button>
  );
}
