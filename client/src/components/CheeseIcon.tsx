interface CheeseIconProps {
  className?: string;
  filled?: boolean;
}

export function CheeseIcon({ className = "w-6 h-6", filled = false }: CheeseIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "#FFD700" : "none"}
      stroke={filled ? "#FFD700" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2.27 19.27A2.5 2.5 0 0 0 4 20h16a2.5 2.5 0 0 0 1.73-4.27L12 6.18 2.27 15.73A2.5 2.5 0 0 0 2 17c0 .69.28 1.32.73 1.77Z" />
      <circle cx="8" cy="13" r="1" fill={filled ? "#000" : "currentColor"} />
      <circle cx="14" cy="16" r="1" fill={filled ? "#000" : "currentColor"} />
      <circle cx="17" cy="12" r="1" fill={filled ? "#000" : "currentColor"} />
    </svg>
  );
}
