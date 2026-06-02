/** Logotipo de Compound Ascend (curva ascendente). */
export function BrandMark() {
  return (
    <div className="brand-mark" aria-label="Compound Ascend">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 20 C 4 14, 8 9, 14 7"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M4 20 C 8 17, 13 13, 19 5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <circle cx="19" cy="5" r="1.9" fill="currentColor" />
      </svg>
    </div>
  );
}
