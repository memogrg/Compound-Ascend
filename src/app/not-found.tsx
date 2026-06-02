import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24 }}>
      <div className="card card-pad" style={{ textAlign: "center", maxWidth: 420 }}>
        <div className="num-xl" style={{ fontSize: 56 }}>
          404
        </div>
        <div className="card-title" style={{ marginTop: 8 }}>
          No encontramos esta página
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Es posible que el enlace haya cambiado o ya no exista.
        </p>
        <Link className="btn btn-primary" href="/dashboard" style={{ marginTop: 16 }}>
          Volver al panel
        </Link>
      </div>
    </div>
  );
}
