import type { ReactNode } from "react";
import type { Theme } from "./theme";

export const buttonBaseClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold tracking-tight transition-all duration-150 ease-out active:scale-[0.97] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

export const buttonPrimaryClass = `${buttonBaseClass} bg-blue-600 hover:bg-blue-500 text-white shadow-xs hover:shadow-sm font-bold`;
export const buttonSecondaryClass = `${buttonBaseClass} border border-line bg-card/90 backdrop-blur-xs text-ink hover:bg-paper-deep hover:border-muted/60 shadow-xs`;
export const buttonQuietClass = `${buttonBaseClass} bg-transparent text-muted hover:bg-paper-deep/80 hover:text-ink`;
export const buttonLightClass = `${buttonBaseClass} bg-white text-slate-900 font-bold shadow-xs hover:bg-slate-100`;
export const buttonOutlineLightClass = `${buttonBaseClass} border border-white/20 bg-white/10 text-white hover:bg-white/20 backdrop-blur-xs`;

export const fieldClass = "grid gap-1.5 text-xs font-semibold text-ink";
export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-paper/80 px-3.5 text-sm font-normal text-ink transition-all duration-150 ease-out placeholder:text-input-placeholder focus:border-blue-500 focus:bg-card focus:outline-none focus:ring-3 focus:ring-blue-500/15 hover:border-muted/50 disabled:cursor-not-allowed disabled:opacity-60";
export const textareaClass = `${inputClass} min-h-[100px] resize-y py-3 leading-relaxed`;
export const selectClass = `${inputClass} cursor-pointer`;

export function BrandMark({
  large = false,
  light = false,
  className = "",
}: {
  large?: boolean;
  light?: boolean;
  className?: string;
}) {
  return (
    <img
      src={light ? "/icon-light.png" : "/icon.png"}
      alt="CursouCon"
      className={`object-contain shrink-0 ${large ? "size-14" : "size-9"} ${className}`}
    />
  );
}

export function BrandLockup({ light = false, className = "" }: { light?: boolean; className?: string }) {
  return (
    <img
      src={light ? "/logo-light.png" : "/logo.png"}
      alt="CursouCon"
      className={`h-9 w-auto object-contain shrink-0 ${className}`}
    />
  );
}

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      className={`m-0 text-[.68rem] font-bold uppercase leading-[1.3] tracking-[.15em] ${
        light ? "text-contrast/70" : "text-muted"
      }`}
    >
      {children}
    </p>
  );
}

export function ThemeToggle({
  theme,
  onToggle,
  light = false,
}: {
  theme: Theme;
  onToggle: () => void;
  light?: boolean;
}) {
  const isDark = theme === "dark";

  return (
    <button
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all duration-150 ease-out active:scale-[0.97] cursor-pointer ${
        light
          ? "border-contrast/20 bg-contrast/10 text-contrast hover:bg-contrast/20"
          : "border-line bg-card/90 text-muted hover:border-muted/60 hover:text-ink shadow-xs"
      }`}
      type="button"
      onClick={onToggle}
      aria-label={`Alternar para tema ${isDark ? "claro" : "escuro"}`}
    >
      {isDark ? (
        <svg className="size-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="size-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      <span>{isDark ? "Escuro" : "Claro"}</span>
    </button>
  );
}

// Icons for navigation and UI
export function IconToday({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export function IconPlan({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

export function IconMaterials({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

export function IconPractice({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function IconProgress({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

export function IconExplore({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}
