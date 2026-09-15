'use client'

/**
 * Download helpers for the BMC export. Two formats supported:
 *
 *   - SVG  (vector, paper-best — drop straight into LaTeX as <svg> or
 *           convert to PDF via Inkscape `inkscape input.svg --export-pdf=out.pdf`)
 *   - PNG  (raster at 2x device pixel ratio for slides / blogs)
 *
 * Both go through a single `triggerDownload` for consistent UX. The PNG path
 * rasterises the SVG via an off-screen `<img>` + `<canvas>` — no extra deps.
 */

/** Compose a deterministic, sortable filename. */
export function bmcExportFilename(ext: 'svg' | 'png'): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '-')
  return `starlink-bmc-${ts}.${ext}`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Defer revoke a tick so Safari finishes writing the file
  setTimeout(() => URL.revokeObjectURL(url), 200)
}

/**
 * Download an SVG string as a file.
 */
export function downloadSvg(svgString: string): void {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  triggerDownload(blob, bmcExportFilename('svg'))
}

/**
 * Rasterise an SVG to PNG at 2x device pixel ratio and trigger download.
 *
 * Strategy: serialize → blob URL → load into <img> → drawImage to <canvas> →
 * canvas.toBlob → download. Stays entirely client-side. No CORS concerns
 * since the SVG is built in-memory, not fetched.
 */
export async function downloadPng(svgString: string, scale = 2): Promise<void> {
  // Extract the canvas dimensions from the root <svg> tag so we can size the
  // raster output without parsing the whole DOM. Falls back to 1280×720
  // (matches build-bmc-svg's CANVAS_W/H) if the regex misses.
  const widthMatch = svgString.match(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/i)
  const heightMatch = svgString.match(/<svg[^>]*\sheight="(\d+(?:\.\d+)?)"/i)
  const baseW = widthMatch ? parseFloat(widthMatch[1]) : 1280
  const baseH = heightMatch ? parseFloat(heightMatch[1]) : 720

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const img = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(baseW * scale)
    canvas.height = Math.round(baseH * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to acquire 2D canvas context')
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, baseW, baseH)
    await new Promise<void>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob returned null'))
          return
        }
        triggerDownload(blob, bmcExportFilename('png'))
        resolve()
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(new Error(`Image failed to load: ${e}`))
    img.src = src
  })
}
