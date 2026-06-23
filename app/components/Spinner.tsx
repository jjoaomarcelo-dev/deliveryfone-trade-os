'use client'

interface SpinnerProps {
  size?: number   // px, default 40
  color?: string  // default #c8960c
}

export default function Spinner({ size = 40, color = '#c8960c' }: SpinnerProps) {
  return (
    <div
      className="rounded-full border-2 animate-spin"
      style={{
        width: size,
        height: size,
        borderColor: color,
        borderTopColor: 'transparent',
      }}
    />
  )
}

export function SpinnerPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      <Spinner />
    </div>
  )
}
