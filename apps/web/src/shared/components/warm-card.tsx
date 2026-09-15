/**
 * 温暖风格的卡片组件
 *
 * 提供一致的卡片样式，支持多种变体和动画效果
 */

'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '../design-system/tokens'
import type { ReactNode } from 'react'

type CardVariant = 'default' | 'gradient' | 'glass'
type CardSize = 'sm' | 'md' | 'lg' | 'xl'

interface WarmCardProps extends HTMLMotionProps<'div'> {
  variant?: CardVariant
  size?: CardSize
  children: ReactNode
  hoverable?: boolean
  borderColor?: string
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-white/70 border-[#FFB4A2]/25',
  gradient: 'bg-gradient-to-br from-white to-[#FFF8F0] border-[#FFB4A2]/25',
  glass: 'bg-white/60 border-white/60 backdrop-blur-md',
}

const sizeStyles: Record<CardSize, string> = {
  sm: 'rounded-[20px] p-5',
  md: 'rounded-[24px] p-6',
  lg: 'rounded-[28px] p-8',
  xl: 'rounded-[36px] p-10',
}

export function WarmCard({
  variant = 'default',
  size = 'md',
  children,
  hoverable = false,
  borderColor,
  className,
  ...props
}: WarmCardProps) {
  const baseStyles = cn(
    'border shadow-lg shadow-[#FFB4A2]/10',
    variantStyles[variant],
    sizeStyles[size],
    hoverable && 'transition-all hover:-translate-y-2 hover:shadow-xl hover:shadow-[#FFB4A2]/15',
    borderColor,
    className
  )

  return (
    <motion.div
      {...props}
      className={baseStyles}
      {...(hoverable && {
        whileHover: { y: -8 },
      })}
    >
      {children}
    </motion.div>
  )
}
