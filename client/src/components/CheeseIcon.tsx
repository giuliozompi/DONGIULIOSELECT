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
      className={`transition-all duration-300 ${isAnimating ? 'rotate-12' : ''} ${className}`}
    >
      {/* Forma del formaggio (triangolo/cuneo) */}
      <path
        d="M3 20L12 4L21 20H3Z"
        fill={filled ? '#FFD700' : 'transparent'}
        stroke={filled ? '#FFA500' : 'currentColor'}
        strokeWidth="2"
        strokeLinejoin="round"
        className="transition-all duration-300"
      />
      
      {/* Buchi del formaggio */}
      <circle
        cx="9"
        cy="14"
        r="1.5"
        fill={filled ? '#FFA500' : 'currentColor'}
        opacity={filled ? '0.6' : '0.4'}
        className="transition-all duration-300"
      />
      <circle
        cx="14"
        cy="12"
        r="1.2"
        fill={filled ? '#FFA500' : 'currentColor'}
        opacity={filled ? '0.6' : '0.4'}
        className="transition-all duration-300"
      />
      <circle
        cx="12"
        cy="16"
        r="1"
        fill={filled ? '#FFA500' : 'currentColor'}
        opacity={filled ? '0.6' : '0.4'}
        className="transition-all duration-300"
      />
    </svg>
  );
}
