import logoDefault from "../assets/logo.svg";
import logoLight from "../assets/logo-light.svg";

type LogoProps = {
  className?: string;
  withTagline?: boolean;
  /** "light" swaps the navy wordmark for white — for dark/navy backgrounds. */
  variant?: "default" | "light";
};

export default function Logo({ className = "h-10", withTagline = false, variant = "default" }: LogoProps) {
  return (
    <div className="flex flex-col items-start gap-1">
      <img src={variant === "light" ? logoLight : logoDefault} alt="NextStep²" className={className} />
      {withTagline && (
        <p
          className={`text-sm font-medium tracking-wide ${
            variant === "light" ? "text-white/70" : "text-navy-500/70"
          }`}
        >
          Where Careers Begin.
        </p>
      )}
    </div>
  );
}
