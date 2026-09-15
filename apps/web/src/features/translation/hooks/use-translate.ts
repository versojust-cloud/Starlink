import { useCallback, useMemo, useState } from 'react'
import { translateText, type TranslatePayload, type TranslateResponse } from '@/shared/lib/api/translate'

export function useTranslate(initialText = '', initialTargetLanguage = 'en') {
  const [text, setText] = useState(initialText)
  const [targetLanguage, setTargetLanguage] = useState(initialTargetLanguage)
  const [result, setResult] = useState<TranslateResponse | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => text.trim().length > 0 && !isTranslating, [text, isTranslating])

  const translate = useCallback(async () => {
    if (!text.trim()) {
      setError('请输入要翻译的文本')
      return
    }

    setIsTranslating(true)
    setError(null)

    try {
      const payload: TranslatePayload = {
        text: text.trim(),
        targetLanguage
      }
      const response = await translateText(payload)
      setResult(response)
    } catch (err) {
      const message = err instanceof Error ? err.message : '翻译失败，请稍后重试'
      setError(message)
    } finally {
      setIsTranslating(false)
    }
  }, [targetLanguage, text])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    text,
    setText,
    targetLanguage,
    setTargetLanguage,
    result,
    isTranslating,
    error,
    canSubmit,
    translate,
    reset
  }
}
