import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

/* ---------- Card ---------- */

export function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card__header">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

/* ---------- Button ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
};

export function Button({
  variant = "secondary",
  loading = false,
  children,
  disabled,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`btn btn--${variant} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

/* ---------- Text field ---------- */

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  trailing?: ReactNode;
};

export function Field({ label, hint, trailing, id, ...rest }: FieldProps) {
  const fieldId = id || rest.name;

  return (
    <label className="field" htmlFor={fieldId}>
      <span className="field__label">{label}</span>
      <div className="field__control">
        <input id={fieldId} className="field__input" {...rest} />
        {trailing && <div className="field__trailing">{trailing}</div>}
      </div>
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/* ---------- Spinner ---------- */

export function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`spinner ${small ? "spinner--small" : ""}`}
      role="status"
      aria-label="Loading"
    />
  );
}

/* ---------- Alert ---------- */

export function Alert({
  kind = "error",
  title,
  children,
}: {
  kind?: "error" | "warning" | "info";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`alert alert--${kind}`} role="alert">
      {title && <strong className="alert__title">{title}</strong>}
      <div>{children}</div>
    </div>
  );
}

/* ---------- Badge ---------- */

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "muted";
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
