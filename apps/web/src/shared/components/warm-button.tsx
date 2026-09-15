/**
 * 温暖风格的按钮组件
 *
 * 提供一致的按钮样式，支持多种变体
 */

'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '../design-system/tokens'
import type { ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark'
type ButtonSize = 'sm' | 'md' | 'lg'

interface WarmButtonProps extends Omit<HTMLMotionProps<'button'>, 'size'> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
  href?: string
  fullWidth?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-[#FF9B8A] to-[#FFB4A2] text-white shadow-xl shadow-[#FF9B8A]/25 hover:shadow-2xl hover:shadow-[#FF9B8A]/35',
  secondary:
    'border-2 border-neutral-200 text-neutral-700 hover:border-[#FFB4A2] hover:bg-white/50 hover:text-[#FF9B8A]',
  ghost:
    'border border-[#FFB4A2]/40 bg-white/70 text-[#FF9B8A] shadow-sm hover:border-[#FF9B8A] hover:bg-white hover:shadow-md backdrop-blur-sm',
  dark: 'bg-gradient-to-r from-neutral-900 to-neutral-800 text-white shadow-xl shadow-neutral-900/20 hover:shadow-2xl hover:shadow-neutral-900/30',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function WarmButton({
  variant = 'primary',
  size = 'md',
  children,
  href,
  fullWidth = false,
  className,
  ...props
}: WarmButtonProps) {
  const baseStyles = cn(
    'rounded-full font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9B8A]/60 focus-visible:ring-offset-2',
    variantStyles[variant],
    sizeStyles[size],
    fullWidth ? 'w-full' : '',
    className
  )

  if (href) {
    return (
      <motion.a
        {...(props as unknown as HTMLMotionProps<'a'>)}
        href={href}
        className={baseStyles}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
      >
        {children}
      </motion.a>
    )
  }

  return (
    <motion.button
      {...props}
      type="button"
      className={baseStyles}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
    >
      {children}
    </motion.button>
  )
}
