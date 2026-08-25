/**
 * Payload del pago de prima de póliza, PURO (sin JSX ni "use client"): lo arma tanto la UI web
 * (defense-view / wealth-actions) como el test, para que web y móvil manden el MISMO contrato a
 * `payPolicyPremiumAction`. Vive en el engine —no en el componente cliente— para ser testeable en
 * el entorno node de vitest sin acarrear React. FIJA la moneda de la PÓLIZA (nunca la de display).
 */

/** Lo mínimo de una póliza que el pago de prima necesita (no acopla al tipo completo de UI). */
export type PremiumPolicy = { id: string; currency: string; provider?: string | null };

/** El payload crudo para `payPolicyPremiumAction` (el schema del servidor lo valida). */
export type PremiumPayload = {
  policyId: string;
  amount: number | undefined;
  currency: string;
  paymentDate: string;
  policyName: string;
};

/**
 * Arma el payload desde la póliza + los campos del form. Compone el nombre igual que el móvil
 * (`${etiqueta} · ${aseguradora}`, o solo la etiqueta) y FIJA `currency` a la de la póliza — el
 * riesgo de paridad que cubre el test es que el web mande la moneda de display en su lugar.
 */
export function premiumActionPayload(
  policy: PremiumPolicy,
  form: { amount: number | undefined; paymentDate: string; label: string },
): PremiumPayload {
  const policyName = policy.provider ? `${form.label} · ${policy.provider}` : form.label;
  return {
    policyId: policy.id,
    amount: form.amount,
    currency: policy.currency,
    paymentDate: form.paymentDate,
    policyName,
  };
}
