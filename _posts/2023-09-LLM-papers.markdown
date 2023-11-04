---
layout: post
title:  "Draft: LLM Papers"
date:   2023-09-07
categories: jekyll update
---

# Surveys

- Factuality 

  - 18 October 2023 - Survey on Factuality in Large Language Models: Knowledge, Retrieval and Domain-Specificity - https://arxiv.org/abs/2310.07521

- X-of-Thought

  - 16 October 2023 : A Survey of Chain of Thought Reasoning: Advances, Frontiers and Future - https://arxiv.org/pdf/2309.15402.pdf

- Software Engineering

  - 11 October 2023 - Large Language Models for Software Engineering: Survey and Open Problems - https://arxiv.org/pdf/2310.03533.pdf

- Agents

  - 19 September 2023: The Rise and Potential of Large Language Model Based Agents: A Survey - https://arxiv.org/pdf/2309.07864.pdf
  - 7 September 2023: A Survey on Large Language Model based Autonomous Agents - https://arxiv.org/pdf/2308.11432.pdf

# Prompt Engineering

## X-of-Thought

- Chain-of-Thought Prompting Elicits Reasoning in Large Language Models - https://arxiv.org/pdf/2201.11903.pdf
- Tree of Thoughts: Deliberate Problem Solving with Large Language Models - https://arxiv.org/pdf/2305.10601.pdf

## ReAct

https://arxiv.org/pdf/2210.03629.pdf

## StepBack

- Take A Step Back Evoking Reasoning Via Abstraction In Large Language Models - https://arxiv.org/pdf/2310.06117.pdf?es_id=ee83135265

![img_3.png](img_3.png)

**Step-back prompting** is a strategy employed to improve the performance of Large Language Models (LLMs) on complex tasks by addressing the difficulty of directly retrieving relevant facts amidst a plethora of details. This approach involves initially posing a more abstract, high-level question derived from the original, more detailed query. 

For example, instead of directly asking which school a person attended during a specific timeframe, the LLM would first explore the person's overall educational history. This abstraction allows the model to gather pertinent facts and then apply this broad knowledge to deduce the answer to the original, more specific question. 

This two-step process, known as **Abstraction-grounded Reasoning**, starts with the **abstraction phase** to formulate a general concept or principle, followed by the **reasoning phase** where the model leverages the gathered facts to solve the initial problem.


This method has demonstrated enhanced effectiveness in various challenging tasks across STEM, knowledge-based Q&A, and multi-hop reasoning domains, as evidenced by empirical studies.

## EmotionPrompt

20 October 2023: Large Language Models Understand and Can Be Enhanced by Emotional Stimuli - https://arxiv.org/pdf/2307.11760.pdf
![img_2.png](img_2.png)

This paper investigates the capacity of Large Language Models (LLMs) to comprehend and respond to emotional stimuli, considering the profound effect emotional intelligence has on human behavior and interactions. Various LLMs, including Flan-T5-Large, Vicuna, Llama 2, BLOOM, ChatGPT, and GPT-4, were tested across 45 tasks in both deterministic and generative contexts. 

The study introduces "EmotionPrompt," a method that enhances prompts with emotional cues, and finds that it improves LLM performance—yielding a relative 8.00% improvement in Instruction Induction and 115% in BIG-Bench. Further, a human study with 106 participants showed that EmotionPrompt significantly increased the quality of generative tasks by 10.9%, based on performance, truthfulness, and responsibility metrics. These results suggest that integrating emotional intelligence into LLMs could be a promising direction for enhancing human-LLM interactions, signaling an intersection of social science and artificial intelligence.

## LeMa

- Learning From Mistakes Makes LLM Better Reasoner - https://arxiv.org/pdf/2310.20689.pdf

  LEMA is a two-stage process designed for improving large language models (LLMs) by using a corrector model (Mc) and a reasoning model (Mr) to generate and then fine-tune on mistake-correction data pairs. 
    - In the first stage, multiple reasoning paths are generated for a given question (qi) using Mr; these paths are filtered to retain only those which do not lead to the correct answer (ai). These paths represent the mistakes (rei). 
    - In the second stage, Mc is used to generate corrections for these mistakes. The corrections (ci) are validated by ensuring they lead to the correct final answer. To guide the correction process, a prompt containing annotated mistake-correction examples (Pc) is used, which demonstrates the incorrect step in the reasoning, explains the nature of the mistake, and provides the correct solution to ensure the LLM can understand and correct its reasoning path effectively. This process enables the LLM to learn from its reasoning errors and improves its ability to generate accurate responses.

# Hallucinations

## Mitigation

General article: https://amatriain.net/blog/hallucinations

## Studies

- Sources of Hallucination by Large Language Models on Inference Tasks- https://arxiv.org/pdf/2305.14552.pdf

  The research highlights three key findings regarding the performance of large language models (LLMs) like
    LLaMA-65B, GPT-3.5, and PaLM-540B in natural language inference (NLI) tasks.
    - First, it reveals an "attestation bias," where LLMs more frequently confirm entailments if their pretraining data includes the hypothesis,
      increasing the likelihood of incorrect affirmations by up to 2.2 times. Additionally, LLMs exhibit a reliance 
      on identifying named entities as "indices" for recall, which may not be relevant for predicate logic. 
    - Second, the study uncovers a "corpus-statistic bias," with LLMs more likely to affirm entailments when premises 
        have lower term frequencies compared to hypotheses, showing up to a 2.0 times increase in error rate. 
    - Finally, the paper demonstrates that LLM performance is artificially inflated when test samples align with these 
        biases and significantly reduced when test conditions are adversarial, indicating that LLMs may resort to 
        near-random classification when biases are challenged, highlighting a substantial decrease in performance due to
        these biases.

# RAG

## Classic RAG

- Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks - https://arxiv.org/pdf/2005.11401.pdf

![img.png](img.png)

## RAG Fusion

# Agents

## AutoGen

- 3 October 2023: AutoGen: Enabling Next-Gen LLM  Applications via Multi-Agent Conversation - https://arxiv.org/pdf/2308.08155.pdf
![img_1.png](img_1.png)

  - Conversable Agent: This section displays a robot-like figure representing an agent that can engage in conversations.

  - Agent Customization: It suggests that AutoGen agents can be tailored or modified for specific tasks or applications. The visuals indicate that agents can incorporate tools, humans, or a mix to achieve various tasks.

  - Flexible Conversation Patterns: Indicates that multiple agents can converse simultaneously. This is further divided into:
    - Joint chat: Where all agents seem to converse collectively.
    - Hierarchical chat: Suggesting a tiered conversation pattern, where one agent might take precedence or act as a mediator.

## OpenAgents

- OpenAgents: AN OPEN PLATFORM FOR LANGUAGE AGENTS IN THE WILD - https://arxiv.org/pdf/2310.10634v1.pdf

# Multimodal

## Video

MM-VID : Advancing Video Understanding with GPT-4V(ision) - https://arxiv.org/pdf/2310.19773.pdf

## Image

- The Dawn of LMMs: Preliminary Explorations with GPT-4V(ision) - https://arxiv.org/pdf/2309.17421.pdf
- HALLUSIONBENCH: You See What You Think? Or You Think What You See? - https://arxiv.org/pdf/2310.14566.pdf