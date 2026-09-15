'use client'

import { TOKENS } from '@/features/comfy/components/canvas-design-tokens'
import { useIdeationStore, type IdeationFlowNode } from '../store/ideation-store'
import type {
  CoreIdeaNodeData,
  CustomerPainNodeData,
  EvidenceNodeData,
  HypothesisNodeData,
  IdeationNodeData,
  ReflectionNodeData,
  RevenueNodeData,
  RiskNodeData,
  ValidationChannelNodeData,
  ValueAngleNodeData
} from '../types/ideation-types'

/**
 * Per-kind metadata editors for the Inspector overlay.
 *
 * The inspector surfaces label + content for every kind (handled in
 * IdeationInspectorOverlay); this component renders the *kind-specific*
 * structured fields below those — e.g. hypothesis status, risk severity,
 * validation cost.
 *
 * Architecture: a single `<TypedFields>` dispatches to a per-kind sub-
 * component. Sub-components receive the node + a typed updater so they
 * can write back without losing field types.
 *
 * Why not generate from a schema (Zod / JSON Schema): we want hand-
 * crafted Chinese labels + per-field tooltips + per-kind ordering.
 * A schema-driven UI is great when there are 100s of types — for our
 * 9 kinds, hand-written is faster + more polished.
 */

export function TypedFields({ node }: { node: IdeationFlowNode }) {
  switch (node.data.kind) {
    case 'core-idea':
      return <CoreIdeaFields node={node as IdeationFlowNode & { data: CoreIdeaNodeData }} />
    case 'customer-pain':
      return (
        <CustomerPainFields
          node={node as IdeationFlowNode & { data: CustomerPainNodeData }}
        />
      )
    case 'value-angle':
      return (
        <ValueAngleFields
          node={node as IdeationFlowNode & { data: ValueAngleNodeData }}
        />
      )
    case 'hypothesis':
      return (
        <HypothesisFields
          node={node as IdeationFlowNode & { data: HypothesisNodeData }}
        />
      )
    case 'validation-channel':
      return (
        <ValidationChannelFields
          node={node as IdeationFlowNode & { data: ValidationChannelNodeData }}
        />
      )
    case 'revenue':
      return <RevenueFields node={node as IdeationFlowNode & { data: RevenueNodeData }} />
    case 'risk':
      return <RiskFields node={node as IdeationFlowNode & { data: RiskNodeData }} />
    case 'evidence':
      return (
        <EvidenceFields node={node as IdeationFlowNode & { data: EvidenceNodeData }} />
      )
    case 'reflection':
      return (
        <ReflectionFields
          node={node as IdeationFlowNode & { data: ReflectionNodeData }}
        />
      )
  }
}

// =============================================================================
// Shared widgets
// =============================================================================

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className={`block ${TOKENS.text.kicker} pb-1`}>
      {children}
      {hint && (
        <span className="ml-2 normal-case tracking-normal text-slate-600">· {hint}</span>
      )}
    </label>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'url'
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`block w-full ${TOKENS.surface.input} bg-slate-950/60 px-2.5 py-1.5 text-[12px] text-slate-100 outline-none placeholder:text-slate-500`}
    />
  )
}

function SegmentedSelect<T extends string>({
  value,
  options,
  onChange
}: {
  value: T | undefined
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-white/[0.06] bg-slate-950/40 p-1">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              active
                ? 'bg-cyan-400/20 text-cyan-100'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// =============================================================================
// Per-kind editors — each ~10 lines, hand-tuned labels
// =============================================================================

function useTypedUpdate<TData extends IdeationNodeData>(nodeId: string) {
  const update = useIdeationStore((s) => s.updateNodeData)
  return (patch: Partial<TData>) => update<TData>(nodeId, patch)
}

function CoreIdeaFields({
  node
}: {
  node: IdeationFlowNode & { data: CoreIdeaNodeData }
}) {
  const update = useTypedUpdate<CoreIdeaNodeData>(node.id)
  return (
    <Section>
      <FieldLabel hint="一句话的对外口号 / pitch">Pitch</FieldLabel>
      <TextInput
        value={node.data.pitch ?? ''}
        onChange={(v) => update({ pitch: v })}
        placeholder='如："AI 帮普通人做日常法律咨询"'
      />
    </Section>
  )
}

function CustomerPainFields({
  node
}: {
  node: IdeationFlowNode & { data: CustomerPainNodeData }
}) {
  const update = useTypedUpdate<CustomerPainNodeData>(node.id)
  return (
    <Section>
      <FieldLabel>频率</FieldLabel>
      <SegmentedSelect
        value={node.data.frequency}
        onChange={(v) => update({ frequency: v })}
        options={[
          { value: 'frequent', label: '频繁' },
          { value: 'occasional', label: '偶尔' },
          { value: 'rare', label: '少见' }
        ]}
      />
      <FieldLabel>强度</FieldLabel>
      <SegmentedSelect
        value={node.data.intensity}
        onChange={(v) => update({ intensity: v })}
        options={[
          { value: 'mild', label: '轻微' },
          { value: 'moderate', label: '中等' },
          { value: 'severe', label: '严重' }
        ]}
      />
    </Section>
  )
}

function ValueAngleFields({
  node
}: {
  node: IdeationFlowNode & { data: ValueAngleNodeData }
}) {
  const update = useTypedUpdate<ValueAngleNodeData>(node.id)
  return (
    <Section>
      <FieldLabel hint="一两个词点出差异化">差异化轴</FieldLabel>
      <TextInput
        value={node.data.axis ?? ''}
        onChange={(v) => update({ axis: v })}
        placeholder='如："更便宜+即时" / "更准+可解释"'
      />
    </Section>
  )
}

function HypothesisFields({
  node
}: {
  node: IdeationFlowNode & { data: HypothesisNodeData }
}) {
  const update = useTypedUpdate<HypothesisNodeData>(node.id)
  return (
    <Section>
      <FieldLabel hint="一行可证伪的具体猜想">假设陈述</FieldLabel>
      <TextInput
        value={node.data.claim ?? ''}
        onChange={(v) => update({ claim: v })}
        placeholder='如："X 用户在 Y 情境下，会愿意为 Z 付 50 元"'
      />
      <FieldLabel>状态</FieldLabel>
      <SegmentedSelect
        value={node.data.status}
        onChange={(v) => update({ status: v })}
        options={[
          { value: 'unverified', label: '未验证' },
          { value: 'in-progress', label: '验证中' },
          { value: 'verified', label: '已验证' },
          { value: 'falsified', label: '已证伪' }
        ]}
      />
    </Section>
  )
}

function ValidationChannelFields({
  node
}: {
  node: IdeationFlowNode & { data: ValidationChannelNodeData }
}) {
  const update = useTypedUpdate<ValidationChannelNodeData>(node.id)
  return (
    <Section>
      <FieldLabel>方法</FieldLabel>
      <SegmentedSelect
        value={node.data.method}
        onChange={(v) => update({ method: v })}
        options={[
          { value: 'interview', label: '访谈' },
          { value: 'landing-page', label: '落地页' },
          { value: 'mvp', label: 'MVP' },
          { value: 'desk-research', label: '桌面调研' },
          { value: 'other', label: '其他' }
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel hint="如 1 周">耗时</FieldLabel>
          <TextInput
            value={node.data.costTime ?? ''}
            onChange={(v) => update({ costTime: v })}
            placeholder="如：1 周"
          />
        </div>
        <div>
          <FieldLabel hint="如 ¥500">耗钱</FieldLabel>
          <TextInput
            value={node.data.costMoney ?? ''}
            onChange={(v) => update({ costMoney: v })}
            placeholder="如：¥500"
          />
        </div>
      </div>
    </Section>
  )
}

function RevenueFields({
  node
}: {
  node: IdeationFlowNode & { data: RevenueNodeData }
}) {
  const update = useTypedUpdate<RevenueNodeData>(node.id)
  return (
    <Section>
      <FieldLabel>商业模式</FieldLabel>
      <SegmentedSelect
        value={node.data.model}
        onChange={(v) => update({ model: v })}
        options={[
          { value: 'subscription', label: '订阅' },
          { value: 'transaction', label: '交易抽成' },
          { value: 'license', label: '授权' },
          { value: 'ads', label: '广告' },
          { value: 'service', label: '服务' },
          { value: 'other', label: '其他' }
        ]}
      />
      <FieldLabel hint="LTV / CAC / 客单价">单位经济学</FieldLabel>
      <TextInput
        value={node.data.unitEconomics ?? ''}
        onChange={(v) => update({ unitEconomics: v })}
        placeholder='如："客单价 ¥50 · LTV ¥600 · CAC ¥80"'
      />
    </Section>
  )
}

function RiskFields({ node }: { node: IdeationFlowNode & { data: RiskNodeData } }) {
  const update = useTypedUpdate<RiskNodeData>(node.id)
  return (
    <Section>
      <FieldLabel>严重程度</FieldLabel>
      <SegmentedSelect
        value={node.data.severity}
        onChange={(v) => update({ severity: v })}
        options={[
          { value: 'low', label: '低' },
          { value: 'medium', label: '中' },
          { value: 'high', label: '高' }
        ]}
      />
      <FieldLabel>类别</FieldLabel>
      <SegmentedSelect
        value={node.data.category}
        onChange={(v) => update({ category: v })}
        options={[
          { value: 'market', label: '市场' },
          { value: 'tech', label: '技术' },
          { value: 'regulatory', label: '合规' },
          { value: 'team', label: '团队' },
          { value: 'finance', label: '财务' }
        ]}
      />
    </Section>
  )
}

function EvidenceFields({
  node
}: {
  node: IdeationFlowNode & { data: EvidenceNodeData }
}) {
  const update = useTypedUpdate<EvidenceNodeData>(node.id)
  return (
    <Section>
      <FieldLabel>来源</FieldLabel>
      <SegmentedSelect
        value={node.data.source}
        onChange={(v) => update({ source: v })}
        options={[
          { value: 'interview', label: '访谈' },
          { value: 'paper', label: '文献' },
          { value: 'data', label: '数据' },
          { value: 'observation', label: '观察' },
          { value: 'web', label: '网络' },
          { value: 'other', label: '其他' }
        ]}
      />
      <FieldLabel hint="DOI / 链接 / 记录路径">引用 URL</FieldLabel>
      <TextInput
        type="url"
        value={node.data.citationUrl ?? ''}
        onChange={(v) => update({ citationUrl: v })}
        placeholder="https://..."
      />
    </Section>
  )
}

function ReflectionFields({
  node
}: {
  node: IdeationFlowNode & { data: ReflectionNodeData }
}) {
  const update = useTypedUpdate<ReflectionNodeData>(node.id)
  const acknowledged = node.data.acknowledged ?? false
  return (
    <Section>
      <FieldLabel>scaffold 类型</FieldLabel>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
        {node.data.scaffold ?? 'why'}
      </p>
      <FieldLabel hint="是否已经针对此反思采取了行动">已处理</FieldLabel>
      <button
        type="button"
        onClick={() => update({ acknowledged: !acknowledged })}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
          acknowledged
            ? 'border-emerald-400/30 bg-emerald-400/[0.10] text-emerald-200'
            : 'border-white/[0.08] bg-slate-950/40 text-slate-400 hover:text-slate-200'
        }`}
      >
        {acknowledged ? '✓ 已处理' : '标记为已处理'}
      </button>
    </Section>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2 rounded-md border border-white/[0.06] bg-slate-950/30 p-3">{children}</div>
}
