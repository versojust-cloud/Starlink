/**
 * Starlink brand glyph — a 4-star constellation with two connecting lines.
 *
 * Renders as inline SVG so it inherits currentColor + stays crisp at any
 * size. The two outer stars subtly twinkle (CSS-only, opacity oscillation)
 * while the inner ones stay steady — gives the brand chip a small life
 * signal without becoming gimmicky.
 */
export function StarlinkGlyph({
  size = 16,
  className = ''
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* connecting lines (sub-pixel, low opacity — feels like ruled chart paper) */}
      <line x1="3.5" y1="11" x2="7.5" y2="6.5" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
      <line x1="7.5" y1="6.5" x2="12.5" y2="9" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
      <line x1="7.5" y1="6.5" x2="11" y2="3" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
      {/* the 4 stars: anchor (filled), 3 satellites */}
      <circle cx="7.5" cy="6.5" r="1.6" fill="currentColor" />
      <circle cx="3.5" cy="11" r="0.9" fill="currentColor" className="starlink-twinkle-a" />
      <circle cx="12.5" cy="9" r="0.7" fill="currentColor" className="starlink-twinkle-b" />
      <circle cx="11" cy="3" r="0.5" fill="currentColor" opacity="0.7" />
    </svg>
  )
}
