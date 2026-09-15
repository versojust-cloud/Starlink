'use client'

import { useState } from 'react'
import {
    ArrowRight,
    Layout,
    Save,
    Sparkles,
    Type,
    Underline,
    Bold,
    Italic
} from 'lucide-react'
import { MOCK_TRANSLATION_CONTENT } from './mock-data'

export function TranslationView() {
    const [isTranslating, setIsTranslating] = useState(false)
    const [hasTranslated, setHasTranslated] = useState(false)

    const handleTranslate = () => {
        setIsTranslating(true)
        // Simulate API call
        setTimeout(() => {
            setIsTranslating(false)
            setHasTranslated(true)
        }, 1500)
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header Toolbar */}
            <div className="border-b border-slate-200 bg-white px-6 py-3">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-slate-900">Document Translation</h2>
                        <span className="text-sm text-slate-500">Interpret multi-language policy and market materials with ease.</span>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                            <span>English (Auto-detected)</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                            <span>Simplified Chinese</span>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                            <Layout className="h-4 w-4" />
                            <span>Marketing Casual</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                            <Save className="h-4 w-4" />
                            Save
                        </button>
                        <button
                            onClick={handleTranslate}
                            disabled={isTranslating || hasTranslated}
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isTranslating ? (
                                <Sparkles className="h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="h-4 w-4" />
                            )}
                            {isTranslating ? 'Translating...' : hasTranslated ? 'Translated' : 'Translate'}
                        </button>
                    </div>
                </div>
            </div>

            {/* View Controls */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2">
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                    <button className="rounded bg-white px-3 py-1 text-xs font-medium text-slate-900 shadow-sm">Side-by-Side</button>
                    <button className="rounded px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-900">Flip Card</button>
                    <button className="rounded px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-900">Single View</button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Synchronized Scrolling</span>
                        <div className="relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full bg-blue-600 transition-colors">
                            <span className="translate-x-5 inline-block h-3 w-3 transform rounded-full bg-white transition-transform" />
                        </div>
                    </div>
                    <div className="h-4 w-px bg-slate-200" />
                    <div className="flex items-center gap-2 text-slate-400">
                        <Bold className="h-4 w-4 cursor-pointer hover:text-slate-600" />
                        <Italic className="h-4 w-4 cursor-pointer hover:text-slate-600" />
                        <Underline className="h-4 w-4 cursor-pointer hover:text-slate-600" />
                        <Type className="h-4 w-4 cursor-pointer hover:text-slate-600" />
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex flex-1 overflow-hidden bg-slate-50">
                {/* Original Text */}
                <div className="flex-1 overflow-y-auto border-r border-slate-200 bg-white p-8">
                    <div className="mx-auto max-w-2xl">
                        <h1 className="mb-6 text-xl font-bold text-slate-900">{MOCK_TRANSLATION_CONTENT.original.title}</h1>
                        <div className="whitespace-pre-wrap text-base leading-relaxed text-slate-600">
                            {MOCK_TRANSLATION_CONTENT.original.content}
                        </div>
                    </div>
                </div>

                {/* Translated Text */}
                <div className="flex-1 overflow-y-auto bg-white p-8">
                    <div className="mx-auto max-w-2xl">
                        {hasTranslated ? (
                            <>
                                <h1 className="mb-6 text-xl font-bold text-slate-900">{MOCK_TRANSLATION_CONTENT.translation.title}</h1>
                                <div className="whitespace-pre-wrap text-base leading-relaxed text-slate-800">
                                    {MOCK_TRANSLATION_CONTENT.translation.content}
                                </div>
                            </>
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center text-slate-400">
                                <Sparkles className="mb-4 h-12 w-12 opacity-20" />
                                <p>Click &quot;Translate&quot; to generate the translation</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
