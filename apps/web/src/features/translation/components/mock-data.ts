export const MOCK_DOCUMENTS = [
    {
        id: 'doc-1',
        name: 'policy_brief_final.docx',
        size: '4.2 MB',
        status: 'uploading',
        progress: 65,
        type: 'docx'
    },
    {
        id: 'doc-2',
        name: 'market-analysis-q3.pdf',
        size: '2.8 MB',
        status: 'processing',
        progress: 100,
        type: 'pdf'
    },
    {
        id: 'doc-3',
        name: 'project-readme-documentation-final-v2.md',
        size: '15 KB',
        status: 'ready',
        progress: 100,
        type: 'md'
    }
]

export const MOCK_TRANSLATION_CONTENT = {
    original: {
        title: 'Global Market Entry Strategy',
        content: `Our primary objective is to establish a significant presence in the Asia-Pacific (APAC) region within the next three fiscal years. This initiative requires a nuanced understanding of local consumer behavior, regulatory landscapes, and competitive dynamics. The marketing materials must be culturally adapted, not merely translated, to resonate with target audiences in key markets such as Japan, South Korea, and Singapore.

We will employ a phased rollout approach. Phase one will focus on digital marketing campaigns and establishing partnerships with local influencers and distributors. Policy compliance is paramount; all promotional content must adhere strictly to local advertising standards and data privacy regulations, including GDPR equivalents where applicable.

Business Canvas Analysis
Value Propositions: Tailor our core value proposition to address specific pain points prevalent in each target market.
Customer Segments: Identify and segment customers based on psychographics and digital behavior, moving beyond simple demographics.
Key Activities: Content localization, supply chain optimization, and regulatory affairs management.`
    },
    translation: {
        title: '全球市场进入策略',
        content: `我们的主要目标是在未来三个财年内在亚太（APAC）地区建立重要影响力。此举需要对当地消费者行为、监管环境和竞争动态有细致的理解。营销材料必须进行文化调适，而不仅仅是翻译，以便与日本、韩国和新加坡等关键市场的目标受众产生共鸣。

我们将采用分阶段推广的方法。第一阶段将侧重于数字营销活动，并与当地影响者和分销商建立合作伙伴关系。政策合规至关重要；所有宣传内容必须严格遵守当地的广告标准和数据隐私法规，包括适用的GDPR等效法规。这是用户编辑过的内容。

商业画布分析
价值主张：调整我们的核心价值主张，以解决每个目标市场普遍存在的特定痛点。
客户细分：根据心理特征和数字行为来识别和细分客户，超越简单的人口统计。
关键活动：内容本地化、供应链优化和法规事务管理。`
    }
}
