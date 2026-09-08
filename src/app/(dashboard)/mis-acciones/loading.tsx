/** Esqueleto de /mis-acciones: mismo esqueleto que el Suspense de la página. */
export default function Loading() {
  return (
    <div className="grid" aria-hidden="true">
      <div className="skel" style={{ height: 34, width: 240 }} />
      <div className="skel" style={{ height: 40 }} />
      <div className="acc-layout">
        <div className="acc-main">
          <div className="skel" style={{ height: 70 }} />
          <div className="skel" style={{ height: 230 }} />
          <div className="skel" style={{ height: 120 }} />
        </div>
        <div className="skel" style={{ height: 380 }} />
      </div>
    </div>
  );
}
