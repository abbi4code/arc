export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M8 21a8 8 0 0 1 16 0" fill="none" stroke="var(--accent-fg)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="11" r="2.2" fill="var(--accent-fg)" />
    </svg>
  )
}
