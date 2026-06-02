"use client";

/**
 * Error global (último recurso, reemplaza el root layout). Debe incluir
 * <html>/<body> propios. Mensaje amable, sin detalles internos.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="es">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          background: "#F4F2EC",
          color: "#15140F",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Algo salió mal</h1>
          <p style={{ color: "#807C72", fontSize: 14 }}>
            Tuvimos un problema inesperado. Ya estamos al tanto.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "10px 16px",
              borderRadius: 10,
              border: 0,
              background: "#15140F",
              color: "#F4F2EC",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
