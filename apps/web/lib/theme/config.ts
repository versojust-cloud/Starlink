import type { Theme } from './types'

// 浅色主题 - 白紫配色
export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: {
      primary: 'bg-[#F4F5FF]',      // 浅紫蓝背景
      secondary: 'bg-white/80',      // 半透明白色
      card: 'bg-white'               // 纯白卡片
    },
    border: {
      default: 'border-[#E3E6FF]',   // 浅紫边框
      hover: 'border-[#7A6EEF]/50'   // hover紫色边框
    },
    text: {
      primary: 'text-slate-900',     // 深色主文字
      secondary: 'text-slate-700',   // 次要文字
      tertiary: 'text-slate-600',    // 三级文字
      muted: 'text-slate-500'        // 弱化文字
    },
    brand: {
      from: 'from-[#9B87F5]',        // 紫色渐变起始
      to: 'to-[#7A6EEF]',            // 紫色渐变结束
      solid: 'bg-[#7A6EEF]',         // 纯紫色
      light: 'bg-[#EEF0FF]'          // 浅紫色背景
    },
    interactive: {
      hover: 'hover:bg-white/50',    // hover白色
      active: 'bg-gradient-to-r from-[#EEF0FF] to-[#F2F4FF]'  // active浅紫
    }
  }
}

// 深色主题 - 黑蓝配色
export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: {
      primary: 'bg-slate-950',       // 深色背景
      secondary: 'bg-slate-900/95',  // 次要深色背景
      card: 'bg-slate-800/50'        // 深色卡片（提高对比度）
    },
    border: {
      default: 'border-slate-700',   // 深色边框（更亮一些）
      hover: 'border-cyan-400/60'    // hover青色边框（更亮）
    },
    text: {
      primary: 'text-white',         // 白色主文字
      secondary: 'text-slate-200',   // 更亮的次要文字
      tertiary: 'text-slate-300',    // 更亮的三级文字
      muted: 'text-slate-400'        // 更亮的弱化文字
    },
    brand: {
      from: 'from-cyan-400',         // 青色渐变起始（更亮）
      to: 'to-blue-500',             // 蓝色渐变结束（更亮）
      solid: 'bg-cyan-500',          // 纯青色
      light: 'bg-slate-800/80'       // 深灰背景
    },
    interactive: {
      hover: 'hover:bg-slate-800/50', // hover深色
      active: 'bg-slate-800/70'      // active深色
    }
  }
}

export const themes = {
  light: lightTheme,
  dark: darkTheme
}
