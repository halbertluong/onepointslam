interface LogoProps {
  color?: string;
  size?: number;
  className?: string;
  dark?: boolean;
}

// One Point Bowl mark: lightning bolt striking through a tennis ball circle
export default function OnePointBowlLogo({ color = 'currentColor', size = 32, className, dark = false }: LogoProps) {
  const track = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer ring */}
      <circle cx="32" cy="32" r="29" stroke={color} strokeWidth="3.5" fill="none" />
      {/* Tennis ball seam — left arc */}
      <path d="M14 18 Q28 32 14 46" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.45" />
      {/* Tennis ball seam — right arc */}
      <path d="M50 18 Q36 32 50 46" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.45" />
      {/* Lightning bolt — the main mark */}
      <polygon
        points="36,8 24,34 32,34 28,56 42,28 34,28"
        fill={color}
      />
    </svg>
  );
}
