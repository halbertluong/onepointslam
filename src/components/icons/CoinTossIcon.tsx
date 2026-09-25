// U+1FA99 (🪙) has no glyph in Firefox's bundled fallback fonts on many
// Linux setups, so it renders as a boxed hex code instead of a coin. An
// inline SVG renders identically everywhere.
export function CoinTossIcon({ className = 'inline-block w-3.5 h-3.5 shrink-0 align-[-2px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#fcd34d" stroke="#b45309" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#b45309" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}
