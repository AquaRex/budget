import type { CSSProperties, ReactNode } from "react"

/** Types for the React Bits ReflectiveCard (ReflectiveCard.jsx). */
export type ReflectiveCardProps = {
  name?: string
  role?: string
  badge?: string
  status?: string
  statusColor?: string
  idLabel?: string
  idValue?: string
  children?: ReactNode
  theme?: "dark" | "light"
  videoSrc?: string
  /** Uses the camera for the reflection. Keep false. */
  webcam?: boolean
  onWebcamError?: (error: Error) => void
  tint?: string
  metalness?: number
  roughness?: number
  blurStrength?: number
  grayscale?: number
  warp?: number
  warpScale?: number
  shine?: number
  bevel?: number
  glare?: number
  enableTilt?: boolean
  tiltStrength?: number
  intro?: boolean
  width?: number | string
  height?: number | string
  radius?: number
  className?: string
  style?: CSSProperties
}

declare const ReflectiveCard: (props: ReflectiveCardProps) => ReactNode
export default ReflectiveCard
