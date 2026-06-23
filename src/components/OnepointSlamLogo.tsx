interface LogoProps {
  color?: string;
  size?: number;
  className?: string;
}

export default function OnepointSlamLogo({ color = 'currentColor', size = 32, className }: LogoProps) {
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
      <circle cx="32" cy="32" r="30" stroke={color} strokeWidth="4" fill="none" />
      {/* Tennis ball curved seam lines */}
      <path
        d="M 10 20 Q 32 32 10 44"
        stroke={color}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 54 20 Q 32 32 54 44"
        stroke={color}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Bold "1" numeral */}
      <text
        x="32"
        y="43"
        textAnchor="middle"
        fontSize="28"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
        fill={color}
      >
        1
      </text>
    </svg>
  );
}
