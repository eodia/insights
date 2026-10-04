/** Eodia's Focus mark: an open ring, a focal point and a mint accent. */
export function BrandMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="64" height="64" rx="16" fill="#104832" />
      <path d="M32 15a17 17 0 1 0 17 17" stroke="#dcf3bd" strokeWidth="9" strokeLinecap="round" />
      <rect x="27" y="27" width="10" height="10" rx="3" fill="#dcf3bd" />
      <circle cx="46" cy="18" r="5" fill="#76cf98" />
    </svg>
  )
}
