/**
 * 设计系统 - 温暖人性化主题
 *
 * 这个文件定义了 Branching Chat 的设计 tokens，
 * 确保整个应用保持一致的视觉语言。
 */

export const colors = {
  // 主色调 - 温暖的桃色/珊瑚色
  primary: {
    coral: '#FF9B8A',
    peach: '#FFB4A2',
    light: '#FFC8B8',
    lighter: '#FFD4C8',
  },

  // 辅助色 - 奶油色
  cream: {
    base: '#FFF4E6',
    light: '#FFF8F0',
    medium: '#FFE8D6',
    dark: '#FFE8C5',
  },

  // 点缀色 - 温柔的绿色
  accent: {
    green: '#7FC89D',
    lightGreen: '#A8D5BA',
  },

  // 中性色 - 温暖的灰色
  neutral: {
    50: '#FAFAF9',
    100: '#F5F5F4',
    200: '#E7E5E4',
    300: '#D6D3D1',
    400: '#A8A29E',
    500: '#78716C',
    600: '#57534E',
    700: '#44403C',
    800: '#292524',
    900: '#1C1917',
  },
} as const

export const gradients = {
  // 背景渐变
  background: 'from-[#FFF4E6] via-[#FFE8D6] to-[#FFF8F0]',

  // 主色渐变
  primary: 'from-[#FF9B8A] via-[#FFB4A2] to-[#FFC8B8]',
  primarySimple: 'from-[#FF9B8A] to-[#FFB4A2]',

  // 卡片渐变
  card: 'from-white to-[#FFF8F0]',
  cardReverse: 'from-white/80 to-[#FFF4E6]/60',

  // 中性渐变
  neutralDark: 'from-neutral-800 via-neutral-900 to-[#5A5555]',
  neutralButton: 'from-neutral-900 to-neutral-800',
} as const

export const borderRadius = {
  // 有机的、温暖的圆角
  card: {
    sm: '18px',   // 小卡片
    md: '24px',   // 中等卡片
    lg: '28px',   // 大卡片
    xl: '36px',   // 超大卡片
    xxl: '40px',  // 容器级别
  },
  button: {
    sm: '16px',
    md: '20px',
    full: '9999px', // 完全圆形
  },
  input: '16px',
  badge: '9999px',
} as const

export const shadows = {
  // 温暖的阴影效果
  card: {
    sm: 'shadow-md shadow-[#FFB4A2]/10',
    md: 'shadow-lg shadow-[#FFB4A2]/10',
    lg: 'shadow-xl shadow-[#FFB4A2]/15',
    xl: 'shadow-2xl shadow-[#FFB4A2]/15',
  },
  button: {
    primary: 'shadow-xl shadow-[#FF9B8A]/25',
    primaryHover: 'shadow-2xl shadow-[#FF9B8A]/35',
    neutral: 'shadow-xl shadow-neutral-900/20',
    neutralHover: 'shadow-2xl shadow-neutral-900/30',
  },
  subtle: 'shadow-md shadow-neutral-200/50',
} as const

export const typography = {
  // 字体家族
  fontFamily: {
    serif: 'font-serif', // 用于标题，温暖的衬线字体
    sans: 'font-sans',   // 用于正文
  },

  // 标题大小
  heading: {
    h1: 'text-5xl sm:text-6xl font-bold',
    h2: 'text-3xl font-bold',
    h3: 'text-2xl font-bold',
    h4: 'text-xl font-bold',
    h5: 'text-lg font-bold',
  },
} as const

export const animations = {
  // 动画变体 (用于 framer-motion)
  fadeInUp: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  },

  fadeInScale: {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
  },

  staggerContainer: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  },

  floating: {
    y: [0, -10, 0],
    transition: {
      duration: 6,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },

  // 悬停效果
  hover: {
    scale: 1.05,
    y: -2,
  },

  hoverCard: {
    y: -4,
  },

  tap: {
    scale: 0.95,
  },
} as const

export const spacing = {
  // 一致的间距系统
  section: 'gap-12 sm:gap-16',
  card: 'gap-5',
  cardLarge: 'gap-8',
} as const

/**
 * 有机形状的背景斑点
 * 用于创建温暖、流动的背景效果
 */
export const organicShapes = {
  blob1: 'rounded-[45%_55%_60%_40%/50%_60%_40%_50%]',
  blob2: 'rounded-[40%_60%_55%_45%/55%_45%_55%_45%]',
  blob3: 'rounded-[55%_45%_50%_50%/45%_55%_45%_55%]',
  blob4: 'rounded-[50%_50%_45%_55%/60%_40%_60%_40%]',
} as const

/**
 * 噪点纹理 SVG (用于背景)
 */
export const noiseTexture = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")` as const

/**
 * 工具函数：组合 Tailwind 类名
 */
export function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
