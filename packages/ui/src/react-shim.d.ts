declare module 'react' {
  export const useMemo: <T>(factory: () => T, deps: unknown[]) => T
  export const useState: <T>(initial: T) => [T, (value: T) => void]
  export type FC<P = Record<string, unknown>> = (props: P) => any
  const React: {
    useMemo: typeof useMemo
    useState: typeof useState
  }
  export default React
}

declare module 'react/jsx-runtime' {
  export const jsx: any
  export const jsxs: any
  export const Fragment: any
  const defaultExport: {
    jsx: typeof jsx
    jsxs: typeof jsxs
    Fragment: typeof Fragment
  }
  export default defaultExport
}

declare module 'react-dom' {
  const ReactDOM: any
  export default ReactDOM
}
