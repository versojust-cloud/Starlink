# Research and Implementation of a Generative Business Canvas System Based on Multi-Agent Collaborative Reasoning

## Abstract

Recent work on large language models, multi-agent systems, retrieval-augmented generation, and visual analytics has extended intelligent decision support beyond dashboards and report-oriented business intelligence tools. Even so, current systems still show persistent weaknesses in business settings, especially in process transparency, evidence grounding, reasoning stability, and support for user intervention. This review examines research related to generative business canvas systems from the perspectives of datasets and evaluation metrics, business decision support, large language model reasoning, multi-agent collaboration, knowledge augmentation, and visual analytics. The literature suggests that the technical basis for business-oriented reasoning, collaborative problem solving, and knowledge-grounded analysis is already in place, but these lines of work are still largely studied separately. Existing systems are often stronger either in reasoning capability or in interface support than in the integration of transparent workflows, canvas-based interaction, and controllable human-AI collaboration. From this perspective, a generative business canvas system based on multi-agent collaborative reasoning can be read as an attempt to bring these strands together.

**Keywords:** business decision support; large language model; multi-agent collaboration; knowledge augmentation; visual analytics; business canvas

## 1 Introduction

In the context of digital transformation, enterprises increasingly rely on intelligent systems to process heterogeneous information from markets, users, competitors, operations, and external knowledge sources. Traditional business decision support systems have improved access to data and analytics, but they still mainly center on dashboards, reports, and result presentation [15][17]. Such systems are useful for monitoring business conditions, yet they are less effective when users need to explore complex problems, compare alternatives, revise assumptions, and inspect the logic behind a recommendation [13][14][17].

Large language models have introduced a new possibility for business decision support because they can process unstructured documents, summarize information, and generate analytical explanations in natural language [20][8]. Yet recent research also shows that standalone large language models are not sufficient for dependable business analysis. Problems such as hallucination, unstable reasoning, weak grounding, and poor controllability become particularly serious in finance- and strategy-related tasks [27][1][2][3]. This has pushed the field toward multi-agent collaboration, retrieval-augmented generation, knowledge graph enhancement, and visual analytics as complementary directions for improving reasoning quality, factual reliability, and interpretability [29][43][46][13].

Against this background, a generative business canvas system is treated here as a system that organizes evidence, intermediate reasoning steps, business modules, and strategic conclusions in a visible and editable workspace. The review therefore begins with datasets and evaluation metrics, then turns to business decision support, LLM reasoning, multi-agent collaboration, knowledge augmentation, and visual analytics, before closing with the main limitations and possible directions for further work.

## 2 Datasets and Evaluation Metrics

### 2.1 Datasets and Benchmarks

In research on generative business decision support systems, datasets and benchmarks determine whether a model is capable of business reasoning rather than only fluent text generation. Unlike traditional recommendation or general question-answering tasks, there is still no unified benchmark specifically designed for a generative business canvas system that simultaneously evaluates collaborative reasoning, knowledge grounding, process transparency, visual structuring, and user intervention. Current studies therefore draw on business-oriented reasoning benchmarks, financial question-answering datasets, business intelligence benchmarks, and manually constructed business cases [1][2][3][4].

From a data perspective, this research area is characterized by strong heterogeneity. Relevant inputs are not limited to one data type, but usually combine financial statements, textual disclosures, market narratives, charts, tables, BI reports, and externally retrieved evidence [1][2][5][6][7]. The cited benchmarks therefore point to a setting in which structured and unstructured materials coexist and in which text, tables, and charts may all be relevant to the same analytical task [1][2][5][6][7].

The original benchmark papers also show that the field has already moved beyond simple question-answer pairs. FinQA was built from real financial reports and contains 8,281 expert-written QA pairs with annotated reasoning programs, which makes explainable numerical reasoning part of the dataset design itself [5]. TAT-QA further emphasizes hybrid context by combining tables and associated paragraphs, resulting in 16,552 questions over 2,757 financial-report contexts drawn from 182 reports, again with explicit derivations for many numerical answers [6]. FinanceBench takes a different path and frames the problem as open-book financial QA with evidence strings, thereby making traceability a central data property rather than a secondary evaluation choice [2]. ChartQA extends the data perspective once more by showing that some analytical questions are inherently visual: it includes both human-written and summary-generated questions over charts, so the benchmark is not limited to text and tables alone [7].

Existing benchmarks already cover several important capabilities required in business analysis, including quantitative reasoning, evidence-grounded question answering, hybrid reasoning over text and tables, business insight generation, and limited forms of visual reasoning [1][2][3][4][5][6][7]. Table 2 summarizes representative business- and finance-related benchmarks closely related to this review.

Table 2. Business/finance benchmarks and evaluation focus

| Benchmark | Domain | Task type | Main data source | Evaluation focus | Relevance to this review |
|---|---|---|---|---|---|
| BizBench | Business / finance | Quantitative reasoning, QA, code-based reasoning | Financial text, tables, formulas, and realistic business questions | Numerical reasoning, document understanding, financial knowledge | Highly relevant for evaluating business-oriented reasoning depth |
| FinanceBench | Finance | Evidence-grounded financial QA | Public company filings and evidence annotations | Answer correctness and evidence traceability | Highly relevant for grounding and document-based support |
| FinanceReasoning | Finance | Multi-step numerical reasoning | Financial reasoning problems and formula-intensive tasks | Credibility, comprehensiveness, challenge level, numerical precision | Highly relevant for complex financial inference |
| BI-Bench | Business intelligence | Insight generation | BI-oriented analytical cases | Descriptive, diagnostic, predictive, and prescriptive insight quality | Relevant for business analysis outputs beyond short-answer QA |
| FinQA | Finance | Numerical reasoning over hybrid evidence | Financial reports with text and tables | Program-based reasoning and explainability | Relevant for mixed textual-tabular analytical tasks |
| TAT-QA | Finance | QA over textual and tabular content | Financial reports | Hybrid evidence reasoning and arithmetic inference | Relevant for evidence integration in business analysis |
| ChartQA | Chart / analytics | Visual and logical reasoning over charts | Charts and associated data tables | Visual reasoning and chart-based QA | Indirectly relevant for future evaluation of visually structured business analysis |

Despite these advances, current datasets remain fragmented. Most benchmarks focus on one aspect only, such as factual QA, numerical reasoning, BI insight generation, or document interpretation [1][2][3][4][5][6]. Very few directly evaluate a system as an integrated analytical workspace in which multiple agents collaborate, external knowledge is dynamically incorporated, and reasoning is visually represented for user intervention. Many studies therefore complement public benchmarks with manually specified business cases or task formulations when analytical workflows need to reflect business goals and decision contexts more explicitly [4][11][12].

A separate limitation lies in the gap between benchmark data and operational business data. Public benchmarks are usually relatively clean, task-bounded, and already organized around specific questions or annotations, whereas real business environments involve incomplete records, time-sensitive external information, and supporting evidence scattered across multiple sources [2][3][4][5]. Data freshness, source reliability, and evidence traceability therefore become important concerns for business-oriented reasoning systems [2][27][43].

The benchmark papers make this difference especially visible in the way they annotate data. Some datasets emphasize reasoning programs and derivations [5][6], some emphasize evidence strings and answer traceability [2], and some shift toward broader analytical query categories such as descriptive, diagnostic, predictive, and prescriptive BI tasks [4]. BizBench similarly decomposes business and finance evaluation into multiple task types rather than treating financial QA as a single homogeneous problem [1]. Collectively, these studies show that business analysis data are not organized around a single annotation scheme.

As shown in Table 2, current benchmarks already cover financial question answering, numerical reasoning, business intelligence insight generation, and hybrid evidence understanding. However, none of them directly evaluates a canvas-based, multi-agent, and human-interactive analytical system. Overall, current datasets are sufficient for evaluating business-oriented reasoning, financial QA, and business intelligence outputs at a partial level, but they remain insufficient for directly assessing a generative business canvas system as a transparent, interactive, and collaborative decision support environment [4][11][12].

### 2.2 Evaluation Metrics

The evaluation of a generative business canvas system should not rely on a single metric. Since this type of system integrates large language model reasoning, multi-agent collaboration, knowledge grounding, and visual interaction, the cited literature points to several recurring evaluation dimensions, including answer correctness, evidence support, task completion, user-facing usefulness, and efficiency [8][9][10][32][33][34].

For benchmark-style reasoning tasks, the most common automatic metrics are **Accuracy**, **Exact Match (EM)**, and **F1 Score** [2][3][8]. Accuracy can be written as:

\[
\mathrm{Accuracy} = \frac{N_{\mathrm{correct}}}{N_{\mathrm{total}}}
\]

where \(N_{\mathrm{correct}}\) denotes the number of correct predictions and \(N_{\mathrm{total}}\) denotes the total number of evaluated samples. These metrics are useful for measuring output correctness, but they mainly focus on the final answer rather than the reasoning process behind it.

Because business decision support requires evidence-based conclusions, correctness metrics should be complemented by **grounding-related metrics**, including grounding accuracy, evidence support rate, faithfulness, and hallucination rate [2][27][43]. Grounding accuracy measures whether the generated analysis is supported by retrieved documents or structured external knowledge. Evidence support rate evaluates how much of the output can be traced to verifiable evidence, while faithfulness measures whether the conclusion remains consistent with that evidence. Hallucination rate is especially important because a fluent but weakly grounded response may still be analytically misleading in business scenarios [27][43].

This emphasis is consistent with the construction of the underlying datasets. FinanceBench, for example, explicitly pairs answers with evidence strings, making support traceability part of the benchmark design [2]. BI-Bench moves in another direction by evaluating end-to-end BI outputs through broader dimensions such as quality, relevance, and depth of insights, rather than relying only on rigid answer matching [4]. Together, these studies suggest that evaluation in business-oriented systems should reflect both factual support and analytical usefulness.

For multi-agent systems, one recurring concern is whether a complete task can be solved successfully:

\[
\mathrm{Task\ Success\ Rate} = \frac{N_{\mathrm{success}}}{N_{\mathrm{tasks}}}
\]

where \(N_{\mathrm{success}}\) is the number of successfully completed tasks and \(N_{\mathrm{tasks}}\) is the total number of evaluated tasks. Recent surveys on LLM-based agents further show that evaluation often extends beyond single-turn correctness to planning quality, feedback incorporation, tool use, and cost-efficiency [9][32][33][34]. In other words, agent evaluation is increasingly concerned with whether a system can complete multi-step tasks reliably rather than merely produce plausible intermediate responses.

The literature is less standardized when it comes to assessing collaborative quality and interface quality. Existing agent surveys discuss coordination, planning, feedback, and tool use as central capabilities [9][32][33][34], but they do not yet provide a unified metric system for measuring whether collaboration is transparent, editable, or easy for users to inspect. A similar gap appears on the interface side. Studies on visual analytics and interface design strongly support the importance of readable, inspectable, and interactive analytical workspaces [10][13][14], yet standardized metrics for canvas-level quality remain limited. As a result, evaluation for a business canvas system would likely need to combine established benchmark metrics with interface-oriented assessment that is still less formalized in current literature.

**Human-centered metrics** remain essential. Recent studies increasingly emphasize usefulness, interpretability, transparency, controllability, and user trust as key dimensions of evaluation [10][13][14]. This matters in decision support because the goal is not simply to automate analysis, but to support human-AI collaborative reasoning.

Practical systems also need to be evaluated in terms of **latency**, **token consumption**, and **cost per task** [43][9][34]. Multi-agent collaboration, retrieval, and graph-based reasoning may improve analytical quality while also increasing computational overhead.

### 2.3 Summary of Evaluation Perspective

Current literature therefore suggests that the evaluation of a generative business canvas system should be multi-dimensional. Existing studies already support correctness, grounding, task completion, user-centered usefulness, and computational efficiency as important dimensions [4][43][9][10][13]. What remains less developed is how to evaluate collaborative transparency and canvas-level analytical quality within the same framework.

## 3 Current Research Status

### 3.1 Business Decision Support Systems

Decision support systems have long been used to help managers organize information, compare alternatives, and improve operational and strategic decisions. Early systems mainly aggregated structured business data, generated reports, and presented numerical summaries. As enterprise analytics matured, decision support moved beyond descriptive reporting toward predictive and prescriptive analysis, allowing organizations to use data more directly in planning and optimization [15][16].

Business analytics systems can improve organizational agility, responsiveness, and data-driven capability by helping users interpret large and heterogeneous information sources [15][16]. In practice, though, most business decision support systems still revolve around dashboards, reports, key performance indicators, and predefined analytical views. Those functions are useful for monitoring and summarizing business conditions. They are less effective when users need to break down a complex problem, revise assumptions, compare competing strategies, or trace the logic behind a recommendation [11][12][17].

The weakness is partly about data and partly about interface design. Literature on analytics canvas and visual analytics suggests that fixed reporting views and predefined analytical structures work well for recurring monitoring tasks, but offer weaker support for exploratory analysis that moves between raw evidence, intermediate abstractions, and higher-level business interpretations [11][13][14]. The problem becomes clearer when analysis depends on external documents, market narratives, and fast-changing contextual information [15][16].

The same limitation becomes more serious once the task involves uncertain evidence and multiple interacting variables. Market entry analysis, business model evaluation, and strategic planning all require users to consider customer demand, competition, cost structures, risks, and alternatives at the same time. Dashboard-oriented systems can display these elements separately, yet they rarely externalize the reasoning path that connects them to a final decision. Many existing DSS implementations therefore remain result-oriented rather than process-oriented [11][12][17].

The explainable AI literature addresses part of this problem. Work in this area treats trust, transparency, and interpretability as central requirements rather than optional enhancements [18][19]. Existing studies have proposed broad taxonomies of explainability that cover model interpretation, user understanding, and responsible AI deployment [18]. The broader point is clear: black-box analytical support is inadequate in settings where decisions must be justified to managers, regulators, or other stakeholders.

Current explainable DSS research still has a clear boundary. Most existing work explains outputs after inference is complete, rather than making the analytical process itself visible. Many systems can help answer “why was this result produced?” They are less capable of answering “how is the reasoning process unfolding, and how can the user intervene before the conclusion is fixed?” Process visibility, in other words, remains less developed than output explanation in current DSS research [18][19].

Another relevant development is the emergence of canvas-oriented analytical frameworks in business and analytics contexts. Works such as **Analytics Canvas** and **Business-to-Analytics Canvas** describe canvas-like structures as useful for translating business goals into analytical tasks and for supporting communication between business and technical roles [11][12]. These frameworks are not generative reasoning systems, but they do show that the canvas can function as a structured medium for analytical problem formulation and coordination.

Overall, the literature shows that business decision support systems have become more analytically sophisticated and more attentive to explainability. Even so, most systems still emphasize the presentation of results more than the exposure and structuring of the reasoning process itself. How reasoning should be organized and inspected during analysis remains less settled.

### 3.2 Large Language Models and Reasoning

Large language models have become a major technical foundation for intelligent analytical systems. Existing surveys suggest that they offer strong capabilities in natural language understanding, summarization, information organization, planning, and reasoning [20][8]. That combination matters for business applications, where the input is often unstructured: reports, regulatory documents, company announcements, and market narratives, not just database fields.

One important research line no longer treats reasoning as a single completion. It tries to shape the inference process itself. **Chain-of-Thought prompting** changes the prompt format from simple input-output examples to input-chain-of-thought-output demonstrations, encouraging the model to decompose a task into intermediate natural-language steps [21]. The resulting chain is not only a stronger prompt. It is also an inspectable record of how the answer was reached. **Self-Consistency** keeps this basic idea of explicit reasoning, but samples multiple candidate paths and selects the most consistent final answer, reducing dependence on a single brittle trajectory [22]. **Tree of Thoughts** goes further by treating reasoning as search over candidate “thoughts,” where generation, evaluation, and selection are no longer fused into one left-to-right pass [23]. **ReAct** changes the structure again by interleaving reasoning traces with actions and observations, which lets the model update its plan after querying an external source or interacting with an environment instead of relying on a closed internal chain [24]. **Reflexion** and **Self-Refine** both introduce iterative improvement, but in different forms: Reflexion converts feedback into verbal reflections stored in episodic memory across trials, whereas Self-Refine uses the same model to generate feedback and rewrite its own output within the same task instance [25][26].

Taken together, these methods show a clear change in how reasoning is framed. The model is no longer treated as a black box that should simply return a correct answer. It is increasingly treated as a system that must decompose, branch, retrieve, critique, or revise before a conclusion is accepted. That shift matters in analytical work, where intermediate assumptions often matter as much as the final recommendation.

Recent surveys on LLM reasoning also emphasize that stronger reasoning behavior does not automatically imply higher reliability [8]. Prompting strategies can make reasoning more explicit, but they do not by themselves guarantee factual support, stable decomposition, or faithful execution. Trustworthiness and alignment studies accordingly show that large language models may still produce unsupported statements, omit critical intermediate steps, or generate fluent but misleading conclusions [27][28][20]. This weakness becomes more serious in business scenarios, where analytical outputs may influence planning, investments, resource allocation, or risk management.

The problem is compounded by the fact that many business tasks involve domain concepts, evolving information, and numerical constraints. A model may appear competent when answering generic questions but still perform poorly when it must interpret a balance sheet, compare financial ratios, reconcile evidence from multiple documents, or reason under domain-specific assumptions. Benchmark studies reinforce this point in a more fine-grained way: FinQA and TAT-QA require reasoning over hybrid textual and tabular evidence, BizBench emphasizes quantitative reasoning in business and finance settings, FinanceBench foregrounds evidence-grounded financial question answering, and FinanceReasoning raises the difficulty of multi-step numerical inference [5][6][1][2][3].

The current state of research therefore supports a more qualified conclusion than simple enthusiasm for larger models. Large language models have clearly expanded the analytical range of decision-support systems, especially where the input is textual, dispersed, or weakly structured. Even so, the literature does not support treating them as self-sufficient business decision engines. Their reasoning remains dependent on prompt structure, external evidence, and post hoc control mechanisms, and it still requires stronger grounding and evaluation before it can be relied on in demanding business settings.

### 3.3 Multi-Agent Collaborative Reasoning

Multi-agent collaboration has become one of the most active directions in post-LLM system design. Compared with single-model reasoning, multi-agent systems distribute tasks across specialized roles, allowing different agents to cooperate, critique one another, and revise intermediate outputs. Recent surveys do not treat this line of work as a single uniform paradigm. They usually organize it around broader functions such as solving complex tasks, simulating specific scenarios, and evaluating generative agents, while also emphasizing planning, coordination, and iterative refinement as central capabilities [29][30][31].

Recent literature makes clear that a multi-agent system is more than “several agents talking to each other.” Current agent research increasingly describes these systems in terms of explicit capabilities. **Planning** is one of them. Planning surveys treat it as a distinct design problem and analyze it through task decomposition, plan selection, external module use, reflection, and memory [32]. That taxonomy matters because agent collaboration is not a single mechanism. Some systems first decompose a task and then solve subproblems. Others generate multiple candidate plans and select among them. Still others bring in external planners or memory structures to stabilize long-horizon behavior [32]. The question is not only who does what, but how the overall search process is organized.

Another capability is **feedback**. Feedback research categorizes correction mechanisms into internal feedback, external feedback, multi-agent feedback, and human feedback [33]. The distinction is useful. Internal feedback draws on the agent’s own prior trajectories or self-evaluation; external feedback brings in tools, web sources, interpreters, or world models; multi-agent feedback relies on critique, ranking, or debate among agents; human feedback remains the strongest alignment channel when the task demands direct oversight [33]. Collaborative reasoning quality therefore depends not only on the initial analytical path, but also on what kind of corrective signal is available when that path begins to drift.

Tool use forms a third capability. Tool learning research shows that modern agent systems are increasingly organized around four stages: task planning, tool selection, tool calling, and response generation [34]. Tool use is not reducible to API invocation. The agent must first determine whether a tool is needed, then choose among candidates, translate its intent into a usable call, and finally integrate the returned result into the broader reasoning process [34]. In practice, this is what links language reasoning to operations over external resources, databases, search systems, or software environments [34][36][38].

Representative systems make these distinctions concrete. **CAMEL** treats role-playing as a control device, using role-consistent prompts to stabilize communication between agents with different functions [35]. **AutoGen** turns multi-agent interaction into an extensible conversation framework, which is why it is frequently used as an infrastructure layer for tool-integrated workflows rather than only as a single method [36]. **MetaGPT** formalizes role specialization through standard operating procedures and workflow decomposition, pushing the idea that agent collaboration should follow explicit production logic rather than ad hoc chatting [37]. **Magentic-One** deepens orchestration further by assigning one agent responsibility for planning, progress tracking, and replanning when earlier steps fail [38]. Application-oriented studies such as **Generative Agents**, **ChatDev**, and **ChatEval** extend the same principles into different settings, including social simulation, software collaboration, and evaluation through debate [39][40][41]. What changes across these systems is not only the application domain, but also the unit of coordination: role, message, workflow stage, or debate round.

Despite this progress, several limitations remain. Most current multi-agent work is validated in general-purpose task automation, coding, evaluation, or simulation environments rather than in business decision support settings. Many systems optimize for task completion and benchmark performance, but they do not provide end users with a clear view of how disagreement is surfaced, how intermediate conclusions are revised, or why one agent’s judgment prevails over another. Feedback and planning are recognized as important capabilities, yet the evaluation of multi-agent systems still often lacks domain-specific criteria for business usefulness, transparency, and intervention [30][33][34]. Traditional multi-agent literature on coordination and consensus also reminds us that collaboration quality depends on more than role diversity: convergence conditions, agreement quality, and coordination cost are all relevant, but these concerns are still only weakly connected to current LLM-agent evaluation practice [42].

These limitations leave open how multi-agent collaboration should be exposed to users as an inspectable analytical process rather than remaining only a backend coordination mechanism.

### 3.4 Knowledge Augmentation and Graph-Based Reasoning

Knowledge augmentation has become one of the main responses to the limitations of standalone LLM reasoning. The most influential line of work is **Retrieval-Augmented Generation (RAG)**, which retrieves relevant external documents and conditions generation on that evidence [43]. Recent survey work no longer treats RAG as a single fixed recipe. It distinguishes between naive RAG, which largely follows an index-retrieve-generate pipeline, advanced RAG, which adds pre-retrieval and post-retrieval optimization such as query rewriting, metadata enhancement, reranking, and context compression, and modular RAG, which further introduces routing, memory, search, and task-specific adapters [43]. Retrieval, in other words, is no longer just a prompt attachment step. It is treated as an architectural component with its own failure modes and optimization targets.

For business decision support, the role of knowledge augmentation is straightforward. Business analysis often depends on information that is current, verifiable, and context-dependent, such as annual reports, market news, policy documents, financial disclosures, and industry studies. A purely parametric language model cannot be expected to store all such information reliably or keep it updated. In such settings, retrieval often becomes necessary for evidence-grounded analytical reasoning [2][43][45].

Work on dynamic retrieval clarifies why the shift away from naive RAG was necessary. **Active Retrieval-Augmented Generation** starts from the observation that single-time retrieval is often insufficient for long-form, knowledge-intensive generation. Its core move is simple but important. Instead of retrieving once at the beginning, it predicts an upcoming sentence, detects low-confidence tokens, retrieves based on that anticipated content, and then regenerates the sentence with new evidence [44]. **Agentic RAG** generalizes the same intuition at a system level. By incorporating planning, reflection, tool use, and even multi-agent collaboration into retrieval itself, it turns retrieval from a one-time preprocessing step into a dynamic component of the reasoning workflow [44][45].

This also highlights a data-organizational requirement that is sometimes understated in model-centered research. The RAG literature repeatedly stresses the importance of retrieval source design, chunk granularity, metadata, query reformulation, reranking, and continuous knowledge updates [43][45]. In business settings, the quality of knowledge augmentation therefore depends not only on generation, but also on how underlying evidence sources are segmented, indexed, filtered, and kept current.

In parallel, **knowledge graph enhancement** offers another line of development. Literature on LLMs and knowledge graphs consistently frames this combination as a form of hybrid representation, in which explicit knowledge in graphs complements the parametric knowledge stored in language-model weights [46]. The value of this framing is that it makes the trade-off more explicit: LLMs offer flexible language understanding and broad coverage, while knowledge graphs offer explicit relations, inspectable structure, and higher precision for entity-level knowledge [46]. This matters in business decision support because business reasoning naturally involves relationships among products, markets, stakeholders, channels, costs, opportunities, and risks. It also matters because the same literature repeatedly identifies long-tail knowledge, numerical values, and explainability as areas where purely parametric knowledge remains weak [46].

More recent graph-enhanced reasoning work also shows that the usefulness of graph knowledge depends on how explicitly relations and paths are incorporated into the reasoning process. In business settings, this is important because relevant evidence may be distributed across multiple entities and linked documents rather than concentrated in one source. A reasoning system that can only read isolated passages will often miss this relational structure.

Graph-based reasoning methods deepen this line of work. **Graph Chain-of-Thought** demonstrates that graph interaction can become an active part of the reasoning loop itself rather than a passive knowledge store [47]. **Graph of Thoughts** further generalizes the idea that reasoning can be organized as a graph rather than a single chain or tree, so dependencies among subproblems, partial hypotheses, and alternative routes can be represented more flexibly [48]. These studies are relevant because they suggest that structure can serve two purposes at once: it can organize knowledge, and it can organize reasoning over that knowledge.

However, the current literature also reveals a boundary. Most knowledge augmentation and graph reasoning studies focus on improving backend faithfulness, retrieval quality, and reasoning performance. They rarely address how selected evidence, graph paths, or intermediate reasoning structures should be presented to users in an understandable and editable way. Interface-level representation of grounded reasoning therefore remains comparatively underdeveloped.

### 3.5 Visual Analytics and Canvas-Based Interaction

Visual analytics research provides a useful foundation for interface-oriented analytical systems. Foundational work in visual analytics did not treat visualization as decorative output. It framed the area around analytical reasoning, visual representation and interaction, data transformation, and the presentation of analytical results [17]. Recent surveys retain that position in a machine-learning context, emphasizing that visualization in intelligent systems is not only a matter of output presentation. It also supports understanding, diagnosis, comparison, and intervention [13][14]. In business analysis, that means inspecting relationships among evidence, alternatives, assumptions, and outcomes rather than simply viewing a final answer.

Studies on visual analytics for machine learning show that visual representation can serve as an analytical workspace for understanding, diagnosing, and improving intelligent systems [13]. The shift is conceptual. The interface is not only where a result is displayed; it is where evidence is compared, anomalies are inspected, and model behavior is scrutinized. Research on visual analytics for explainable deep learning reinforces this point by treating explanation, debugging, and improvement as intertwined tasks rather than separate stages [14]. Foundational explanation studies such as **SHAP** and **LIME** also matter here, not because they provide a canvas system by themselves, but because they formalize a broader expectation that intelligent systems should expose interpretable intermediate structure instead of only producing a final answer [49][50].

Work on generative AI interfaces extends this argument into the LLM era. Survey studies indicate that interface design in generative AI should not be reduced to prompting alone; it also includes selection, parameter manipulation, object manipulation, and other user-guided interaction patterns [10]. Text-only chat interfaces are often too narrow for complex analytical workflows. Conversation is convenient for simple requests. It is much less suited to representing branching logic, long-term dependencies, alternative paths, or editable intermediate reasoning units. Systems such as **Sensecape** make this limitation explicit in concrete terms. The paper frames complex information work as movement between foraging and sensemaking, and designs for multilevel abstraction by allowing users to switch between canvas and hierarchy views [51]. What matters here is not only the interface shape, but the interaction logic: information can be revisited, regrouped, summarized, and reorganized across different levels rather than being trapped in a chronological dialogue [10][51].

Canvas-oriented analytical frameworks strengthen this point from another angle. **Analytics Canvas** and **Business-to-Analytics Canvas** show that canvas-like structures are already used as tools for translating business needs into analytics tasks and for supporting coordination between business stakeholders and technical teams [11][12]. Their contribution is not generative reasoning, but analytical formalization. They show that a canvas can function as a structured medium for decomposition, communication, and specification before implementation begins.

Explainable interface research also supports this direction. Studies in human-centered explainability explicitly argue that explainability depends not only on the content of explanations, but also on interface design that matches user roles and preserves human oversight [18][19]. More broadly, visual analytics studies also show that interface quality affects how users inspect alternatives, connect evidence, and maintain analytical control [13][14]. Even so, most existing interfaces still improve decisions mainly through better presentation of information rather than by externalizing the reasoning structure itself.

Across these studies, visual analytics, explainable interfaces, and canvas-based analytics support structured analytical workspaces that combine organization, inspection, and revision of intermediate content [10][11][12][13][14][51]. Less attention has been given to how these interface principles can be combined with multi-agent collaboration and knowledge-grounded generative reasoning.

## 4 Discussion

### 4.1 Major Issues in Current Research

The literature reviewed above indicates steady progress across business decision support, large language model reasoning, multi-agent collaboration, knowledge augmentation, and visual analytics. However, these developments are still largely distributed across separate research streams. Several specific issues remain unresolved:

- **Lack of process transparency in DSS:** Traditional DSS and BI platforms have advanced in data aggregation and insight generation, but they still primarily focus on presenting final outputs rather than exposing the underlying reasoning process [15][18][11]. Even explainable decision-support studies often prioritize post hoc explanations over making intermediate reasoning states visible and editable.

- **Reliability limits of LLMs in vertical scenarios:** Mechanisms such as chain-of-thought, self-consistency, branching search, and self-reflection improve general LLM performance [21][22][23][25]. Nevertheless, benchmark studies and trustworthiness surveys show that these models still experience hallucination, unstable multi-step inference, weak grounding, and domain inconsistency in business and finance tasks [27][1][2][3].

- **Insufficient integration of multi-agent reasoning and user interaction:** Multi-agent research has advanced in planning, feedback, role specialization, and tool use [30][32][33][34]. However, these systems are typically evaluated on benchmark completion rates rather than on the visibility or controllability of their collaborative processes, which leaves their suitability for interactive business analysis less well established.

- **Separation between knowledge grounding and interface design:** Methods such as retrieval-augmented generation, agentic RAG, and graph-based reasoning strengthen factual support and structural reasoning [43][45][46][47]. Yet the focus remains concentrated on backend improvement. How retrieved evidence and reasoning paths should be structurally represented to users remains a notable gap, particularly for canvas-based systems.

- **Evaluation insufficiency:** Existing datasets and metrics can test correctness, grounding, and partial task performance [1][2][3][4][8][9], but current literature offers much less standardization for evaluating process visibility, canvas-level organization, or the quality of user intervention [10][13][14].

- **Data heterogeneity and governance are still underexplored:** Current studies clearly use combinations of tables, text, charts, reports, and retrieved external evidence [1][2][5][6][7], but they devote less attention to system-level handling of provenance, freshness, and source management. These issues are closely tied to the reliability of business-facing analytical outputs [2][27][43].

### 4.2 Implications for the Present Topic

These unresolved issues have fairly direct implications for system design. A generative business canvas system is better treated as an **integrated workflow** than as a loose combination of generation, retrieval, and visualization tools. Studies on multi-agent planning, tool use, retrieval augmentation, and interactive analytical interfaces all point to the need for coordination across these components in more complex analytical systems [30][34][43][45][10][13]. The same applies to evaluation. Existing benchmarks and interface studies suggest that assessment should cover not only correctness and grounding, but also whether users can inspect, trace, and revise intermediate results [2][4][9][10][13][14]. **Human-in-the-loop support** also remains central. Visual analytics and explainability research repeatedly shows that decision-support systems are more useful when users can question intermediate results and maintain oversight over final recommendations [18][19][13][14]. What is still missing is less a new component technology than a coherent way of integrating the existing ones for business analysis.

### 4.3 Future Research Directions

Based on the preceding analysis, several research directions follow for generative business canvas systems:

- **Business-oriented multi-agent role design:** Moving beyond generic roles such as planner or critic, future systems may require domain-specific configurations such as market analysts, financial evaluators, and risk reviewers to better align with business workflows [29][30][35][37][38].

- **Task-aware knowledge grounding:** Building on recent work in retrieval-augmented and agentic retrieval-augmented generation [43][44][45], evidence retrieval in business settings should become more dynamic and selective, explicitly tying external data to specific analytical goals on the canvas rather than merely appending it to generated text.

- **Canvas-based process evaluation:** Evaluation frameworks need to expand beyond output correctness. New metrics should be defined for spatial coherence, semantic module alignment, reasoning traceability, and editability [11][12][13], treating the canvas as an active reasoning environment.

- **Dynamic evaluation of collaborative efficiency:** Multi-agent systems should be assessed not only on final accuracy but also on coordination efficiency, such as the ability to resolve disagreements and correct weak intermediate conclusions [9][33][42].

- **Data-centric analytical pipelines:** Future systems should treat data preparation as part of the reasoning architecture rather than as a separate preprocessing step. This includes better support for heterogeneous data ingestion, source alignment, document freshness management, and quality-aware evidence selection across structured and unstructured business data [2][4][11][43][45].

- **Human-centered analytical workflows:** Explainability and human-centered interface research consistently emphasizes preserving human oversight, so systems that explicitly support collaborative reasoning between human experts and AI agents remain an important direction [18][19].

## 5 Summary

This literature review has examined recent research relevant to generative business canvas systems from the perspectives of datasets and evaluation metrics, business decision support, large language model reasoning, multi-agent collaboration, knowledge augmentation, and visual analytics.

Current benchmark construction has made clear progress in evaluating business and finance reasoning, financial question answering, and business intelligence insight generation. Resources such as BizBench, FinanceBench, FinanceReasoning, BI-Bench, FinQA, and TAT-QA show that business analysis requires not only language understanding, but also numerical inference, evidence grounding, and insight-oriented assessment. At the same time, no existing benchmark directly evaluates a generative business canvas system as a transparent and collaborative analytical workspace.

The literature on decision support and explainable AI also makes clear that analytical systems are no longer judged only by predictive or reasoning performance. Trust, transparency, interpretability, and usability now matter as well. Existing DSS and BI systems have improved greatly in reporting and visualization, yet they still tend to externalize results rather than the reasoning process itself.

Studies on large language models, multi-agent systems, retrieval-augmented generation, knowledge-graph enhancement, and graph-based reasoning already provide many of the technical components needed for a stronger analytical system. What is less developed is the way these components are combined into a coherent workflow for business analysis.

Work on visual analytics, explainable interfaces, and canvas-based analytical representation points in a similar direction. Complex AI-supported analysis is not well served by linear dialogue and static dashboards alone. The literature instead points toward structured, inspectable, and revisable workspaces in which evidence, intermediate reasoning, and conclusions can be connected in visible form [10][11][12][13][14][18][19][51].

The same is true on the data side. The effectiveness of business reasoning depends not only on model architecture, but also on how heterogeneous business data are collected, aligned, refreshed, filtered, and exposed for verification [1][2][5][6][7][43][45]. Current studies provide partial support for numerical reasoning, hybrid evidence integration, and retrieval-based grounding, but they leave open the broader question of how data quality and provenance should be managed within an interactive analytical workflow.

The literature therefore points to a field in which the main building blocks are already available, while their system-level integration remains incomplete. A generative business canvas system belongs to this open part of the problem.

## 6 References

[1]Krumdick M, Koncel-Kedziorski R, Lai V D, et al. BizBench: A quantitative reasoning benchmark for business and finance[C]//Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers). Bangkok, Thailand: Association for Computational Linguistics, 2024: 8309-8332.

[2]Islam P, Kannappan A, Kiela D, et al. FinanceBench: A new benchmark for financial question answering[EB/OL]. arXiv:2311.11944, 2023. DOI:10.48550/arXiv.2311.11944.

[3]Tang Z, E H, Ma Z, et al. FinanceReasoning: Benchmarking financial numerical reasoning more credible, comprehensive and challenging[C]//Proceedings of the 63rd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers). Vienna, Austria: Association for Computational Linguistics, 2025: 15721-15749.

[4]Gupta A, Aggarwal A, Bithel S, et al. BI-Bench: A comprehensive benchmark dataset and unsupervised evaluation for BI systems[C]//Annual Meeting of the Association for Computational Linguistics. 2025.

[5]Chen Z, Chen W, Smiley C, et al. FinQA: A dataset of numerical reasoning over financial data[C]//Proceedings of the 2021 Conference on Empirical Methods in Natural Language Processing. Online and Punta Cana, Dominican Republic: Association for Computational Linguistics, 2021: 3697-3711.

[6]Zhu F, Lei W, Huang Y, et al. TAT-QA: A question answering benchmark on a hybrid of tabular and textual content in finance[C]//Proceedings of the 59th Annual Meeting of the Association for Computational Linguistics and the 11th International Joint Conference on Natural Language Processing (Volume 1: Long Papers). Online: Association for Computational Linguistics, 2021: 3277-3287.

[7]Masry A, Long D X, Tan J Q, et al. ChartQA: A benchmark for question answering about charts with visual and logical reasoning[C]//Findings of the Association for Computational Linguistics: ACL 2022. Dublin, Ireland: Association for Computational Linguistics, 2022: 2263-2279.

[8]Huang J, Chang K C-C. Towards reasoning in large language models: A survey[C]//Findings of the Association for Computational Linguistics: ACL 2023. Toronto, Canada: Association for Computational Linguistics, 2023: 1049-1065.

[9]Yehudai A, Eden L, Li A, et al. Survey on evaluation of LLM-based agents[EB/OL]. arXiv:2503.16416, 2025. DOI:10.48550/arXiv.2503.16416.

[10]Luera R, Rossi R A, Siu A, et al. Survey of user interface design and interaction techniques in generative AI applications[EB/OL]. arXiv:2410.22370, 2024. DOI:10.48550/arXiv.2410.22370.

[11]Kühn A, Joppen R, Reinhart F, et al. Analytics canvas: A framework for the design and specification of data analytics projects[J]. Procedia CIRP, 2018, 70: 162-167.

[12]Panzner M, Meyer M, von Enzberg S, et al. Business-to-analytics canvas: Translation of product planning-related business use cases into concrete data analytics tasks[J]. Procedia CIRP, 2022, 109: 580-585.

[13]Wang J, Liu S, Zhang W. Visual analytics for machine learning: A data perspective survey[J]. IEEE Transactions on Visualization and Computer Graphics, 2024, 30(12): 7637-7656.

[14]Hohman F, Kahng M, Pienta R, et al. Visual analytics in deep learning: An interrogative survey for the next frontiers[J]. IEEE Transactions on Visualization and Computer Graphics, 2019, 25(8): 2674-2693.

[15]Horani O M, Khatibi A, AL-Soud A R, et al. Determining the factors influencing business analytics adoption at organizational level: A systematic literature review[J]. Big Data and Cognitive Computing, 2023, 7(3).

[16]Sjödin D, Parida V, Palmié M, et al. How AI capabilities enable business model innovation: Scaling AI through co-evolutionary processes and feedback loops[J]. Journal of Business Research, 2021, 134: 574-587.

[17]Thomas J J, Cook K A. A visual analytics agenda[J]. IEEE Computer Graphics and Applications, 2006, 26(1): 10-13.

[18]Barredo Arrieta A, Díaz-Rodríguez N, Del Ser J, et al. Explainable artificial intelligence (XAI): Concepts, taxonomies, opportunities and challenges toward responsible AI[J]. Information Fusion, 2020, 58: 82-115.

[19]Zhu J, Liapis A, Risi S, et al. Explainable AI for designers: A human-centered perspective on mixed-initiative co-creation[C]//2018 IEEE Conference on Computational Intelligence and Games (CIG). Maastricht: IEEE, 2018: 1-8.

[20]Zhao W X, Zhou K, Li J, et al. A survey of large language models[EB/OL]. arXiv:2303.18223, 2023. DOI:10.48550/arXiv.2303.18223.

[21]Wei J, Wang X, Schuurmans D, et al. Chain-of-thought prompting elicits reasoning in large language models[J]. Advances in Neural Information Processing Systems, 2022, 35: 24824-24837.

[22]Wang X, Wei J, Schuurmans D, et al. Self-consistency improves chain of thought reasoning in language models[C]//The Eleventh International Conference on Learning Representations. 2023.

[23]Yao S, Yu D, Zhao J, et al. Tree of thoughts: Deliberate problem solving with large language models[J]. Advances in Neural Information Processing Systems, 2023, 36: 11809-11822.

[24]Yao S, Zhao J, Yu D, et al. ReAct: Synergizing reasoning and acting in language models[C]//The Eleventh International Conference on Learning Representations. 2023.

[25]Shinn N, Cassano F, Gopinath A, et al. Reflexion: Language agents with verbal reinforcement learning[J]. Advances in Neural Information Processing Systems, 2023, 36: 8634-8652.

[26]Madaan A, Tandon N, Gupta P, et al. Self-Refine: Iterative refinement with self-feedback[J]. Advances in Neural Information Processing Systems, 2023, 36: 46534-46594.

[27]Liu Y, Yao Y, Ton J-F, et al. Trustworthy LLMs: A survey and guideline for evaluating large language models’ alignment[EB/OL]. arXiv:2308.05374, 2024. DOI:10.48550/arXiv.2308.05374.

[28]Wang Y, Zhong W, Li L, et al. Aligning large language models with human: A survey[EB/OL]. arXiv:2307.12966, 2023. DOI:10.48550/arXiv.2307.12966.

[29]Chen S, Liu Y, Han W, et al. A survey on LLM-based multi-agent system: Recent advances and new frontiers in application[EB/OL]. arXiv:2412.17481, 2025. DOI:10.48550/arXiv.2412.17481.

[30]Guo T, Chen X, Wang Y, et al. Large language model based multi-agents: A survey of progress and challenges[C]//Thirty-Third International Joint Conference on Artificial Intelligence. 2024: 8048-8057.

[31]Luo J, Zhang W, Yuan Y, et al. Large language model agent: A survey on methodology, applications and challenges[EB/OL]. arXiv:2503.21460, 2025. DOI:10.48550/arXiv.2503.21460.

[32]Huang X, Liu W, Chen X, et al. Understanding the planning of LLM agents: A survey[EB/OL]. arXiv:2402.02716, 2024. DOI:10.48550/arXiv.2402.02716.

[33]Liu Z, Bai X, Chen K, et al. A survey on the feedback mechanism of LLM-based AI agents[C]//Thirty-Fourth International Joint Conference on Artificial Intelligence. 2025: 10582-10592.

[34]Qu C, Dai S, Wei X, et al. Tool learning with large language models: A survey[J]. Frontiers of Computer Science, 2025, 19(8): 198343.

[35]Li G, Hammoud H, Itani H, et al. CAMEL: Communicative agents for “mind” exploration of large language model society[J]. Advances in Neural Information Processing Systems, 2023, 36: 51991-52008.

[36]Wu Q, Bansal G, Zhang J, et al. AutoGen: Enabling next-gen LLM applications via multi-agent conversations[C]//First Conference on Language Modeling. 2024.

[37]Hong S, Zhuge M, Chen J, et al. MetaGPT: Meta programming for a multi-agent collaborative framework[C]//The Twelfth International Conference on Learning Representations. 2024.

[38]Fourney A, Bansal G, Mozannar H, et al. Magentic-One: A generalist multi-agent system for solving complex tasks[EB/OL]. 2024. Available: https://www.microsoft.com/en-us/research/publication/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/

[39]Park J S, O’Brien J, Cai C J, et al. Generative agents: Interactive simulacra of human behavior[C]//Proceedings of the 36th Annual ACM Symposium on User Interface Software and Technology. 2023: 1-22.

[40]Qian C, Liu W, Liu H, et al. ChatDev: Communicative agents for software development[C]//Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers). Bangkok, Thailand: Association for Computational Linguistics, 2024: 15174-15186.

[41]Chan C-M, Chen W, Su Y, et al. ChatEval: Towards better LLM-based evaluators through multi-agent debate[EB/OL]. arXiv:2308.07201, 2023. DOI:10.48550/arXiv.2308.07201.

[42]Amirkhani A, Barshooi A H. Consensus in multi-agent systems: A review[J]. Artificial Intelligence Review, 2022, 55(5): 3897-3935.

[43]Gao Y, Xiong Y, Gao X, et al. Retrieval-augmented generation for large language models: A survey[EB/OL]. arXiv:2312.10997, 2024. DOI:10.48550/arXiv.2312.10997.

[44]Jiang Z, Xu F, Gao L, et al. Active retrieval augmented generation[C]//Proceedings of the 2023 Conference on Empirical Methods in Natural Language Processing. Singapore: Association for Computational Linguistics, 2023: 7969-7992.

[45]Singh A, Ehtesham A, Kumar S, et al. Agentic retrieval-augmented generation: A survey on agentic RAG[EB/OL]. arXiv:2501.09136, 2025. DOI:10.48550/arXiv.2501.09136.

[46]Pan J Z, Razniewski S, Kalo J-C, et al. Large language models and knowledge graphs: Opportunities and challenges[J]. Transactions on Graph Data and Knowledge, 2023, 1(1): 2:1-2:38.

[47]Jin B, Xie C, Zhang J, et al. Graph chain-of-thought: Augmenting large language models by reasoning on graphs[C]//Findings of the Association for Computational Linguistics: ACL 2024. Bangkok, Thailand: Association for Computational Linguistics, 2024: 163-184.

[48]Besta M, Blach N, Kubicek A, et al. Graph of thoughts: Solving elaborate problems with large language models[J]. Proceedings of the AAAI Conference on Artificial Intelligence, 2024, 38(16): 17682-17690.

[49]Lundberg S M, Lee S-I. A unified approach to interpreting model predictions[C]//Advances in Neural Information Processing Systems. 2017, 30.

[50]Ribeiro M T, Singh S, Guestrin C. “Why should I trust you?”: Explaining the predictions of any classifier[C]//Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining. 2016: 1135-1144.

[51]Suh S, Min B, Palani S, et al. Sensecape: Enabling multilevel exploration and sensemaking with large language models[C]//Proceedings of the 36th Annual ACM Symposium on User Interface Software and Technology. 2023: 1-18.
