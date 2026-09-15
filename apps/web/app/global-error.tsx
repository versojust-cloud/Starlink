'use client'

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">应用发生错误</h1>
          <p className="text-gray-600 mb-6">
            {error.message || '发生了意外错误，请重试。'}
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 mb-4">错误代码: {error.digest}</p>
          )}
          <button
            onClick={reset}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  )
}
