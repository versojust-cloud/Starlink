'use client'

/**
 * CanvasRegions — Editorial Boardroom v2 zone overlay (2026-05-02).
 *
 * Renders the 4 CC-BMC structural zones (Supply / Value / Customer /
 * Finance) as quiet newspaper-style frames behind the nodes. Each zone
 * is a hair-line rectangle + a mono kicker label in the top-left corner.
 *
 * v1 → v2 changes:
 *   - drop linear gradient fills (cyan/amber/emerald/pink @ 5-15%)
 *   - drop dashed animated borders + outer glow filter
 *   - drop per-zone accent colors → all zones use ash-3 hairlines so
 *     they never compete with node bylines for color attention
 *   - drop the central amber crosshair (visual noise)
 *   - drop the right-corner glass legend (the in-canvas kicker labels
 *     ARE the legend)
 *   - drop Outfit / DM Sans inline font-family (use Fraunces + mono)
 *   - drop translate-on-zoom math; ReactFlow's <Background> already
 *     handles viewport, and our zones are positioned in canvas
 *     coordinates so they pan/zoom with the rest of the surface
 */

import { memo } from 'react'
import { useViewport } from 'reactflow'

interface BmcZone {
  id: string
  label: string
  sublabel: string
  x: number
  y: number
  width: number
  height: number
  domains: string[]
}

const BMC_ZONES: BmcZone[] = [
  {
    id: 'supply-chain',
    label: '供应链与运营',
    sublabel: 'SUPPLY CHAIN · OPERATIONS',
    x: 50,
    y: 50,
    width: 480,
    height: 950,
    domains: ['重要合作', '关键业务', '核心资源'],
  },
  {
    id: 'value-core',
    label: '价值核心',
    sublabel: 'VALUE CORE',
    x: 560,
    y: 350,
    width: 380,
    height: 350,
    domains: ['价值主张'],
  },
  {
    id: 'customer-market',
    label: '客户与市场',
    sublabel: 'CUSTOMER · MARKET',
    x: 970,
    y: 50,
    width: 480,
    height: 950,
    domains: ['客户细分', '客户关系', '渠道通路'],
  },
  {
    id: 'finance',
    label: '财务结构',
    sublabel: 'FINANCIAL STRUCTURE',
    x: 50,
    y: 1030,
    width: 1400,
    height: 280,
    domains: ['成本结构', '收入来源'],
  },
]

export const CanvasRegions = memo(() => {
  const { x, y, zoom } = useViewport()

  return (
    <div
      className="absolute inset-0 pointer-events-none z-0"
      style={{
        transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        transformOrigin: '0 0',
      }}
    >
      {/* Hairline zone frames — all ash-3 at 16% opacity, single-line.
          Render as SVG so the stroke scales smoothly with the canvas
          zoom. */}
      <svg
        width="2000"
        height="1500"
        viewBox="0 0 2000 1500"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {BMC_ZONES.map((zone) => (
          <rect
            key={zone.id}
            x={zone.x}
            y={zone.y}
            width={zone.width}
            height={zone.height}
            fill="none"
            stroke="rgba(19, 27, 46, 0.10)"
            strokeWidth="0.5"
            strokeDasharray="6 6"
            // No rounded corners — newspaper rule, brutalist
          />
        ))}
      </svg>

      {/* Zone labels — mono kicker + Fraunces sub. No glass card,
          no shadow. Sits on top of the hairline frame in the
          top-left corner of each zone. */}
      {BMC_ZONES.map((zone) => (
        <div
          key={`label-${zone.id}`}
          className="absolute pointer-events-none flex flex-col gap-0.5"
          style={{
            left: `${zone.x + 16}px`,
            top: `${zone.y + 12}px`,
          }}
        >
          <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
            {zone.sublabel}
          </span>
          <span className="font-display font-[700] text-[13px] tracking-tight text-stratum-navy">
            {zone.label}
          </span>
          {zone.domains.length > 1 ? (
            <span className="font-body text-[9px] uppercase tracking-[0.18em] text-stratum-muted mt-0.5">
              {zone.domains.join(' · ')}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
})

CanvasRegions.displayName = 'CanvasRegions'
