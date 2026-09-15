/**
 * 有机背景组件
 *
 * 提供温暖、流动的背景效果，包括有机形状和噪点纹理
 */

'use client'

import { motion } from 'framer-motion'
import { noiseTexture } from '../design-system/tokens'

interface OrganicBackgroundProps {
  /**
   * 是否显示噪点纹理
   * @default true
   */
  showNoise?: boolean

  /**
   * 背景渐变类名
   * @default 'from-[#FFF4E6] via-[#FFE8D6] to-[#FFF8F0]'
   */
  gradient?: string
}

const floatingAnimation = {
  y: [0, -10, 0],
  transition: {
    duration: 6,
    repeat: Infinity,
    ease: 'easeInOut',
  },
}

export function OrganicBackground({
  showNoise = true,
  gradient = 'from-[#FFF4E6] via-[#FFE8D6] to-[#FFF8F0]',
}: OrganicBackgroundProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden bg-gradient-to-br ${gradient}`}>
      <div className="pointer-events-none absolute inset-0">
        {/* 有机形状背景 */}
        <motion.div
          animate={floatingAnimation}
          className="absolute -left-20 top-[-100px] h-[500px] w-[500px] rounded-[45%_55%_60%_40%/50%_60%_40%_50%] bg-gradient-to-br from-[#FFB4A2]/30 to-[#FF9B8A]/20 blur-3xl"
        />

        <motion.div
          animate={{
            ...floatingAnimation,
            transition: { ...floatingAnimation.transition, delay: 1 },
          }}
          className="absolute right-[-100px] top-[200px] h-[600px] w-[600px] rounded-[40%_60%_55%_45%/55%_45%_55%_45%] bg-gradient-to-br from-[#FFD4A3]/25 to-[#FFC888]/15 blur-3xl"
        />

        <motion.div
          animate={{
            ...floatingAnimation,
            transition: { ...floatingAnimation.transition, delay: 2 },
          }}
          className="absolute bottom-[-150px] left-1/3 h-[450px] w-[450px] rounded-[55%_45%_50%_50%/45%_55%_45%_55%] bg-gradient-to-br from-[#A8D5BA]/20 to-[#7FC89D]/15 blur-3xl"
        />

        {/* 噪点纹理 */}
        {showNoise && (
          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: noiseTexture,
            }}
          />
        )}
      </div>
    </div>
  )
}
