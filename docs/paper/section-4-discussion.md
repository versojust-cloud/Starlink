## 4 Discussion

### 4.1 Major Issues in Current Research

The literature reviewed above shows substantial progress in business decision support, large language model reasoning, multi-agent collaboration, knowledge augmentation, and visual analytics. However, these advances are still largely distributed across separate research streams rather than integrated into a unified analytical system. For the present topic, several major issues remain unresolved.

The first issue is the **lack of process transparency in business decision support systems**. Traditional DSS and BI platforms have become increasingly sophisticated in terms of data aggregation, reporting, and insight generation, but most of them still focus on presenting outputs rather than exposing the reasoning process through which those outputs are formed [1][2][3]. Even in explainable DSS studies, the emphasis is often placed on post hoc explanation rather than on making intermediate reasoning states visible and editable.

The second issue is the **limited reliability of large language models in vertical business scenarios**. Existing reasoning literature clearly shows that large language models can improve performance through mechanisms such as chain-of-thought prompting, self-consistency, branching search, and self-reflection [4][5][6]. Nevertheless, benchmark studies and trustworthiness surveys also show that these models still suffer from hallucination, unstable multi-step inference, weak grounding, and domain inconsistency in business and finance tasks [7][8][9].

The third issue is the **insufficient integration between multi-agent reasoning and user-facing analytical interaction**. Recent multi-agent research has made strong progress in planning, feedback, role specialization, and tool use [10][11][12][13]. However, these studies usually evaluate multi-agent systems through task completion and benchmark performance rather than through the visibility or controllability of the collaborative process. For business analysis, this is a major limitation.

The fourth issue is the **separation between knowledge grounding and interaction design**. RAG, agentic RAG, knowledge-graph-enhanced generation, and graph-based reasoning methods all strengthen factual support and structural reasoning [14][15][16][17]. Yet most of this literature remains focused on backend improvement. Much less attention is given to how evidence, graph paths, and reasoning transitions should be represented to users. For a business canvas system, this is a crucial omission.

A fifth issue concerns **evaluation insufficiency**. Existing datasets and metrics can already test correctness, grounding, and partial task performance, but they still do not adequately evaluate process visibility, canvas-level semantic alignment, or user intervention quality [18][19][20]. If a business canvas system is expected to make analytical structures visible, editable, and collaborative, then these interface-level qualities must themselves become evaluable system properties.

### 4.2 Implications for the Present Topic

These issues have direct implications for the design of a generative business canvas system based on multi-agent collaborative reasoning.

First, the system should be understood as an **integrated research problem** rather than as a combination of loosely connected technologies. The challenge lies in how multi-agent collaboration, knowledge augmentation, and canvas interaction are orchestrated around a common analytical workflow.

Second, the system should be evaluated as both a **reasoning system** and an **interaction system**. From the reasoning side, it must generate evidence-grounded and logically coherent analysis. From the interaction side, it must support visual traceability, module alignment, and user intervention.

Third, the literature suggests that **human-in-the-loop support** should be treated as a core design principle. Explainable interface studies, dashboard experiments, and industrial visual analytics work all indicate that analytical systems become more useful when users can understand the basis of system outputs and maintain oversight [3][21][22].

Fourth, the present topic is justified by the fact that the relevant literatures are already mature enough to be connected, but not yet sufficiently integrated. The research gap does not lie in the absence of component technologies, but in the lack of a coherent system-level integration of these components for business analysis.

### 4.3 Future Research Directions

Based on the above analysis, several future research directions can be identified.

The first direction is **business-oriented multi-agent role design**. Much of the current agent literature uses generic roles such as planner, executor, or critic. For business decision support, more domain-specific roles may be required, such as market analyst, financial evaluator, strategic planner, risk reviewer, and evidence verifier.

The second direction is **deeper integration of knowledge grounding with reasoning workflows**. Traditional RAG already improves factuality, but recent research on Agentic RAG and graph-based knowledge selection suggests that retrieval and knowledge use should be dynamic, selective, and task-aware [15][16][17].

The third direction is **canvas-based process evaluation**. Existing evaluation frameworks mainly focus on output correctness, faithfulness, or task completion. Future work should define more systematic metrics for spatial coherence, semantic module alignment, reasoning traceability, and editability on the canvas [18][19].

The fourth direction is **dynamic evaluation of collaborative efficiency**. Multi-agent systems should not only be measured by whether they eventually produce a correct answer, but also by how efficiently they do so. Metrics such as turn-to-consensus, disagreement resolution rate, and correction rate are therefore promising [11][12].

The fifth direction is **human-centered analytical workflows**. Future intelligent decision support systems are unlikely to be fully autonomous in high-stakes business settings. Instead, they are more likely to succeed as systems that support collaborative reasoning between humans and AI [21][22].

### 4.4 Section Summary

In summary, current research has already established a strong foundation for intelligent business analysis, but substantial gaps remain at the level of system integration, process transparency, and evaluation. Existing work is often strong in one dimension while weak in another. These unresolved issues jointly explain why a generative business canvas system remains a meaningful research topic.
