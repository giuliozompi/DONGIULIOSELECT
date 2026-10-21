interface CheeseSliceIconProps {
  className?: string;
  filled?: boolean;
}

/** A cheese wedge, not a heart. Holes stay visible in both selection states. */
export function CheeseSliceIcon({ className = 'h-6 w-6', filled = false }: CheeseSliceIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true" focusable="false" data-cheese-slice="true">
      <path d="M3 10 19 3l2 7-8 3Z" fill={filled ? '#FFE47A' : '#FFF3BD'}
        stroke="#C88712" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 10h18v10H3Z" fill={filled ? '#FFD13B' : '#FFF0A3'}
        stroke="#C88712" strokeWidth="1.5" strokeLinejoin="round" />
      <ellipse cx="8" cy="14" rx="1.5" ry="1.2" fill="#CB8511" />
      <circle cx="16.5" cy="15.5" r="1.6" fill="#CB8511" />
      <circle cx="11" cy="18" r="1" fill="#CB8511" />
      <ellipse cx="15.5" cy="7.5" rx="1.2" ry=".8" fill="#CB8511" />
    </svg>
  );
}
