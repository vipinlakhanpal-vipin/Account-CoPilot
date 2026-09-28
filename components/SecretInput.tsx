"use client";
import { useState } from "react";

/** Password / PIN field with an eye button to show or hide what you type. */
export default function SecretInput({ value, onChange, id, placeholder, autoComplete = "off", inputMode, required, autoFocus, className, style }: {
  value: string; onChange: (v: string) => void; id?: string; placeholder?: string; autoComplete?: string; inputMode?: "numeric" | "text";
  required?: boolean; autoFocus?: boolean; className?: string; style?: React.CSSProperties;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className={`secret ${className || ""}`}>
      <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        autoComplete={autoComplete} inputMode={inputMode} required={required} autoFocus={autoFocus} style={style} />
      <button type="button" className="secret-eye" onClick={() => setShow((x) => !x)} aria-label={show ? "Hide" : "Show"} title={show ? "Hide" : "Show"}>
        {show
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.5-2.7 3.8M6.2 6.2C4.2 7.6 2.7 9.7 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.7-1.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>}
      </button>
    </span>
  );
}
