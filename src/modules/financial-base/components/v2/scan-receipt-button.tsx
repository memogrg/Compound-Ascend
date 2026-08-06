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
import { prepararImagenRecibo } from "@/lib/image/prepare-image";
import { mensajeFalloEscaneo, extraccionVacia } from "@/lib/ai/scan-errors";

/** Mismo tope que la ruta de escaneo; se mide sobre el base64 YA comprimido. */
const MAX_B64_CLIENTE = 7_000_000;

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
    // Allowlist de tipos (defensa en cliente; el server y el bucket revalidan).
    // heif además de heic: el iPhone produce los dos y antes el .heif se rechazaba acá mismo.
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast("Formato no admitido. Usa JPG, PNG, WEBP o HEIC.", "error");
      return;
    }
    // El tope se comprueba DESPUÉS de comprimir: rechazar por el peso del original descartaba
    // fotos de 8 MB que tras comprimir pesan 300 KB — justo las que saca cualquier teléfono.
    startTransition(async () => {
      const img = await prepararImagenRecibo(file);
      if (img.base64Length > MAX_B64_CLIENTE) {
        toast(mensajeFalloEscaneo({ tipo: "imagen-grande", bytes: img.bytes }), "error");
        return;
      }
      const res = await scanReceiptAction(img.base64, img.mimeType);
      if (!res.ok) {
        // `message` ya viene con el motivo real desde la action (timeout, límite de IA, formato…).
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
      // El modal se abre igual —editable— pero se dice qué no se pudo leer.
      if (extraccionVacia(res.data)) {
        toast(mensajeFalloEscaneo({ tipo: "vacio" }), "info");
      } else if (res.data.amount == null) {
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
