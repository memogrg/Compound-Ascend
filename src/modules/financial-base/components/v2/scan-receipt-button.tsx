"use client";

/**
 * Escaneo de recibo (camino B): foto → extracción IA → REVISIÓN obligatoria →
 * guardar. Sube la imagen a Storage (best-effort) y prellena el QuickAddModal
 * con origin='scanned'. Nada se guarda sin confirmación.
 */
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { scanReceiptAction } from "@/modules/financial-base/api/v2-actions";
import {
  QuickAddModal,
  type ScanPrefill,
} from "@/modules/financial-base/components/v2/quick-add-modal";
import type { Account } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1)); // quita "data:...;base64,"
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadReceipt(file: File): Promise<string | undefined> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return undefined;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("receipts").upload(path, file, { upsert: false });
    return error ? undefined : path;
  } catch {
    return undefined;
  }
}

export function ScanReceiptButton({
  categories,
  accounts,
  currency,
}: {
  categories: Category[];
  accounts: Account[];
  currency: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [prefill, setPrefill] = useState<ScanPrefill | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 6_000_000) {
      toast("La imagen es muy grande (máx 6 MB).", "error");
      return;
    }
    startTransition(async () => {
      const base64 = await fileToBase64(file);
      const res = await scanReceiptAction(base64, file.type);
      if (!res.ok) {
        toast(res.message, "error");
        return;
      }
      const receiptUrl = await uploadReceipt(file);
      setPrefill({
        amount: res.data.amount,
        merchant: res.data.merchant,
        date: res.data.date,
        currency: res.data.currency,
        confidence: res.data.confidence,
        receiptUrl,
      });
      if (res.data.amount == null) {
        toast("No detecté el monto; complétalo y guarda.", "info");
      }
    });
  };

  return (
    <>
      <input
        aria-label="Subir imagen del recibo"
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFile}
      />
      <button
        type="button"
        className="btn btn-ghost"
        style={{ border: "1px solid var(--line)" }}
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        <Icon name="scan" width={2} /> {busy ? "Leyendo recibo…" : "Escanear recibo"}
      </button>
      {prefill ? (
        <QuickAddModal
          kind="gasto"
          categories={categories}
          accounts={accounts}
          currency={currency}
          prefill={prefill}
          onClose={() => setPrefill(null)}
        />
      ) : null}
    </>
  );
}
