# Open-Source Toolkit for Building AI Agents - publication copy

Canonical article: https://qarinah.io/articles/open-source-governed-agent-toolkit/

Author: Ajnas N B

Reviewed: 2026-08-09

These drafts are publication-ready, but they have not been posted. For Medium, set the canonical URL above before publishing so search engines can identify the owned-site article as the source.

## LinkedIn

Building an AI agent is a systems-design problem, not a search for one tool that does everything.

I published a practical field guide that maps the open-source agent stack into eight engineering categories:

1. Document Processing
2. Browser Automation
3. Evaluation & Monitoring
4. Computer Use
5. Frameworks
6. Vertical Agents
7. Memory
8. Governance & Safety

The important part is the boundary between them.

A framework can run the agent loop without being the long-term memory system. OpenTelemetry can carry traces without being an evaluation backend. A policy engine can return an authorization decision without guaranteeing that every action path enforces it. Speech and vision models can perceive the world without persisting anything across sessions.

The guide links directly to official sources for projects including Docling, Unstructured, Playwright, Puppeteer, Stagehand, OpenTelemetry, Langfuse, Phoenix, Ragas, Browser Use, Cua, Microsoft UFO, LangGraph, OpenAI Agents SDK, Microsoft Agent Framework, CrewAI, OpenHands, mini-SWE-agent, Aider, Mem0, Letta, LangMem, OPA, Cedar, NeMo Guardrails, Guardrails AI, and Invariant Guardrails.

Disclosure: the map also includes four projects I author, placed where their documented scope fits: Cockroach Crawler for governed web acquisition, Cockroach Browser for Playwright-based browser sessions, Qarinah for evidence-linked project memory, and Maqam for registered TypeScript action governance. They are not presented as a bundled platform or a ranking.

If you are designing an agent stack, start with four questions:

- Who owns the execution loop?
- What state persists, and who can update it?
- Where can policy actually stop an effect?
- What evidence lets another person verify the result?

Read the field guide: https://qarinah.io/articles/open-source-governed-agent-toolkit/

#OpenSource #AIAgents #AgentEngineering #AIGovernance #LLMOps

## X

AI agents are stacks, not single tools. This field guide maps 8 layers: documents, browsers, evals, computer use, frameworks, vertical agents, memory, and governance - with boundaries and official sources. https://qarinah.io/articles/open-source-governed-agent-toolkit/

## Medium

### Title

Open-Source Toolkit for Building AI Agents: An Engineering Category Map

### Subtitle

How to separate document processing, browser automation, evaluation, computer use, frameworks, vertical agents, memory, governance, and safety before choosing a stack.

### Body

The open-source agent ecosystem is easier to understand when tools are grouped by the engineering job they own.

This sounds obvious, but many tool lists mix browser drivers, orchestration frameworks, memory systems, document parsers, observability backends, and guardrails as if they were substitutes. They are not. A useful architecture begins with boundaries.

Ask four questions before selecting anything:

1. Who runs the agent loop?
2. What state persists across interactions?
3. Where can policy stop an external effect?
4. What evidence lets a reviewer verify the result?

Those questions produce a practical eight-part map.

#### 1. Document Processing

Document-processing tools turn files into structures that an agent can search, chunk, cite, or transform.

[Docling](https://docling-project.github.io/docling/) parses formats including PDF, office documents, images, and HTML into a unified document representation. [Unstructured](https://docs.unstructured.io/open-source/introduction/overview) partitions and preprocesses varied formats into elements for downstream AI pipelines.

Web acquisition is adjacent, but different. [Trafilatura](https://trafilatura.readthedocs.io/en/latest/) extracts text and metadata from web pages. [Firecrawl](https://docs.firecrawl.dev/) offers scrape, crawl, map, search, browser, and agent surfaces. [Cockroach Crawler](https://cockroachcrawler.com/) is an author-affiliated TypeScript project for bounded web acquisition and attached evidence. These tools can feed a document-processing stage, but site traversal is not document parsing.

Compare format coverage, layout and table fidelity, OCR, export formats, local deployment, and source provenance.

#### 2. Browser Automation

Browser automation controls engines, pages, selectors, and sessions.

[Playwright](https://playwright.dev/docs/intro) automates Chromium, Firefox, and WebKit. [Puppeteer](https://pptr.dev/guides/what-is-puppeteer) provides a high-level JavaScript API for Chrome and Firefox. [Stagehand](https://docs.stagehand.dev/v3/first-steps/introduction) combines code with natural-language act, extract, and observe interfaces.

[Cockroach Browser](https://cockroachbrowser.com/) is an author-affiliated runtime for explicit browser sessions, evidence, and human handoff. It uses Playwright and Chromium. It does not replace the browser engine or imply a way around access controls.

Compare engine support, selector strategy, session ownership, evidence capture, human takeover, and the exact point where an action can be denied.

#### 3. Evaluation & Monitoring

Monitoring explains what happened. Evaluation measures whether behavior met a defined criterion. A production system often needs both.

[OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/) provides vendor-neutral instrumentation, conventions, and transport for traces, metrics, and logs. It is not an observability backend.

[Langfuse](https://langfuse.com/docs) connects traces with evaluations, datasets, prompts, experiments, and operational metrics. [Arize Phoenix](https://github.com/Arize-ai/phoenix) provides tracing, evaluation, prompt iteration, datasets, and experiments with OpenTelemetry and OpenInference support. [Ragas](https://docs.ragas.io/en/latest/) provides evaluation APIs and metrics for retrieval and agent workflows.

Keep telemetry transport, trace storage, human review, offline test sets, online scoring, and release gates conceptually separate. An evaluation score is meaningful only with its dataset, rubric, judge configuration, and task.

#### 4. Computer Use

Computer-use agents perceive and operate desktop or device interfaces. Browser agents are one narrower form of computer use.

[Browser Use](https://github.com/browser-use/browser-use) focuses on agents that navigate websites. [Cua](https://github.com/trycua/cua) provides infrastructure and environments for computer-use agents. [Microsoft UFO](https://github.com/microsoft/UFO) explores Windows-focused automation through UI Automation, native APIs, and hybrid GUI interaction.

Compare operating-system support, perception method, native API access, sandboxing, confirmation modes, interruption, and replayable evidence. Browser automation should not be assumed to provide safe general desktop access.

#### 5. Frameworks

Frameworks own the loop, workflow graph, tool calls, handoffs, or durable execution.

[LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) provides low-level orchestration for stateful, long-running agents. The [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) provides agent loops, tools, handoffs, sessions, tracing, guardrails, and human-in-the-loop patterns. [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/) combines agent abstractions, a harness, graph workflows, sessions, middleware, memory providers, telemetry, and MCP integration. [CrewAI](https://docs.crewai.com/) provides Python abstractions for role-based crews and event-driven flows.

A framework may integrate memory, monitoring, or guardrails, but those layers still need explicit data, policy, and operational decisions.

#### 6. Vertical Agents

Vertical agents package a runtime around a specific domain and user workflow.

[OpenHands](https://docs.openhands.dev/overview/introduction) offers a software-agent SDK, CLI, and local GUI, with separate hosted and enterprise products. [mini-SWE-agent](https://mini-swe-agent.com/latest/) provides a compact software-engineering agent with a deliberately simple control flow and several execution environments. [Aider](https://aider.chat/docs/) brings AI pair programming, repository context, git integration, linting, and testing to the terminal.

For coding agents, compare edit authority, command execution, isolation, human review, model support, source control behavior, and how proposed changes are verified.

#### 7. Memory

Memory persists and retrieves state across turns, sessions, users, agents, or projects.

[Mem0](https://docs.mem0.ai/open-source/overview) provides managed and self-hosted components for user, session, and agent memory. [Letta](https://docs.letta.com/guides/get-started/intro) builds stateful agents around persistent memory blocks, conversation history, and archival memory. [LangMem](https://github.com/langchain-ai/langmem) provides primitives for extracting, storing, searching, and updating long-term memory.

[Qarinah](https://qarinah.io/) is the author-affiliated entry here. It keeps a project-owned evidence record and compiles bounded, cited context packs for supported coding agents. It does not run the agent loop or grant tool authority.

One category error is worth making explicit: speech-to-text and computer-vision tools are perception components, not memory. They become inputs to memory only when another system deliberately persists and retrieves their outputs.

Compare the source of truth, memory scope, write policy, conflict handling, retrieval method, portability, deletion, and provenance.

#### 8. Governance & Safety

Governance and safety are not one mechanism. Application authorization, LLM input and output rails, trace policies, and action gateways operate at different enforcement points.

[Open Policy Agent](https://www.openpolicyagent.org/docs) is a general-purpose policy engine that separates decisions from enforcement. [Cedar](https://docs.cedarpolicy.com/) defines authorization over a principal, action, resource, and context. In both cases, the host must call the authorizer and enforce its decision.

[NeMo Guardrails](https://docs.nvidia.com/nemo/guardrails/latest/home) provides programmable rails for LLM application inputs, outputs, retrieval, dialog, and execution flows. [Guardrails AI](https://github.com/guardrails-ai/guardrails) provides validators and structured-output controls. [Invariant Guardrails](https://invariantlabs-ai.github.io/docs/mcp-scan/guardrails-reference/) applies rules to traces, tool calls, MCP interactions, data flows, and content checks.

[Maqam](https://maqamagent.com/) is the author-affiliated entry in this category. It applies policy before registered TypeScript actions, can bind approval to an exact input, and records execution receipts. It governs calls routed through its registered gateway. It is not complete enterprise governance or universal interception.

Start by naming the enforcement point. Then test bypass paths, missing context, unavailable policy services, stale approvals, retries, and failure behavior.

#### Assemble from boundaries

A practical selection sequence is straightforward:

1. Write the task and threat model.
2. Choose the narrowest runtime that owns the loop.
3. Add document, browser, web, or computer access with separate permissions.
4. Define memory writes before optimizing retrieval.
5. Place policy on action paths that can actually be stopped.
6. Evaluate with held inputs, observable traces, versioned settings, and retained failure examples.

This is a category map, not a ranking. The list is representative rather than exhaustive, and every project should be checked against its current official documentation, license, deployment model, and exact operating boundary.

Disclosure: I author Qarinah, Maqam, Cockroach Browser, and Cockroach Crawler. All other named projects are maintained independently. The canonical, maintained version of this guide is available at https://qarinah.io/articles/open-source-governed-agent-toolkit/.
