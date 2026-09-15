/**
 * Hand-authored ground-truth personas for the coaching-mode benchmark
 * (2026-04-28; expanded 2026-05-11 to 5 personas × 5 workspaces for stress test).
 *
 * Each persona declares the durable traits we EXPECT the UserSkillExtractor
 * to surface from synthetic conversation summaries. After running the
 * extractor, we score `recall` (each GT trait found at least one matching
 * skill row) and `precision` (each extracted skill maps to at least one
 * GT trait, no fabrications).
 *
 * Persona traits are written in 中文 to match what the extractor LLM will
 * produce. Each trait carries `keywords` used for keyword-based recall
 * scoring (cheap fallback alongside vector cosine).
 */

export interface PersonaTrait {
  /** Stable id used in the report; not seen by the LLM. */
  id: string
  /** Trait category — should map to a UserSkillPayload tag. */
  category: 'domain' | 'experience' | 'style' | 'blind-spot' | 'constraint' | 'preference'
  /** Short label for the report. */
  label: string
  /** Full description of the trait — what we expect the extractor to write. */
  description: string
  /** Words/phrases that should appear in a correctly-extracted skill's
   *  `content` field. Used for the lexical recall heuristic. */
  keywords: string[]
}

export interface BenchmarkPersona {
  id: string
  name: string
  /** One-paragraph summary of who this person is, used as the system prompt
   *  for the user-simulator (synthetic-summaries.ts). */
  bio: string
  traits: PersonaTrait[]
  /** Pretend ideas this user has worked on — drives the synthetic summary
   *  generation (each summary is set in one of these workspaces). */
  ideaWorkspaces: Array<{ workspaceId: string; ideaName: string; ideaPitch: string }>
}

export const personaB2BSaasPM: BenchmarkPersona = {
  id: 'persona-b2b-saas-pm',
  name: 'B2B SaaS PM',
  bio: '一位 5 年 B2B SaaS PM 出身的创业者，做过分销渠道管理 + 客户成功体系。'
    + '说话偏好引用具体数字和 case study，对抽象框架（如蓝图、心智模型）反应冷淡。'
    + '单创独立，明确表示不打算融资。在思考时倾向跳过定价与商业模式细节，'
    + '常陷入产品功能讨论。',
  traits: [
    {
      id: 'trait-b2b-domain',
      category: 'domain',
      label: 'B2B SaaS 资深背景',
      description: '5 年 B2B SaaS PM 经验，熟悉分销和客户成功',
      keywords: ['B2B', 'SaaS', 'PM', '产品经理', '分销', '客户成功']
    },
    {
      id: 'trait-style-concrete',
      category: 'style',
      label: '偏好具体数字',
      description: '更喜欢具体数字、case study、客户访谈摘录；不耐烦抽象概念',
      keywords: ['数字', '具体', 'case', '案例', '不抽象', '不爱框架']
    },
    {
      id: 'trait-blindspot-pricing',
      category: 'blind-spot',
      label: '回避定价讨论',
      description: '在产品讨论中很少主动谈定价或收入模型；需要 coach 主动追问',
      keywords: ['定价', '收入', '商业模式', '回避', '不谈']
    },
    {
      id: 'trait-constraint-solo',
      category: 'constraint',
      label: '单创不融资',
      description: '明确表态自己单干创业，不打算外部融资；偏好 lean / bootstrap',
      keywords: ['单创', '不融资', 'bootstrap', '独立', 'lean']
    }
  ],
  ideaWorkspaces: [
    {
      workspaceId: 'ws-coach-eval-saaspm-001',
      ideaName: 'AI 销售助手',
      ideaPitch: '帮 B2B 销售人员自动整理客户对话记录 + 生成跟进 talking points'
    },
    {
      workspaceId: 'ws-coach-eval-saaspm-002',
      ideaName: '客户成功仪表盘',
      ideaPitch: '给中型 SaaS 公司提供客户健康度 + 流失风险预警的轻量工具'
    },
    {
      workspaceId: 'ws-coach-eval-saaspm-003',
      ideaName: '分销商 portal',
      ideaPitch: 'B2B SaaS 公司用来管理分销伙伴 + 分账 + leads 共享的 SaaS'
    },
    {
      workspaceId: 'ws-coach-eval-saaspm-004',
      ideaName: 'NPS 自动化平台',
      ideaPitch: '把 B2B SaaS 客户的 NPS 调研 + 跟进流程做成自动化触达 SaaS'
    },
    {
      workspaceId: 'ws-coach-eval-saaspm-005',
      ideaName: 'Onboarding 检查清单',
      ideaPitch: '帮中型 SaaS 公司客户成功团队跟踪新客户激活步骤的轻量工具'
    }
  ]
}

export const personaIndieHardware: BenchmarkPersona = {
  id: 'persona-indie-hardware',
  name: 'Indie Hardware Hacker',
  bio: '一位嵌入式硬件 + 3D 打印背景的兼职创业者。说话喜欢长条解释 + 画原理图，'
    + '习惯先想技术实现再想用户。对客户访谈、调研薄弱，常假设市场需求。'
    + '全职业余，月度预算 ≤ ¥3000，不打算辞职。',
  traits: [
    {
      id: 'trait-hw-domain',
      category: 'domain',
      label: '嵌入式 + 3D 打印背景',
      description: '深厚的嵌入式硬件 + 3D 打印工程经验',
      keywords: ['嵌入式', '硬件', '3D 打印', 'embedded', 'firmware']
    },
    {
      id: 'trait-style-tech-first',
      category: 'style',
      label: '技术优先思维',
      description: '先想技术实现 + 原理图，再想用户场景',
      keywords: ['技术先行', '原理图', '实现', '工程', 'tech-first']
    },
    {
      id: 'trait-blindspot-research',
      category: 'blind-spot',
      label: '客户调研薄弱',
      description: '很少做用户访谈/市场调研，常假设需求；coach 应主动推动 evidence-needed',
      keywords: ['不调研', '假设', '没访谈', '凭直觉']
    },
    {
      id: 'trait-constraint-budget',
      category: 'constraint',
      label: '业余 + 极低预算',
      description: '全职工作之外业余做，月度预算 ≤ ¥3000',
      keywords: ['业余', '兼职', '低预算', '不辞职', '钱少']
    }
  ],
  ideaWorkspaces: [
    {
      workspaceId: 'ws-coach-eval-hw-001',
      ideaName: '低成本环境监测仪',
      ideaPitch: 'ESP32 + 3D 打印外壳的家用 PM2.5 / VOC 监测设备'
    },
    {
      workspaceId: 'ws-coach-eval-hw-002',
      ideaName: '宠物喂食器',
      ideaPitch: '可远程定时的猫狗自动喂食器，重点是 BOM 控制在 100 元以内'
    },
    {
      workspaceId: 'ws-coach-eval-hw-003',
      ideaName: '3D 打印工具盒',
      ideaPitch: '为 maker 社区设计的可定制工具收纳盒生成器（参数化模型 + 在线下载）'
    },
    {
      workspaceId: 'ws-coach-eval-hw-004',
      ideaName: 'DIY 智能灌溉控制器',
      ideaPitch: 'ESP8266 + 土壤湿度传感器的阳台园艺自动浇水模块'
    },
    {
      workspaceId: 'ws-coach-eval-hw-005',
      ideaName: 'NFC 钥匙扣门禁',
      ideaPitch: '小公司用的 NFC 门禁系统，硬件 + 简单管理后台'
    }
  ]
}

export const personaConsumerBrand: BenchmarkPersona = {
  id: 'persona-consumer-brand',
  name: 'Consumer Brand Founder',
  bio: '一位有 8 年快消 + 美妆品牌运营经验的创始人，做过两个 to-C 品牌。'
    + '说话偏好讲故事、用感性语言描述用户场景，对量化指标（CAC、LTV）反应慢。'
    + '坚信品牌叙事是护城河，倾向把所有问题归结为"品牌不够强"。'
    + '已有外部投资人对接，明确希望融资。',
  traits: [
    {
      id: 'trait-consumer-domain',
      category: 'domain',
      label: '快消 / 美妆品牌经验',
      description: '8 年 to-C 品牌运营 + 渠道经验，熟悉电商 + 线下铺货',
      keywords: ['品牌', '快消', '美妆', 'to-C', '电商', '渠道']
    },
    {
      id: 'trait-style-narrative',
      category: 'style',
      label: '故事化叙述',
      description: '喜欢用故事 + 感性语言描述用户场景，不爱数据驱动框架',
      keywords: ['故事', '叙事', '感性', '场景', '不爱数据']
    },
    {
      id: 'trait-blindspot-unit-econ',
      category: 'blind-spot',
      label: '忽视单位经济',
      description: '回避 CAC / LTV / 毛利 等量化拷问；归因到"品牌不够强"',
      keywords: ['CAC', 'LTV', '单位经济', '毛利', '回避数据']
    },
    {
      id: 'trait-constraint-funding',
      category: 'constraint',
      label: '主动寻求融资',
      description: '明确希望融资扩张，已对接投资人；策略要适配融资节奏',
      keywords: ['融资', '投资人', '估值', '扩张', '天使轮']
    }
  ],
  ideaWorkspaces: [
    {
      workspaceId: 'ws-coach-eval-brand-001',
      ideaName: '小众香水品牌',
      ideaPitch: '主打"东方调"的小众沙龙香水，DTC 电商 + 限量发售'
    },
    {
      workspaceId: 'ws-coach-eval-brand-002',
      ideaName: '功效护肤胶囊',
      ideaPitch: '单次精华胶囊形态的轻奢护肤品，主打都市白领便携场景'
    },
    {
      workspaceId: 'ws-coach-eval-brand-003',
      ideaName: '宠物精品零食',
      ideaPitch: '高端宠物零食 DTC 品牌，主打成分透明 + 包装设计感'
    },
    {
      workspaceId: 'ws-coach-eval-brand-004',
      ideaName: '可持续家清品牌',
      ideaPitch: '主打可补充装 + 环保叙事的家用清洁剂品牌'
    },
    {
      workspaceId: 'ws-coach-eval-brand-005',
      ideaName: '健康茶饮订阅',
      ideaPitch: '月订阅模式的功能性花草茶包，主打都市女性场景化叙事'
    }
  ]
}

export const personaAcademicResearcher: BenchmarkPersona = {
  id: 'persona-academic-researcher',
  name: 'Academic Researcher',
  bio: '一位在某 985 高校做 NLP 方向的青年教师，发过 ACL / EMNLP，最近想把'
    + '论文里的方法工程化。说话喜欢精确定义术语 + 引文献，反感粗略说法。'
    + '严重低估 go-to-market 难度，认为"算法好用户就会来"。'
    + '只有横向经费可用，月度可投入 ≤ ¥10000，不能全职。',
  traits: [
    {
      id: 'trait-academic-domain',
      category: 'domain',
      label: 'NLP 学术背景',
      description: 'NLP 研究员，发表过 ACL/EMNLP，深谙模型与算法',
      keywords: ['NLP', 'ACL', 'EMNLP', '论文', '算法', '研究']
    },
    {
      id: 'trait-style-academic',
      category: 'style',
      label: '术语精确 + 引文献',
      description: '说话要求精确定义，常引用文献，反感 hand-wavy 解释',
      keywords: ['术语', '定义', '文献', '严谨', '精确']
    },
    {
      id: 'trait-blindspot-gtm',
      category: 'blind-spot',
      label: '低估 GTM 难度',
      description: '默认"算法好用户就来"，不重视渠道 / 销售 / 品牌',
      keywords: ['GTM', '获客', '销售', '渠道', '"酒香不怕巷子深"']
    },
    {
      id: 'trait-constraint-parttime',
      category: 'constraint',
      label: '横向经费 + 兼职',
      description: '只有横向经费可用，月度 ≤ ¥10000，不能离开高校',
      keywords: ['横向', '经费', '兼职', '不离职', '高校']
    }
  ],
  ideaWorkspaces: [
    {
      workspaceId: 'ws-coach-eval-acad-001',
      ideaName: '法律文书摘要工具',
      ideaPitch: '基于 LLM 的法律文书自动摘要 + 关键条款抽取工具，面向律所'
    },
    {
      workspaceId: 'ws-coach-eval-acad-002',
      ideaName: '中文学术翻译',
      ideaPitch: '面向博士生的中英学术论文翻译辅助工具，强调术语一致性'
    },
    {
      workspaceId: 'ws-coach-eval-acad-003',
      ideaName: '科研文献 RAG',
      ideaPitch: '为科研人员构建私域文献 RAG 系统，支持精准引用与对比'
    },
    {
      workspaceId: 'ws-coach-eval-acad-004',
      ideaName: '医学问答助手',
      ideaPitch: '基于专业医学语料的医生辅助问答工具，强调可解释引文'
    },
    {
      workspaceId: 'ws-coach-eval-acad-005',
      ideaName: '中文教学评估',
      ideaPitch: '面向 K12 教师的中文作文自动评分 + 反馈生成工具'
    }
  ]
}

export const personaServiceFreelancer: BenchmarkPersona = {
  id: 'persona-service-freelancer',
  name: 'Agency Freelancer',
  bio: '一位独立设计 / 营销 freelancer，做了 6 年甲方项目，想把外包业务'
    + '产品化。说话简短直接、commercial-first，看重短期现金流。'
    + '严重忽视技术可行性 / 工程债，反感"先打磨产品再卖"的论调。'
    + '只有 1 人，月度营收必须 ≥ ¥20000 才能持续。',
  traits: [
    {
      id: 'trait-freelancer-domain',
      category: 'domain',
      label: 'Agency / 外包经验',
      description: '6 年设计 + 营销 freelancer，熟悉外包接单 + 甲方沟通',
      keywords: ['freelancer', '外包', '设计', '营销', '甲方', '接单']
    },
    {
      id: 'trait-style-commercial',
      category: 'style',
      label: '现金流优先',
      description: '说话直接、commercial-first，看重短期收入，对长期投资回报不敏感',
      keywords: ['现金流', '短期', '快收钱', 'commercial', '直接']
    },
    {
      id: 'trait-blindspot-tech',
      category: 'blind-spot',
      label: '忽视技术债',
      description: '默认"先卖了再说"，技术可行性 / 工程债不在视野',
      keywords: ['技术债', '工程', '不懂技术', '反感打磨', '先卖再说']
    },
    {
      id: 'trait-constraint-monthly',
      category: 'constraint',
      label: '月度现金流硬约束',
      description: '1 人 freelancer，月度营收 ≥ ¥20000 才可持续，无缓冲',
      keywords: ['月度营收', '一个人', '无积蓄', '现金流硬约束', '¥20000']
    }
  ],
  ideaWorkspaces: [
    {
      workspaceId: 'ws-coach-eval-svc-001',
      ideaName: '小红书代运营套餐',
      ideaPitch: '把现有甲方小红书代运营经验产品化成"基础套餐 / 增值套餐"'
    },
    {
      workspaceId: 'ws-coach-eval-svc-002',
      ideaName: 'LOGO 设计 SaaS',
      ideaPitch: '在线生成创业公司 LOGO 的轻量工具，订阅或一次买断'
    },
    {
      workspaceId: 'ws-coach-eval-svc-003',
      ideaName: '甲方 brief 模板',
      ideaPitch: '把设计师跟甲方沟通的 brief 流程做成模板包售卖'
    },
    {
      workspaceId: 'ws-coach-eval-svc-004',
      ideaName: 'Notion 营销模板',
      ideaPitch: '面向小团队的 Notion 营销 SOP 模板包，付费下载'
    },
    {
      workspaceId: 'ws-coach-eval-svc-005',
      ideaName: '出海素材产线',
      ideaPitch: '帮跨境电商小卖家批量生产广告素材的外包 + 模板服务'
    }
  ]
}

export const ALL_PERSONAS: BenchmarkPersona[] = [
  personaB2BSaasPM,
  personaIndieHardware,
  personaConsumerBrand,
  personaAcademicResearcher,
  personaServiceFreelancer
]
