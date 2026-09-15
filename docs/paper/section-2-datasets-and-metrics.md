## 2 Datasets and Evaluation Metrics

### 2.1 Datasets and Benchmarks

In the study of generative business decision support systems, datasets and benchmarks determine whether a model is genuinely capable of business reasoning rather than only fluent text generation. Unlike traditional recommendation or general question-answering tasks, there is still no unified benchmark specifically designed for a generative business canvas system that simultaneously evaluates collaborative reasoning, knowledge grounding, process transparency, visual structuring, and user intervention. Therefore, current research usually combines business-oriented reasoning benchmarks, financial question-answering datasets, business intelligence benchmarks, and manually constructed business cases [1][2][3][4].

Among existing resources, **BizBench** is particularly useful because it evaluates quantitative reasoning in business and finance scenarios [1]. Its importance lies in showing that business analysis is not purely a language task. Many items require the model to interpret tables, extract intermediate values, understand formulas, and complete multi-step calculations. In this sense, BizBench captures the mixed nature of business reasoning, in which textual understanding, numerical inference, and domain knowledge are tightly coupled [1].

**FinanceBench** complements this perspective by focusing on evidence-grounded financial question answering [2]. Built on company filings and expert-supported evidence annotations, it evaluates not only whether a system can answer correctly, but also whether the answer can be traced to the source document. This is highly relevant to business decision support because many practical tasks rely on annual reports, SEC filings, and other formal disclosures. In such scenarios, unsupported but fluent answers are of limited value [2][7].

Compared with FinanceBench, **FinanceReasoning** gives greater weight to numerical inference and multi-step calculation [3]. This is important because many business tasks involve ratio analysis, trend estimation, cost comparison, and profitability evaluation rather than simple retrieval. From this perspective, FinanceReasoning better reflects the analytical depth required in realistic business support systems [3].

For business intelligence scenarios, **BI-Bench** offers another perspective [4]. Unlike pure QA datasets, it evaluates whether systems can generate meaningful business insights for descriptive, diagnostic, predictive, and prescriptive analytical tasks. This is significant because business users are usually more concerned with the relevance, depth, and usefulness of analytical outputs than with exact matching of short answers. In this sense, BI-Bench marks a shift from answer-centric evaluation toward insight-centric evaluation [4].

Broader suites such as **FinBen** further reflect a trend toward multi-task financial evaluation [5]. Instead of measuring only one capability, they combine QA, reasoning, and document understanding. This is relevant because a generative business canvas system is expected to support heterogeneous analytical tasks rather than one narrow benchmark category [5].

Despite these advances, current datasets remain fragmented. Most benchmarks focus on one aspect only, such as factual QA, numerical reasoning, BI insight generation, or document interpretation [1][2][3][4][5]. Very few directly evaluate a system as an integrated analytical workspace in which multiple agents collaborate, external knowledge is dynamically incorporated, and reasoning is visually represented for user intervention. For this reason, many studies supplement public benchmarks with self-constructed business case collections based on annual reports, market news, company profiles, product descriptions, industry analyses, and strategic planning materials [1][4][16][17].

Overall, current datasets are sufficient for evaluating business-oriented reasoning, financial QA, and business intelligence outputs at a partial level, but they are still insufficient for directly assessing a generative business canvas system as a transparent, interactive, and collaborative decision support environment [4][16][17].

### 2.2 Evaluation Metrics

The evaluation of a generative business canvas system should not rely on a single metric. Since this type of system integrates large language model reasoning, multi-agent collaboration, knowledge grounding, and visual interaction, a complete framework should include correctness metrics, grounding metrics, collaboration metrics, canvas-oriented metrics, human-centered metrics, and efficiency metrics [6][8][9].

For benchmark-style reasoning tasks, the most common automatic metrics are **Accuracy**, **Exact Match (EM)**, and **F1 Score** [2][3][6]. Accuracy can be written as:

\[
\mathrm{Accuracy} = \frac{N_{\mathrm{correct}}}{N_{\mathrm{total}}}
\]

where \(N_{\mathrm{correct}}\) denotes the number of correct predictions and \(N_{\mathrm{total}}\) denotes the total number of evaluated samples. These metrics are useful for measuring output correctness, but they mainly focus on the final answer rather than the reasoning process behind it.

Because business decision support requires evidence-based conclusions, correctness metrics should be complemented by **grounding-related metrics**, including grounding accuracy, evidence support rate, faithfulness, and hallucination rate [2][7][8]. Grounding accuracy measures whether the generated analysis is supported by retrieved documents or structured external knowledge. Evidence support rate evaluates how much of the output can be traced to verifiable evidence, while faithfulness measures whether the conclusion remains consistent with that evidence. Hallucination rate is especially important because a fluent but weakly grounded response may still be analytically misleading in business scenarios [7][8].

For multi-agent systems, a useful metric is **Task Success Rate**, which measures whether a complete task is solved successfully:

\[
\mathrm{Task\ Success\ Rate} = \frac{N_{\mathrm{success}}}{N_{\mathrm{tasks}}}
\]

where \(N_{\mathrm{success}}\) is the number of successfully completed tasks and \(N_{\mathrm{tasks}}\) is the total number of evaluated tasks. Another useful static metric is **Consistency**:

\[
\mathrm{Consistency} = \frac{1}{n}\sum_{i=1}^{n} I\left(y_i = y^{*}\right)
\]

where \(y_i\) denotes the output of the \(i\)-th agent and \(y^{*}\) denotes the final agreed conclusion. Consistency is useful because it reflects whether multiple agents converge toward a coherent result [9][11]. However, it remains a static indicator and says little about the efficiency of collaboration.

To address this limitation, **dynamic collaboration metrics** should also be considered [9][10][11][12]. One example is **Turn-to-Consensus**, which measures how many interaction rounds agents need, on average, to reach a stable conclusion:

\[
\mathrm{Turn\text{-}to\text{-}Consensus} = \frac{1}{M}\sum_{i=1}^{M} T_i
\]

where \(T_i\) denotes the number of interaction rounds required in task \(i\). Another is **Correction Rate**, which measures how many initially weak or incorrect conclusions are revised during collaboration:

\[
\mathrm{Correction\ Rate} = \frac{N_{\mathrm{corrected}}}{N_{\mathrm{errors}}}
\]

These metrics better capture whether collaboration actually improves analytical efficiency and reliability.

Since the proposed system is a **business canvas system**, evaluation must also include metrics related to the quality of the canvas itself [13][14][15][16][17]. One criterion is **Spatial Coherence**, which concerns whether nodes and relations are arranged in a clear and interpretable way. Another is **Module Alignment**, which evaluates whether business modules are logically connected in a meaningful manner. A simplified form can be written as:

\[
\mathrm{Canvas\ Alignment} = \frac{N_{\mathrm{aligned}}}{N_{\mathrm{relations}}}
\]

where \(N_{\mathrm{aligned}}\) denotes the number of logically valid inter-module relations. A third criterion is **Visual Readability**, which may be viewed as a function of edge crossings, node overlap, and distribution balance:

\[
\mathrm{Visual\ Readability} = f(C, O, D)
\]

These metrics imply that the canvas is not merely a visual wrapper. Its spatial organization, semantic alignment, and reasoning traceability are part of the analytical effectiveness of the system itself.

In addition, **human-centered metrics** remain essential. Recent studies increasingly emphasize usefulness, interpretability, transparency, controllability, and user trust as key dimensions of evaluation [13][14][15]. This is especially important in decision support, where the goal is not simply to automate analysis, but to support human-AI collaborative reasoning.

Finally, practical systems should also be evaluated in terms of **latency**, **token consumption**, and **cost per task** [8][9][12]. This matters because multi-agent collaboration, retrieval, and graph-based reasoning may improve analytical quality while also increasing computational overhead.

### 2.3 Summary of Evaluation Perspective

Overall, current literature suggests that the evaluation of a generative business canvas system should be fundamentally multi-dimensional. It should cover correctness, grounding, collaboration quality, dynamic coordination efficiency, canvas-level semantic and spatial quality, human-centered usefulness, and computational efficiency [4][8][9][13][15]. This reflects an important shift in recent research: the question is no longer only whether a model can produce a correct answer, but whether an integrated system can deliver a reliable, interpretable, evidence-grounded, and visually manageable analytical process for real business decision support.
