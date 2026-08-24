import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

const eyeOpen = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
  />
);

const eyeClosed = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.847 0 1.669-.105 2.454-.303M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.243L9.88 9.88"
  />
);

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, hint, id, type = "text", className = "", ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const isPassword = type === "password";
    const [visible, setVisible] = useState(false);

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium text-navy-500">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={fieldId}
            type={isPassword && visible ? "text" : type}
            aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
            className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-navy-500 placeholder:text-navy-500/35 transition-colors outline-none ${
              error
                ? "border-error focus:border-error focus:ring-2 focus:ring-error/15"
                : "border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            } ${isPassword ? "pr-11" : ""} ${className}`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-navy-500/40 hover:text-navy-500/70"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-5 w-5">
                {visible ? eyeClosed : eyeOpen}
              </svg>
            </button>
          )}
        </div>
        {error && (
          <p id={`${fieldId}-error`} className="text-sm text-error">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${fieldId}-hint`} className="text-sm text-navy-500/50">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = "FormField";
export default FormField;
