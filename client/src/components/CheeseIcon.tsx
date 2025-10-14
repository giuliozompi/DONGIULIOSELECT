interface CheeseIconProps {
  className?: string;
  filled?: boolean;
  isAnimating?: boolean;
}

export function CheeseIcon({ className = "w-6 h-6", filled = false, isAnimating = false }: CheeseIconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-all duration-300 ${isAnimating ? 'scale-110' : ''} ${className}`}
    >
      {/* Cuore */}
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill={filled ? '#FFD700' : 'transparent'}
        stroke={filled ? '#FFA500' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-300"
      />
      
      {/* Buchini del formaggio - visibili solo quando riempito */}
      {filled && (
        <>
          <circle cx="9" cy="9" r="1.5" fill="rgba(255, 255, 255, 0.75)" />
          <circle cx="14" cy="10" r="1.2" fill="rgba(255, 255, 255, 0.7)" />
          <circle cx="11" cy="12" r="1" fill="rgba(255, 255, 255, 0.8)" />
          <circle cx="15" cy="14" r="1.3" fill="rgba(255, 255, 255, 0.7)" />
          <circle cx="10" cy="15" r="0.9" fill="rgba(255, 255, 255, 0.75)" />
          <circle cx="13" cy="16" r="0.8" fill="rgba(255, 255, 255, 0.7)" />
        </>
      )}
    </svg>
  );
}
