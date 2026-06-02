/** Campo de formulario reutilizable para auth (label + input + error). */
export function Field({
  label,
  name,
  type = "text",
  placeholder,
  autoComplete,
  defaultValue,
  error,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="fld">
      <label className="fld-label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        className="inp"
        placeholder={placeholder}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? true : undefined}
      />
      {error ? <span className="auth-err">{error}</span> : null}
    </div>
  );
}
