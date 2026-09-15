export type ThemeMode = 'light' | 'dark'

export interface ThemeColors {
  // 背景色
  background: {
    primary: string      // 主背景
    secondary: string    // 次要背景
    card: string        // 卡片背景
  }

  // 边框色
  border: {
    default: string     // 默认边框
    hover: string       // hover边框
  }

  // 文字色
  text: {
    primary: string     // 主文字
    secondary: string   // 次要文字
    tertiary: string    // 三级文字
    muted: string       // 弱化文字
  }

  // 品牌色/主题色
  brand: {
    from: string        // 渐变起始
    to: string          // 渐变结束
    solid: string       // 纯色
    light: string       // 浅色背景
  }

  // 交互色
  interactive: {
    hover: string       // hover背景
    active: string      // active状态
  }
}

export interface Theme {
  mode: ThemeMode
  colors: ThemeColors
}
