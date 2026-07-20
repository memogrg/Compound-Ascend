"use client";

/**
 * Gestión de miembros del hogar (Configuración). Lista miembros con su email y
 * rol, invitaciones pendientes (revocar), e invitar por correo con el cupo del
 * plan. El límite se valida también en el servidor; acá solo se refleja.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import {
  inviteHouseholdMemberAction,
  revokeInvitationAction,
  removeHouseholdMemberAction,
} from "@/modules/personal-profile/api/actions";
import type { HouseholdMembersView } from "@/modules/personal-profile/services/household-members-service";

const ROLE_LABEL: Record<string, string> = {
  owner: "Titular",
  adult: "Adulto",
  member: "Miembro",
  viewer: "Solo lectura",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function HouseholdMembers({
  view,
  emailConfigured,
}: {
  view: HouseholdMembersView;
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { members, pending, quota, canManage, isOwner } = view;

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingTx, startTx] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const noCupo = quota.remaining <= 0;

  const invite = () =>
    startTx(async () => {
      const e = email.trim().toLowerCase();
      if (!EMAIL_RE.test(e)) return setError("Ese correo no parece válido.");
      setError(null);
      const res = await inviteHouseholdMemberAction(e);
      if (res.ok) {
        toast("Invitación enviada");
        setEmail("");
        router.refresh();
      } else {
        setError(res.message ?? "No pudimos invitar.");
      }
    });

  const revoke = (id: string) =>
    startTx(async () => {
      const res = await revokeInvitationAction(id);
      if (res.ok) {
        toast("Invitación revocada");
        router.refresh();
      } else {
        toast(res.message ?? "No pudimos revocar", "error");
      }
    });

  const remove = (userId: string) =>
    startTx(async () => {
      const res = await removeHouseholdMemberAction(userId);
      setConfirmRemove(null);
      if (res.ok) {
        toast("Miembro removido del hogar");
        router.refresh();
      } else {
        toast(res.message ?? "No pudimos quitar al miembro", "error");
      }
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Miembros activos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {members.map((m) => (
          <div
            key={m.userId}
            style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                {m.email}
                {m.isSelf ? <span className="muted" style={{ fontWeight: 400 }}> (vos)</span> : null}
              </div>
              <span className="chip-linked">{ROLE_LABEL[m.role] ?? m.role}</span>
              {m.isOwner ? <span className="chip-linked">titular</span> : null}
            </div>
            {/* Quitar: solo el owner, nunca al owner ni a uno mismo. */}
            {isOwner && !m.isOwner && !m.isSelf ? (
              confirmRemove === m.userId ? (
                <div className="auth-msg warn" style={{ flexBasis: "100%" }} role="alertdialog">
                  <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                    Al quitar a <strong>{m.email}</strong> perderá acceso a los datos del hogar. Los
                    registros que ya creó siguen siendo suyos. Esta acción no envía aviso.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: "5px 10px" }}
                      disabled={pendingTx}
                      onClick={() => setConfirmRemove(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ fontSize: 12, padding: "5px 10px" }}
                      disabled={pendingTx}
                      onClick={() => remove(m.userId)}
                    >
                      {pendingTx ? "Quitando…" : "Sí, quitar del hogar"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: "5px 10px" }}
                  disabled={pendingTx}
                  onClick={() => setConfirmRemove(m.userId)}
                >
                  Quitar
                </button>
              )
            ) : null}
          </div>
        ))}
      </div>

      {/* Invitaciones pendientes */}
      {canManage && pending.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted" style={{ fontSize: 12 }}>Invitaciones pendientes</div>
          {pending.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.email}
              </span>
              <span className="chip-linked">pendiente</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "4px 9px" }}
                disabled={pendingTx}
                onClick={() => revoke(p.id)}
              >
                Revocar
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Sobre-límite: el hogar tiene más gente que el plan; nadie se va. */}
      {quota.overLimit ? (
        <div className="auth-msg warn" role="status" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Tu hogar tiene {quota.usedActive} personas y tu plan incluye {quota.limit}. Nadie pierde
          acceso, pero no podés invitar a nadie más hasta subir de plan.
        </div>
      ) : null}

      {/* Invitar (solo editores). Deshabilitado sin cupo. */}
      {canManage ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="inp"
              type="email"
              value={email}
              placeholder="correo@ejemplo.com"
              disabled={noCupo || pendingTx}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  invite();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={noCupo || pendingTx || !email.trim()}
              onClick={invite}
            >
              {pendingTx ? "Enviando…" : "Invitar"}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Te {quota.remaining === 1 ? "queda" : "quedan"} {quota.remaining} de {quota.limit} cupos
            (el total incluye al titular).
          </div>
          {error ? (
            <span className="auth-err" role="alert">
              {error}
            </span>
          ) : null}
          {!emailConfigured ? (
            <div className="auth-msg warn" role="status" style={{ fontSize: 12, lineHeight: 1.5 }}>
              El proveedor de correo no está configurado: las invitaciones no se están enviando.
              Probá el envío en <strong>«Correo (invitaciones)»</strong> más arriba.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          Solo un adulto o el titular del hogar puede invitar o quitar miembros.
        </div>
      )}
    </div>
  );
}
