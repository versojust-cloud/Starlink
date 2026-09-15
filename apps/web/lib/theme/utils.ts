/**
 * 将theme对象转换为可用的className字符串
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * 从bg-xxx转换为text-xxx
 */
export function bgToText(bgClass: string): string {
  return bgClass.replace('bg-', 'text-')
}

/**
 * 从bg-xxx转换为border-xxx
 */
export function bgToBorder(bgClass: string): string {
  return bgClass.replace('bg-', 'border-')
}

/**
 * 从border-xxx转换为bg-xxx
 */
export function borderToBg(borderClass: string): string {
  return borderClass.replace('border-', 'bg-')
}
