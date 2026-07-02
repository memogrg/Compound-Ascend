/** Isotipo de CARTERA+ ("C" con el "+" en el color de acento). */
export function BrandMark() {
  return (
    <div className="brand-mark" aria-label="CARTERA+">
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path
          d="M45 18.5 A 19 19 0 1 0 45 45.5"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M46 26 V38 M40 32 H52"
          stroke="var(--accent)"
          strokeWidth="4.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
