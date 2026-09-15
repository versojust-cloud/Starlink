'use client'

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import type { TimelineNode, TimelineEdge } from '../types.js'

export type ParsedTable = {
  headers: string[]
  rows: string[][]
}

export const parseCsv = (input: string): ParsedTable => {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const tokenize = (line: string) => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      if (char === '"' && line[i - 1] !== '\\') {
        inQuotes = !inQuotes
        continue
      }
      if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
        continue
      }
      current += char
    }
    if (current.length > 0) {
      result.push(current.trim())
    }
    return result
  }

  const headers = tokenize(lines[0])
  const rows = lines.slice(1).map((line) => tokenize(line))

  return {
    headers,
    rows
  }
}

const parseExcel = (file: File): Promise<ParsedTable> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })

        if (workbook.SheetNames.length === 0) {
          reject(new Error('Excel文件中没有找到工作表'))
          return
        }

        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][]

        if (jsonData.length === 0) {
          reject(new Error('Excel文件为空'))
          return
        }

        const headers = (jsonData[0] || []).map((h) => String(h))
        const rows = jsonData.slice(1).map((row) => row.map((cell) => String(cell)))

        resolve({ headers, rows })
      } catch (error) {
        reject(new Error('Excel解析失败，请确保文件格式正确'))
      }
    }
    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }
    reader.readAsArrayBuffer(file)
  })
}

const toMarkdown = ({ headers, rows }: ParsedTable) => {
  if (headers.length === 0) return ''
  const headerLine = `| ${headers.join(' | ')} |`
  const divider = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${row.map((value) => value ?? '').join(' | ')} |`).join('\n')
  return [headerLine, divider, body].filter(Boolean).join('\n')
}

const toCsv = ({ headers, rows }: ParsedTable) => {
  if (headers.length === 0) return ''
  const escape = (value: string) => {
    if (value.includes(',') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }
  const headerLine = headers.map(escape).join(',')
  const body = rows.map((row) => row.map((cell) => escape(cell ?? '')).join(',')).join('\n')
  return [headerLine, body].filter(Boolean).join('\n')
}

export type DataVisualizerProps = {
  title?: string
  description?: string
  tenantId?: string
  taskId?: string
  timeline?: TimelineNode[]
  edges?: TimelineEdge[]
  onDataExtracted?: (data: ParsedTable) => void
}

export function DataVisualizer({
  title = '社群数据可视化',
  description = '上传 CSV 或粘贴表格内容，快速生成可分享的表格视图并导出。',
  onDataExtracted
}: DataVisualizerProps): JSX.Element {
  const [rawInput, setRawInput] = useState('')
  const [table, setTable] = useState<ParsedTable>({ headers: [], rows: [] })
  const [error, setError] = useState<string | null>(null)

  const rowCount = useMemo(() => table.rows.length, [table.rows.length])

  const handleParse = (content: string) => {
    try {
      const parsed = parseCsv(content)
      setTable(parsed)
      setError(null)
      if (onDataExtracted) {
        onDataExtracted(parsed)
      }
    } catch (cause) {
      setError((cause as Error)?.message ?? '解析失败，请检查格式')
    }
  }

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 文件大小限制：5MB
    const MAX_FILE_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      setError(`文件过大（${(file.size / 1024 / 1024).toFixed(2)}MB），请上传小于5MB的文件`)
      event.target.value = ''
      return
    }

    try {
      // 判断文件类型
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('spreadsheet')

      if (isExcel) {
        // Excel文件处理
        const parsed = await parseExcel(file)
        setTable(parsed)
        setError(null)
        if (onDataExtracted) {
          onDataExtracted(parsed)
        }
        // 更新rawInput显示
        setRawInput(`[已上传Excel: ${file.name}, ${(file.size / 1024).toFixed(1)}KB]`)
      } else {
        // CSV文件处理
        const reader = new FileReader()
        reader.onload = () => {
          const text = typeof reader.result === 'string' ? reader.result : ''
          setRawInput(text)
          handleParse(text)
        }
        reader.readAsText(file, 'utf-8')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '文件解析失败')
    }

    // 清空input，允许重复上传同一文件
    event.target.value = ''
  }

  const handleAnalyzeClick = () => {
    if (!rawInput.trim()) {
      setError('请先上传文件或粘贴表格内容')
      return
    }
    handleParse(rawInput)
  }

  const handleDownload = (kind: 'csv' | 'markdown') => {
    const blob = new Blob([kind === 'csv' ? toCsv(table) : toMarkdown(table)], {
      type: kind === 'csv' ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;'
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = kind === 'csv' ? 'visualized-data.csv' : 'visualized-data.md'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="flex h-full flex-1 flex-col gap-6 overflow-hidden p-6">
      <div className="rounded-3xl border border-[#D7DBFF] bg-white/90 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] px-4 py-2 text-sm text-[#4338CA] transition hover:border-[#A5B4FC] hover:bg-[#E0E7FF]">
            上传 CSV/Excel
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>

        <textarea
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          placeholder="粘贴数据，例如：名称,数值&#10;北区,120&#10;南区,90"
          className="mt-4 h-40 w-full rounded-2xl border border-[#E0E2FF] bg-white px-4 py-3 text-sm text-slate-600 placeholder:text-slate-400 focus:border-[#A5B4FC] focus:outline-none"
        />

        {error ? (
          <p className="mt-3 rounded-xl border border-[#F87171] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">{error}</p>
        ) : (
          <p className="mt-3 text-xs text-slate-400">支持 CSV 和 Excel (.xlsx, .xls) 上传或粘贴，使用半角逗号分隔列。</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleAnalyzeClick}
            className="rounded-xl bg-gradient-to-r from-[#7F5BFA] to-[#6350E8] px-4 py-2 text-sm font-medium text-white shadow-md hover:from-[#6F4EE5] hover:to-[#5645D7]"
          >
            解析内容并可视化
          </button>
          <button
            type="button"
            onClick={() => {
              const exampleData = '产品,销量,增长率\n手机,250,15%\n电脑,180,8%\n平板,120,-5%\n耳机,95,22%\n手表,65,30%'
              setRawInput(exampleData)
              handleParse(exampleData)
            }}
            className="rounded-xl border-2 border-[#7F5BFA] bg-white px-4 py-2 text-sm font-medium text-[#7F5BFA] transition hover:bg-[#F8F9FF]"
          >
            加载示例数据
          </button>
          <button
            type="button"
            disabled={rowCount === 0}
            onClick={() => handleDownload('csv')}
            className={clsx(
              'rounded-xl border border-[#D7DBFF] px-4 py-2 text-sm text-slate-600 transition',
              rowCount === 0 ? 'cursor-not-allowed opacity-50' : 'hover:bg-[#EEF0FF]'
            )}
          >
            下载 CSV
          </button>
          <button
            type="button"
            disabled={rowCount === 0}
            onClick={() => handleDownload('markdown')}
            className={clsx(
              'rounded-xl border border-[#D7DBFF] px-4 py-2 text-sm text-slate-600 transition',
              rowCount === 0 ? 'cursor-not-allowed opacity-50' : 'hover:bg-[#EEF0FF]'
            )}
          >
            下载 Markdown
          </button>
          <button
            type="button"
            onClick={() => {
              setRawInput('')
              setTable({ headers: [], rows: [] })
              setError(null)
            }}
            className="rounded-xl border border-[#D7DBFF] px-4 py-2 text-sm text-slate-500 transition hover:bg-white"
          >
            清空
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-[#D7DBFF] bg-white/85 shadow-inner">
        <div className="flex items-center justify-between border-b border-[#E3E6FF] px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">数据预览</h3>
            <p className="text-xs text-slate-500">
              {rowCount > 0 ? `共 ${rowCount} 行 · ${table.headers.length} 列` : '等待上传或粘贴数据'}
            </p>
          </div>
          {rowCount > 0 && (
            <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs text-[#4338CA]">预览最新</span>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {rowCount === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-slate-400">
              暂无数据，上传文件或粘贴内容即可自动生成表格视图。
            </div>
          ) : (
            <table className="min-w-full border-separate border-spacing-0 text-sm text-slate-700">
              <thead className="sticky top-0 bg-[#F5F6FF]">
                <tr>
                  {table.headers.map((header: string) => (
                    <th key={header} className="border-b border-[#E3E6FF] px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      {header || '-'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row: string[], rowIndex: number) => (
                  <tr key={`row-${rowIndex}`} className="odd:bg-white even:bg-[#F9FAFF]">
                    {table.headers.map((_: string, columnIndex: number) => (
                      <td key={`row-${rowIndex}-col-${columnIndex}`} className="border-b border-[#EEF0FF] px-4 py-2 text-xs text-slate-600">
                        {row[columnIndex] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
