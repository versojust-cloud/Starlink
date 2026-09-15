'use client'

import { useState } from 'react'
import { UploadCloud, FileText, File, CheckCircle2, Loader2, X } from 'lucide-react'
import { MOCK_DOCUMENTS } from './mock-data'

interface UploadViewProps {
    onFileSelect: (fileId: string) => void
}

export function UploadView({ onFileSelect }: UploadViewProps) {
    const [isDragging, setIsDragging] = useState(false)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        // In a real app, handle file upload here
    }

    return (
        <div className="flex h-full flex-col p-8">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900">Upload & Format Recognition</h2>
                <p className="text-slate-500">Upload a document to begin interpretation and analysis.</p>
            </div>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`mb-8 flex h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${isDragging
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
            >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <UploadCloud className="h-6 w-6 text-slate-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">Drag & Drop Your File Here</h3>
                <p className="mb-6 text-sm text-slate-500">
                    Supported formats: PDF, DOCX, MD. Maximum file size: 50MB.
                </p>
                <button className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
                    Browse Files
                </button>
            </div>

            <div>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Uploaded Files</h3>
                <div className="space-y-3">
                    {MOCK_DOCUMENTS.map((doc) => (
                        <div
                            key={doc.id}
                            onClick={() => doc.status === 'ready' && onFileSelect(doc.id)}
                            className={`group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all ${doc.status === 'ready' ? 'cursor-pointer hover:border-blue-200 hover:shadow-sm' : ''
                                }`}
                        >
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${doc.type === 'pdf' ? 'bg-red-50 text-red-500' :
                                    doc.type === 'docx' ? 'bg-blue-50 text-blue-500' :
                                        'bg-emerald-50 text-emerald-500'
                                }`}>
                                {doc.type === 'pdf' ? <FileText className="h-5 w-5" /> : <File className="h-5 w-5" />}
                            </div>

                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium text-slate-900">{doc.name}</span>
                                    <div className="flex items-center gap-3">
                                        {doc.status === 'uploading' && (
                                            <span className="text-sm font-medium text-slate-900">{doc.progress}%</span>
                                        )}
                                        <button className="text-slate-400 hover:text-slate-600">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                {doc.status === 'uploading' ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500">Uploading... ({doc.size})</span>
                                        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                                            <div
                                                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                                                style={{ width: `${doc.progress}%` }}
                                            />
                                        </div>
                                    </div>
                                ) : doc.status === 'processing' ? (
                                    <div className="flex items-center gap-2 text-xs text-blue-600">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Recognizing format...
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-xs text-emerald-600">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Ready for analysis
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
