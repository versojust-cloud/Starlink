# Literature Review Notes

## Topic

Research and Implementation of a Generative Business Canvas System Based on Multi-Agent Collaborative Reasoning

## Purpose

This file records the current literature investigation results for the thesis literature review. The notes are organized around the planned review structure and focus on the papers that most directly support the thesis argument.

Planned review structure:

1. Introduction
2. Datasets and Evaluation Metrics
3. Current Research Status
4. Discussion
5. Summary

## Working Conclusions

The current investigation supports five stable claims:

1. Existing business and finance benchmarks show that domain tasks require evidence grounding, numerical reasoning, and multi-step logic rather than generic open-domain QA.
2. Explainable decision support literature already treats transparency and trust as central system requirements, but most work still explains results after inference instead of externalizing the reasoning process itself.
3. Large language model reasoning literature has established a relatively clear methodological line from prompting to search-style reasoning and self-correction, but reliability in vertical business scenarios remains insufficient.
4. Multi-agent research already supports role specialization, communication, planning, feedback, and tool use, but rarely exposes collaborative reasoning to end users in a visible and editable form.
5. RAG, knowledge graph reasoning, and visual analytics provide the strongest theoretical basis for a business canvas system: knowledge augmentation improves credibility, graph reasoning structures the process, and canvas interaction makes the process visible and controllable.

## Batch 1: Core Papers Read in More Detail

### 1. Explainable Artificial Intelligence-Based Decision Support Systems: A Recent Review

Source: https://www.mdpi.com/2079-9292/13/14/2842

Use in review:
- Section 3.1 Business Decision Support Systems
- Section 4 Discussion

Key value:
- Reviews explainable decision support systems from the DSS perspective rather than from a generic XAI perspective.
- Provides a taxonomy of XDSS approaches and application contexts.
- Strongly supports the claim that trust, transparency, and interpretability are core DSS requirements.

How it helps the thesis:
- Shows that current DSS research is moving from "supporting decisions" to "supporting understandable decisions".
- Creates a bridge to argue that a business canvas system should not only generate recommendations, but also externalize its reasoning.

Limitation:
- Discusses explainability in DSS broadly, but does not address multi-agent reasoning or canvas-based interaction.

### 2. Explainable AI for Enhanced Decision-Making

Source: https://www.sciencedirect.com/science/article/abs/pii/S016792362400109X

Use in review:
- Section 3.1 Business Decision Support Systems
- Introduction

Key value:
- Frames explainable AI directly in relation to decision-making quality.
- Useful as a conceptual anchor for why explainability matters in business systems.

How it helps the thesis:
- Supports the argument that in business settings model performance alone is not enough; users need explainability to assess and adopt system outputs.

Limitation:
- More of an agenda-setting piece than a full system design paper.

### 3. BizBench: A Quantitative Reasoning Benchmark for Business and Finance

Source: https://aclanthology.org/2024.acl-long.452/

Use in review:
- Section 2.1 Datasets and Benchmarks
- Section 4 Discussion

Key value:
- Builds a benchmark specifically around business and finance reasoning.
- Emphasizes the combination of quantitative reasoning, domain knowledge, text, and tabular understanding.
- Organizes the benchmark into eight business and finance reasoning task types.

How it helps the thesis:
- Supports the claim that business reasoning is structurally different from generic QA.
- Helps justify why a business-oriented intelligent system requires more than ordinary language generation.

Limitation:
- Evaluates model reasoning quality at the answer level, not collaborative reasoning transparency or user intervention.

### 4. FinanceBench: A New Benchmark for Financial Question Answering

Source: https://arxiv.org/abs/2311.11944

Use in review:
- Section 2.1 Datasets and Benchmarks
- Section 3.4 Knowledge Augmentation and Graph-Based Reasoning

Key value:
- Focuses on evidence-grounded financial QA over real company filings.
- Includes over ten thousand questions with associated evidence strings.

How it helps the thesis:
- Supports the need for evidence-grounded reasoning in vertical business scenarios.
- Strengthens the argument for retrieval and document-based support in business analysis systems.

Limitation:
- Focuses on financial QA rather than broader decision support or visual reasoning interaction.

### 5. FinanceReasoning: Benchmarking Financial Numerical Reasoning More Credible, Comprehensive and Challenging

Source: https://aclanthology.org/2025.acl-long.766/

Use in review:
- Section 2.1 Datasets and Benchmarks
- Section 4 Discussion

Key value:
- Pushes the benchmark emphasis from financial QA toward credible numerical reasoning.
- Highlights the difficulty of multi-step financial inference.

How it helps the thesis:
- Supports the claim that business support systems must handle structured and numerical reasoning rather than only text generation.

Limitation:
- Still benchmark-centric and not designed for interactive decision support systems.

### 6. Towards Reasoning in Large Language Models: A Survey

Source: https://aclanthology.org/2023.findings-acl.67/

Use in review:
- Section 3.2 Large Language Models and Reasoning

Key value:
- Offers a clear structure for reasoning literature: methods, evaluation, benchmarks, and open problems.
- Helps organize CoT, self-consistency, search-style reasoning, and related directions.

How it helps the thesis:
- Provides the backbone for the reasoning section of the review.
- Supports a more structured discussion instead of listing isolated methods.

Limitation:
- Stops before much of the newer 2024-2025 agent and graph reasoning literature.

### 7. Trustworthy LLMs: a Survey and Guideline for Evaluating Large Language Models' Alignment

Source: https://arxiv.org/abs/2308.05374

Use in review:
- Section 3.2 Large Language Models and Reasoning
- Section 4.1 The Issues

Key value:
- Breaks trustworthiness into multiple dimensions such as reliability, safety, fairness, robustness, and explainability.

How it helps the thesis:
- Supports the argument that business systems need broader trust criteria than answer correctness alone.

Limitation:
- General LLM survey, not business-specific.

### 8. Large Language Model Based Multi-agents: A Survey of Progress and Challenges

Source: https://www.ijcai.org/proceedings/2024/890

Use in review:
- Section 3.3 Multi-Agent Collaborative Reasoning

Key value:
- Organizes multi-agent literature by scenario, agent profiling, communication, and capability development.
- Helps frame multi-agent systems as structured collaborative architectures rather than simple multi-turn chats.

How it helps the thesis:
- Provides the main survey foundation for the multi-agent section.
- Supports the claim that role specialization and communication are central to complex task solving.

Limitation:
- Does not deeply address visual reasoning interfaces or business-facing interaction.

### 9. CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society

Source: https://arxiv.org/abs/2303.17760

Use in review:
- Section 3.3 Multi-Agent Collaborative Reasoning

Key value:
- Emphasizes role-playing, communication protocol, and intent alignment.
- Demonstrates that expert-like role division can be operationalized in LLM collaboration.

How it helps the thesis:
- Directly supports the idea of assigning business-specific roles such as analyst, planner, and reviewer.

Limitation:
- Does not include business evidence grounding or user-facing process visualization.

### 10. AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation Framework

Source: https://arxiv.org/abs/2308.08155

Use in review:
- Section 3.3 Multi-Agent Collaborative Reasoning
- System design motivation

Key value:
- Provides a practical framework for conversable, customizable, and tool-enabled agents.

How it helps the thesis:
- Useful for explaining the backend orchestration idea behind a collaborative reasoning system.

Limitation:
- Focuses on framework capability more than business decision support scenarios.

### 11. Retrieval-Augmented Generation for Large Language Models: A Survey

Source: https://arxiv.org/abs/2312.10997

Use in review:
- Section 3.4 Knowledge Augmentation and Graph-Based Reasoning

Key value:
- Organizes RAG into naive, advanced, and modular paradigms.
- Helps separate retrieval, augmentation, and generation concerns.

How it helps the thesis:
- Supports the argument that knowledge augmentation is a structural component of a reliable business system.

Limitation:
- Broad RAG survey, not business-specific.

### 12. Graph Chain-of-Thought: Augmenting Large Language Models by Reasoning on Graphs

Source: https://aclanthology.org/2024.findings-acl.11/

Use in review:
- Section 3.4 Knowledge Augmentation and Graph-Based Reasoning
- Section 3.5 Visual Analytics and Canvas-Based Interaction

Key value:
- Treats graph structure not just as stored knowledge, but as an active reasoning substrate.
- Introduces a graph reasoning benchmark and decomposes the reasoning process into multiple graph-related stages.

How it helps the thesis:
- Strongly supports the transition from linear dialogue to graph-structured reasoning and canvas-style externalization.

Limitation:
- Focuses on graph-enhanced reasoning, not interactive business analysis interfaces.

## Batch 2: Additional Papers Focused on Visual Analytics, Canvas, and Evaluation

### 1. BI-Bench: A Comprehensive Benchmark Dataset and Unsupervised Evaluation for BI Systems

Source: https://aclanthology.org/2025.acl-industry.90/

Use in review:
- Section 2.1 Datasets and Benchmarks
- Section 4 Discussion

Key value:
- Moves evaluation from simple answer matching to BI-style insight generation.
- Organizes tasks into descriptive, diagnostic, predictive, and prescriptive forms.
- Includes evaluation dimensions such as factual correctness, answerability, relevance, and presentation.

How it helps the thesis:
- Strongly supports the idea that business systems must be evaluated by insight quality and presentation, not only by answer correctness.

Limitation:
- Still does not cover collaborative reasoning transparency or user intervention on a canvas.

### 2. Visual Analytics for Machine Learning: A Data Perspective Survey

Source: https://pubmed.ncbi.nlm.nih.gov/38261496/

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction

Key value:
- Frames visual analytics as a process for understanding, diagnosing, and improving ML systems.
- Synthesizes a large body of VIS4ML work from a data-centered perspective.

How it helps the thesis:
- Supports the argument that visualization should be treated as an analysis and intervention layer, not as static result display.

Limitation:
- General visual analytics survey rather than a business or agent-specific paper.

### 3. State of the Art of Visual Analytics for eXplainable Deep Learning

Source: https://doi.org/10.1111/cgf.14733

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction

Key value:
- Shows that visual explanation is a central way to make model behavior understandable.
- Useful for arguing that explainability is partly an interface problem.

How it helps the thesis:
- Supports the move from textual explanation to visual explanation in intelligent systems.

Limitation:
- Focuses on deep learning explainability, not business decision support or LLM collaboration.

### 4. Survey of User Interface Design and Interaction Techniques in Generative AI Applications

Source: https://arxiv.org/abs/2410.22370

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction

Key value:
- Builds a taxonomy of interaction patterns in generative AI applications.
- Important evidence against treating chat interfaces as the default or only form of generative interaction.

How it helps the thesis:
- Supports the claim that complex generative systems benefit from richer workspaces than simple chat windows.

Limitation:
- Broad HCI survey, not focused on business decision support.

### 5. Business-to-Analytics Canvas

Source: https://www.sciencedirect.com/science/article/pii/S2212827122007478

Use in review:
- Section 3.1 Business Decision Support Systems
- Section 3.5 Visual Analytics and Canvas-Based Interaction

Key value:
- Provides a way to translate business use cases into concrete analytics tasks.
- Treats the canvas as a communication and structuring device between roles.

How it helps the thesis:
- Gives a concrete research lineage for the use of a business canvas in analytical systems.

Limitation:
- Does not include LLMs, multi-agent reasoning, or knowledge grounding.

### 6. Analytics Canvas: A Framework for the Design and Specification of Data Analytics Projects

Source: https://www.sciencedirect.com/science/article/pii/S2212827118301549

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction

Key value:
- Proposes a semi-formal specification structure for analytics projects.
- Emphasizes cross-role communication and early-stage structuring.

How it helps the thesis:
- Useful as the conceptual predecessor of an AI-driven business canvas.

Limitation:
- Focuses on project design, not intelligent reasoning.

### 7. A Methodology to Guide Companies in Using Explainable AI-driven Interfaces in Manufacturing Contexts

Source: https://www.sciencedirect.com/science/article/pii/S1877050924003053

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction
- Section 4.1 The Issues

Key value:
- Emphasizes that explainable interface design should depend on user role and use context.
- Explicitly treats human oversight and control as design concerns.

How it helps the thesis:
- Supports the argument that explanation interfaces must be designed, not appended as an afterthought.

Limitation:
- Focused on manufacturing contexts rather than business strategy analysis.

### 8. Towards Visual Analytics for Explainable AI in Industrial Applications

Source: https://www.mdpi.com/2813-2203/4/1/7

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction
- Section 4 Discussion

Key value:
- Proposes a conceptual framework for analyzing and designing explainable AI interfaces in industrial settings.
- Covers dimensions such as visual encoding, interaction, UI/UX, and decision support.

How it helps the thesis:
- Supports the claim that visual analytics interfaces should be studied as system workflows, not only as chart choices.

Limitation:
- Still focused more on industrial explainability than on generative, collaborative reasoning.

### 9. Evaluation of Retrieval-Augmented Generation: A Survey

Source: https://arxiv.org/abs/2405.07437

Use in review:
- Section 2.2 Evaluation Metrics
- Section 4.1 The Issues

Key value:
- Organizes RAG evaluation into retrieval-side and generation-side dimensions.
- Useful for discussing relevance, faithfulness, grounding, and answer quality together.

How it helps the thesis:
- Strengthens the evaluation section by showing that correctness alone is not enough for knowledge-enhanced systems.

Limitation:
- Focuses on RAG evaluation, not business task success or interaction quality.

### 10. Survey on Evaluation of LLM-based Agents

Source: https://arxiv.org/abs/2503.16416

Use in review:
- Section 2.2 Evaluation Metrics
- Section 4.2 Future Research Directions

Key value:
- Expands evaluation from output-level metrics to capability-level metrics, including planning, memory, tool use, and collaboration.

How it helps the thesis:
- Helps justify why multi-agent systems need richer evaluation criteria such as planning quality, coordination stability, and cost-efficiency.

Limitation:
- General agent evaluation survey, not specialized to business decision support.

## Additional Synthesis for the Planned Review

### What Section 2 Can Now Reliably Argue

Section 2 can now make three concrete arguments:

1. There is no single unified benchmark for generative business canvas systems.
2. Existing evaluation relies on a combination of business and finance benchmarks, BI benchmarks, and self-constructed case sets.
3. Metrics should cover not only correctness, but also grounding, insight quality, planning quality, presentation, and user-centered usefulness.

### What Section 3.5 Can Now Reliably Argue

Section 3.5 can now make four concrete arguments:

1. Visual analytics is an analysis and intervention mechanism rather than a pure display mechanism.
2. Explainable interfaces need to be adapted to user roles, tasks, and workflow needs.
3. Canvas-based structures already exist in analytics design literature as communication and task-structuring tools.
4. What is still missing is the integration of multi-agent collaborative reasoning with a business canvas that users can inspect and modify.

### Current Gaps Identified Across the Readings

1. Benchmark work evaluates answers and insights, but rarely evaluates reasoning transparency.
2. Explainable DSS literature values trust and interpretability, but does not yet fully support visible multi-step generative reasoning.
3. Multi-agent work has strong backend collaboration models, but weak frontend process externalization.
4. Canvas and visual analytics work supports structured analytical thinking, but rarely incorporates agentic knowledge-grounded generation.

## Batch 3: Deeper Notes on BI Evaluation, Canvas, and Visual Reasoning Workflows

### 1. BI-Bench: A Comprehensive Benchmark Dataset and Unsupervised Evaluation for BI Systems

Source: https://aclanthology.org/2025.acl-industry.90/

Authors:
- Ankush Gupta
- Aniya Aggarwal
- Shivangi Bithel
- Arvind Agarwal

Use in review:
- Section 2.1 Datasets and Benchmarks
- Section 2.2 Evaluation Metrics
- Section 4.1 The Issues

Detailed notes:
- The benchmark explicitly targets Business Intelligence systems rather than generic QA systems.
- It categorizes user queries into descriptive, diagnostic, predictive, and prescriptive classes, which aligns closely with real business analysis workflows.
- Its evaluation emphasis is broader than answer correctness alone. It assesses quality, relevance, depth, and presentation of generated BI outputs.
- The paper also introduces an automated evaluation pipeline that reduces reliance on strict ground-truth answers.

How it strengthens the thesis:
- Strong evidence that business-oriented intelligent systems should be assessed through insight quality and analytical usefulness, not only by exact answer matching.
- Provides direct support for the idea that a business canvas system should be judged on how well it organizes and presents reasoning.

Remaining limitation:
- The benchmark still evaluates output quality, not the visibility, controllability, or editability of the intermediate reasoning process.

### 2. FinanceReasoning: Benchmarking Financial Numerical Reasoning More Credible, Comprehensive and Challenging

Source: https://aclanthology.org/2025.acl-long.766/

Authors:
- Zichen Tang
- Haihong E
- Ziyan Ma
- Haoyang He
- Jiacheng Liu
- Zhongjun Yang
- Zihua Rong
- Rongjin Li
- Kun Ji
- Qing Huang
- Xinyang Hu
- Yang Liu
- Qianhe Zheng

Use in review:
- Section 2.1 Datasets and Benchmarks
- Section 2.2 Evaluation Metrics
- Section 4.1 The Issues

Detailed notes:
- The benchmark is designed specifically for large reasoning models in financial numerical reasoning.
- The ACL summary highlights three major contributions: credibility, comprehensiveness, and challenge level.
- It updates and refines questions from public datasets and adds detailed Python solutions, which makes evaluation more reliable and reproducible.
- It also emphasizes broader coverage of financial concepts and formulas than earlier datasets.

How it strengthens the thesis:
- Supports the claim that business and finance tasks require explicit multi-step numerical reasoning.
- Useful for arguing that many business analysis tasks cannot be handled by text generation alone.

Remaining limitation:
- It remains benchmark-centric and does not model business interaction or collaborative analysis workflows.

### 3. Business-to-Analytics Canvas

Source: https://www.sciencedirect.com/science/article/pii/S2212827122007478

Use in review:
- Section 3.1 Business Decision Support Systems
- Section 3.5 Visual Analytics and Canvas-Based Interaction

Detailed notes:
- The paper asks a practical question: how can business goals or use cases be translated into realizable analytics tasks.
- It proposes the Business-to-Analytics Canvas as the result of an action design research process.
- The canvas is explicitly intended to help product managers and data scientists reach a common understanding and map business goals to analytics task classes.
- It uses guiding questions and structured information elements to support translation from business need to analytics approach.

How it strengthens the thesis:
- Very strong conceptual support for using a canvas as a structured bridge between business intent and analytical implementation.
- Shows that canvas-based analytical structuring already has a research lineage in business and product planning.

Remaining limitation:
- The canvas supports requirement translation, not intelligent reasoning or multi-agent collaboration.

### 4. Analytics Canvas: A Framework for the Design and Specification of Data Analytics Projects

Source: https://www.sciencedirect.com/science/article/pii/S2212827118301549

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction
- Section 4.2 Future Research Directions

Detailed notes:
- The paper proposes a semi-formal specification technique for analytics projects.
- It emphasizes early planning, stakeholder roles, and interdisciplinary communication.
- The canvas uses an intuitive visual representation and five layers to structure the problem space.

How it strengthens the thesis:
- Supports the argument that canvas-based representations are useful for structuring complex analytical projects before implementation.
- Helps position the proposed business canvas as an extension of an already established analytics-canvas tradition.

Remaining limitation:
- Does not involve AI reasoning, explainability, or dynamic interaction with generated analytical content.

### 5. Visual Analytics for Machine Learning: A Data Perspective Survey

Source: https://pubmed.ncbi.nlm.nih.gov/38261496/

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction
- Section 4.1 The Issues

Detailed notes:
- The survey synthesizes 143 papers and organizes the literature by data type and data-centric analytical task.
- The paper treats visual analytics as a workflow for understanding, diagnosing, and improving ML systems.
- It shows that visualization can serve analytical and intervention purposes, not only presentation purposes.

How it strengthens the thesis:
- Strong evidence that a visual canvas should be treated as an analytical workspace rather than a display layer.
- Supports the claim that process visibility is central in intelligent systems.

Remaining limitation:
- The survey is broad and general to ML, not specifically focused on business decision support or generative AI interfaces.

### 6. State of the Art of Visual Analytics for eXplainable Deep Learning

Source: https://doi.org/10.1111/cgf.14733

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction

Detailed notes:
- Focuses on how visual analytics supports explainability for deep learning systems.
- Important because it treats explanation as a combination of model behavior and interface representation.
- Also useful for showing that different users require different explanatory views.

How it strengthens the thesis:
- Supports the argument that explainability should be operationalized visually, not only verbally.

Remaining limitation:
- Focuses on deep learning explainability rather than LLM-based collaborative reasoning.

### 7. Survey of User Interface Design and Interaction Techniques in Generative AI Applications

Source: https://arxiv.org/abs/2410.22370

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction
- Section 4.2 Future Research Directions

Detailed notes:
- The survey builds a taxonomy of interaction techniques in generative AI systems.
- Its core contribution is that it centers user-guided interaction patterns rather than treating generation as one-shot system output.
- This is valuable for moving beyond the assumption that generative AI systems should be chat-first.

How it strengthens the thesis:
- Supports the claim that richer interaction forms are appropriate for complex AI applications.
- Helps justify why a business canvas is a legitimate interaction paradigm for generative business analysis.

Remaining limitation:
- It is broad HCI literature rather than business-specific system research.

### 8. A Methodology to Guide Companies in Using Explainable AI-driven Interfaces in Manufacturing Contexts

Source: https://www.sciencedirect.com/science/article/pii/S1877050924003053

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction
- Section 4.1 The Issues

Detailed notes:
- The work proposes a structured methodology that maps user needs to suitable explainability visualization types.
- It stresses human oversight and role-sensitive interface design.

How it strengthens the thesis:
- Shows that explanation interfaces should be matched to user role and context.
- Supports a human-in-the-loop understanding of intelligent analytical systems.

Remaining limitation:
- Domain is manufacturing, and the work does not involve agent-based reasoning.

### 9. Towards Visual Analytics for Explainable AI in Industrial Applications

Source: https://www.mdpi.com/2813-2203/4/1/7

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction
- Section 4 Discussion

Detailed notes:
- The article proposes a conceptual framework for designing and evaluating visual analytics for explainable AI in industrial settings.
- It reviews cases along dimensions such as visual encoding, interaction, UI/UX, monitoring, and decision support.
- The human-centered framing is particularly important.

How it strengthens the thesis:
- Strong support for discussing business canvas systems as both interaction systems and analytical systems.

Remaining limitation:
- Still focused on explainable AI interfaces more broadly, not specifically on collaborative generative business reasoning.

### 10. Evaluation of Retrieval-Augmented Generation: A Survey

Source: https://arxiv.org/abs/2405.07437

Use in review:
- Section 2.2 Evaluation Metrics
- Section 3.4 Knowledge Augmentation and Graph-Based Reasoning

Detailed notes:
- The paper distinguishes retrieval-side and generation-side evaluation concerns.
- Useful metric dimensions include relevance, faithfulness, grounding, and output correctness.
- Very useful for broadening the evaluation section beyond answer accuracy.

How it strengthens the thesis:
- Supports the point that business reasoning systems with knowledge augmentation should be evaluated for grounding and faithfulness, not only correctness.

Remaining limitation:
- The survey does not include interaction or visualization metrics.

### 11. Survey on Evaluation of LLM-based Agents

Source: https://arxiv.org/abs/2503.16416

Use in review:
- Section 2.2 Evaluation Metrics
- Section 4.2 Future Research Directions

Detailed notes:
- Organizes evaluation around fundamental capabilities, application-specific benchmarks, generalist benchmarks, and frameworks.
- Broadens evaluation beyond outputs to planning, tool use, memory, self-reflection, and coordination.

How it strengthens the thesis:
- Supports a multi-dimensional evaluation framework for a multi-agent business canvas system.

Remaining limitation:
- Still general-purpose and not specialized to business decision support.

## Updated Review-Level Conclusions

After the third batch of readings, three additional conclusions can now be stated with confidence:

1. BI research is already moving toward evaluating insight quality, relevance, depth, and presentation, which supports a broader evaluation strategy for business analysis systems.
2. Canvas-oriented analytical frameworks already exist for translating business goals into analytics tasks, which gives the proposed business canvas a clear research lineage instead of making it look like a purely interface-level invention.
3. Current visual analytics and explainable interface studies support interaction, interpretation, and monitoring, but they are still weakly integrated with multi-agent collaborative reasoning and knowledge-grounded generation.

## Batch 4: Deeper Notes on Planning, Feedback, Tool Use, Agentic RAG, and Dashboard-Oriented Decision Support

### 1. Understanding the Planning of LLM Agents: A Survey

Source: https://arxiv.org/abs/2402.02716

Use in review:
- Section 3.3 Multi-Agent Collaborative Reasoning
- Section 4.2 Future Research Directions

Detailed notes:
- The survey explicitly focuses on planning as a distinct capability of LLM agents.
- It organizes the literature into five directions: task decomposition, plan selection, external module, reflection, and memory.
- This is especially valuable because it separates planning from generic generation and treats it as a design problem for agent systems.

How it strengthens the thesis:
- Supports the argument that collaborative business reasoning should be designed around planning mechanisms rather than simple response generation.
- Helps structure the discussion of agent workflows in the thesis.

Remaining limitation:
- It is planning-focused and does not address visual process externalization for users.

### 2. A Survey on the Feedback Mechanism of LLM-based AI Agents

Source: https://www.ijcai.org/proceedings/2025/1175

Use in review:
- Section 3.3 Multi-Agent Collaborative Reasoning
- Section 2.2 Evaluation Metrics
- Section 4.1 The Issues

Detailed notes:
- The survey categorizes agent feedback into four types: internal feedback, external feedback, multi-agent feedback, and human feedback.
- It also discusses evaluation protocols and benchmarks for LLM-based agents.
- This is important because feedback is one of the main mechanisms through which collaborative reasoning improves over one-shot generation.

How it strengthens the thesis:
- Strong support for explaining why multi-agent systems can improve reasoning reliability through iterative correction and cross-checking.
- Useful for framing a business canvas system as not only a generation system, but also a feedback-driven analytical system.

Remaining limitation:
- The survey is broad and does not specialize in business decision support scenarios.

### 3. Tool Learning with Large Language Models: A Survey

Source: https://journal.hep.com.cn/fcs/EN/10.1007/s11704-024-40678-2

Use in review:
- Section 3.3 Multi-Agent Collaborative Reasoning
- Section 4.2 Future Research Directions

Detailed notes:
- The survey explains both why tool learning matters and how it is implemented.
- It organizes tool learning into four workflow stages: task planning, tool selection, tool calling, and response generation.
- It also summarizes benchmarks and evaluation methods mapped to these stages.

How it strengthens the thesis:
- Supports the claim that intelligent business systems should not rely only on parametric model reasoning, but should be able to use external tools and services.
- Helps connect multi-agent orchestration to practical capabilities such as retrieval, browsing, or structured computation.

Remaining limitation:
- Tool learning is discussed generally and not specifically in business analysis contexts.

### 4. Magentic-One: A Generalist Multi-Agent System for Solving Complex Tasks

Source: https://www.microsoft.com/en-us/research/publication/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/

Use in review:
- Section 3.3 Multi-Agent Collaborative Reasoning
- Section 4.2 Future Research Directions

Detailed notes:
- The system is built around an Orchestrator that plans, tracks progress, and replans to recover from errors.
- The Orchestrator coordinates specialized agents such as browser, terminal, file, and coding agents.
- The article explicitly highlights recovery from errors and modular extensibility as key design goals.
- It also reports competitive performance on three agentic benchmarks: GAIA, AssistantBench, and WebArena.

How it strengthens the thesis:
- Provides a concrete example of how a multi-agent system can centralize planning while delegating execution to specialized subagents.
- Useful for motivating an architecture where one coordinating layer manages role-specialized analytical agents.

Remaining limitation:
- It is a generalist agentic system, not designed for business reasoning or canvas-based interaction.

### 5. Knowledge Graph-Enhanced Large Language Models via Path Selection

Source: https://aclanthology.org/2024.findings-acl.376/

Use in review:
- Section 3.4 Knowledge Augmentation and Graph-Based Reasoning
- Section 4.1 The Issues

Detailed notes:
- The paper starts from the observation that many KG-enhanced LLM methods rely on the LLM itself to decide which knowledge to use.
- It argues this is inflexible because LLMs tend to select only directly related semantic knowledge and may ignore useful indirect paths.
- The key contribution is path selection as a more structured way to choose KG knowledge before generation.

How it strengthens the thesis:
- Strong evidence that graph-based external knowledge should be filtered and structured rather than injected naïvely.
- Helps support a more rigorous account of how knowledge augmentation can improve factuality and reasoning depth in business systems.

Remaining limitation:
- Focuses on knowledge selection for generation, not on how that selected path is presented to users in an interactive interface.

### 6. Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG

Source: https://arxiv.org/abs/2501.09136

Use in review:
- Section 3.4 Knowledge Augmentation and Graph-Based Reasoning
- Section 4.2 Future Research Directions

Detailed notes:
- The survey contrasts traditional RAG with Agentic RAG.
- It argues that static RAG workflows are insufficient for multistep reasoning and complex task management.
- The key idea is that agents introduce reflection, planning, tool use, and multi-agent collaboration into the retrieval-generation pipeline.
- It also discusses applications in healthcare, finance, and education.

How it strengthens the thesis:
- Very useful for showing the conceptual bridge between RAG and multi-agent systems.
- Supports the argument that retrieval in business analysis should be adaptive and workflow-aware rather than fixed.

Remaining limitation:
- Still a survey of architectures rather than an interactive business system study.

### 7. Organizational Decision Making and Analytics: An Experimental Study on Dashboard Visualizations

Source: https://www.sciencedirect.com/science/article/pii/S0378720624000934

Use in review:
- Section 3.1 Business Decision Support Systems
- Section 3.5 Visual Analytics and Canvas-Based Interaction
- Section 4.1 The Issues

Detailed notes:
- The paper experimentally studies how dashboard visualizations affect decision quality.
- It finds that format, currency, and completeness of information indirectly affect decision-making quality by reducing perceived task complexity and increasing information satisfaction.
- This makes dashboards an important baseline when discussing interfaces for decision support.

How it strengthens the thesis:
- Supports the claim that interface design materially affects decision quality.
- Provides a strong comparison point for arguing that canvas-based systems should be evaluated not only aesthetically but in terms of analytical effectiveness.

Remaining limitation:
- Dashboards mainly support static visual summarization rather than explicit reasoning structure or editable analytical paths.

### 8. A Methodology to Guide Companies in Using Explainable AI-driven Interfaces in Manufacturing Contexts

Source: https://www.sciencedirect.com/science/article/pii/S1877050924003053

Use in review:
- Section 3.5 Visual Analytics and Canvas-Based Interaction
- Section 4.1 The Issues

Additional note from closer reading:
- The paper explicitly reports that the proposed methodology helps identify explainability visualization types that fit end-user requirements in context.
- It concludes that correct implementation of XAI models requires preserving human oversight and control.

How it strengthens the thesis:
- Reinforces a central theme of the review: the interface layer should be designed to support understanding, trust, and control.

### 9. Cross-paper synthesis for planning, feedback, and tool use

These papers collectively support a more precise statement for the literature review:

- Planning is now treated as a first-class capability in LLM agents rather than an incidental side effect of prompting.
- Feedback is one of the main mechanisms through which agent systems improve reliability, and it can come from the self, the environment, other agents, or humans.
- Tool use introduces a practical bridge between language reasoning and operational capability.

Together, they justify writing the multi-agent section not merely as a list of frameworks, but as a process architecture built from planning, coordination, feedback, and tool invocation.

### 10. Cross-paper synthesis for dashboards, BI, and explainable interfaces

These papers support a second precise statement:

- Dashboards and BI systems improve decision quality through information representation.
- Explainable interfaces improve trust through role-sensitive visualization and human oversight.
- Canvas-like representations improve structured communication and analytical specification.

Together, these findings support a strong review argument: the next step beyond dashboards is not simply better charts, but interactive analytical workspaces where reasoning structure becomes visible and editable.

## Batch 5: Source-Grounded Refinements for Planning, Agentic RAG, and Dashboard Comparison

### 1. Understanding the Planning of LLM Agents: A Survey

Source: https://arxiv.org/abs/2402.02716

Source-grounded observation:
- The abstract explicitly describes this work as the first systematic view of LLM-agent planning.
- It categorizes planning-related work into five directions: task decomposition, plan selection, external module, reflection, and memory.

Why this matters for the review:
- This provides a clean analytical structure for the planning subsection.
- It supports an objective claim that planning is already treated as a distinct design problem in agent systems, not merely as a side effect of prompting.

Review implication:
- When writing the multi-agent section, planning should be treated as one of the key architectural capabilities of collaborative reasoning systems.

### 2. A Survey on the Feedback Mechanism of LLM-based AI Agents

Source: https://www.ijcai.org/proceedings/2025/1175

Source-grounded observation:
- The IJCAI abstract explicitly classifies feedback into four types: internal feedback, external feedback, multi-agent feedback, and human feedback.
- It also states that the paper covers evaluation protocols and benchmarks tailored to LLM-based agents.

Why this matters for the review:
- This is direct evidence that feedback should be discussed as a formal mechanism for improving agent performance.
- It also helps justify a broader evaluation discussion that goes beyond answer correctness.

Review implication:
- The multi-agent section should discuss feedback as an explicit coordination and reliability mechanism.
- The evaluation section should mention that agent quality is tied to iterative correction, not just first-pass output quality.

### 3. Tool Learning with Large Language Models: A Survey

Source: https://journal.hep.com.cn/fcs/EN/10.1007/s11704-024-40678-2

Source-grounded observation:
- The abstract explicitly divides tool learning into two major questions: why tool learning is useful and how it is implemented.
- The implementation side is organized into four stages: task planning, tool selection, tool calling, and response generation.
- The survey also states that benchmarks and evaluation methods are summarized according to those stages.

Why this matters for the review:
- This gives a precise way to explain that tool use is not a monolithic capability.
- It supports the argument that external tools can be systematically integrated into agent workflows.

Review implication:
- Tool use in a business system should be discussed as a workflow capability that connects reasoning with retrieval, computation, and external services.

### 4. Magentic-One: A Generalist Multi-Agent System for Solving Complex Tasks

Source: https://www.microsoft.com/en-us/research/publication/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/

Source-grounded observation:
- The Microsoft Research page states that Magentic-One uses a lead agent called the Orchestrator.
- The Orchestrator plans, tracks progress, and re-plans to recover from errors.
- It coordinates specialized agents that can browse the web, navigate files, or write and execute Python code.
- The page also reports competitive performance on GAIA, AssistantBench, and WebArena.

Why this matters for the review:
- This is a concrete example of an architecture in which planning and error recovery are centralized while execution is specialized.
- It supports the practical feasibility of role-specialized multi-agent system design.

Review implication:
- In the review, Magentic-One can be used to show that modern multi-agent systems are moving from simple dialogue orchestration toward generalist but structured coordination.
- It also supports the thesis idea of using a coordinating layer for multiple business analysis agents.

### 5. Knowledge Graph-Enhanced Large Language Models via Path Selection

Source: https://aclanthology.org/2024.findings-acl.376/

Source-grounded observation:
- The ACL page states that many earlier KG-enhanced LLM methods rely on LLMs themselves to perform knowledge extraction.
- The paper criticizes this as inflexible and notes that LLMs tend to prefer directly related knowledge while missing indirectly useful paths.
- It proposes KELP, a three-stage framework, to score and select knowledge paths at finer granularity.

Why this matters for the review:
- This offers a more precise argument than simply saying "knowledge graphs help LLMs".
- It shows that the quality of external knowledge integration depends on path selection and relevance modeling.

Review implication:
- The knowledge augmentation section should explicitly distinguish between naïve knowledge injection and structured path-based knowledge selection.

### 6. Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG

Source: https://arxiv.org/abs/2501.09136

Source-grounded observation:
- The abstract explicitly contrasts Agentic RAG with traditional RAG.
- It states that traditional RAG is limited by static workflows and weak adaptability in multi-step reasoning and complex task management.
- It also states that Agentic RAG integrates reflection, planning, tool use, and multi-agent collaboration into the retrieval-generation pipeline.

Why this matters for the review:
- This gives a direct textual basis for arguing that retrieval in complex business systems should be adaptive and workflow-aware.
- It also helps connect the multi-agent literature with the RAG literature in a principled way.

Review implication:
- Agentic RAG should be presented as a bridge between knowledge grounding and collaborative reasoning, not as an isolated retrieval technique.

### 7. Organizational decision making and analytics: An experimental study on dashboard visualizations

Source: https://www.sciencedirect.com/science/article/pii/S0378720624000934

Source-grounded observation:
- The abstract reports an experiment with 524 participants and two dashboard conditions.
- It concludes that format, currency, and completeness of information indirectly improve decision quality by reducing perceived task complexity and increasing information satisfaction.

Why this matters for the review:
- This is strong empirical evidence that the visual form of analytical information affects decision quality.
- It provides a concrete baseline for comparing dashboards with richer interactive workspaces.

Review implication:
- The review can argue that while dashboards matter, they mainly improve decisions through information presentation rather than explicit reasoning externalization.
- This creates a clean contrast with the proposed business canvas idea.

### 8. A methodology to guide companies in using Explainable AI-driven interfaces in manufacturing contexts

Source: https://www.sciencedirect.com/science/article/pii/S1877050924003053

Source-grounded observation:
- The abstract explicitly states that the proposed methodology helps map user needs to suitable explainability visualization types.
- It is framed around making black-box AI more trustworthy and facilitating human-AI collaboration.

Why this matters for the review:
- It provides direct support for the claim that explainability depends on interface design choices and role-sensitive visualization.

Review implication:
- The visual interaction section should treat explainable interfaces as a system-design issue rather than a cosmetic addition.

### 9. Towards Visual Analytics for Explainable AI in Industrial Applications

Source: https://www.mdpi.com/2813-2203/4/1/7

Source-grounded observation:
- The abstract explicitly adopts a human-centered perspective.
- It argues that visual analytics and interactive visualization can advance explainability research and industrial innovation.
- It proposes a conceptual framework for visual analytics design and evaluation in these settings.

Why this matters for the review:
- It supports the argument that process visibility and interaction design are central research concerns.

Review implication:
- The review can position a business canvas system as part of a broader move from black-box automation toward human-centered analytical collaboration.

## Sharpened Review Claims After Batch 5

The source-grounded readings now support the following stronger claims:

1. Planning, feedback, and tool use are already formalized as separate capability dimensions in agent research, so the review should analyze them explicitly instead of treating them as implementation details.
2. Agentic RAG demonstrates that retrieval quality in complex tasks depends on workflow adaptation, not only on retrieving relevant passages.
3. KG-enhanced path selection shows that the usefulness of graph knowledge depends on structured selection, which is an important distinction for any business system that claims knowledge-grounded reasoning.
4. Dashboard studies show that interface quality affects decision quality, but dashboards primarily improve information presentation rather than expose reasoning structures.
5. Explainable interface studies support human oversight and role-sensitive visualization, which makes them highly relevant to the proposed canvas-based analytical workflow.

## Next Recommended Step

The next useful step is to turn these notes into the actual literature review sections:

1. Section 2 Datasets and Evaluation Metrics
2. Section 3.1 Business Decision Support Systems
3. Section 3.2 Large Language Models and Reasoning
4. Section 3.3 Multi-Agent Collaborative Reasoning
5. Section 3.4 Knowledge Augmentation and Graph-Based Reasoning
6. Section 3.5 Visual Analytics and Canvas-Based Interaction
