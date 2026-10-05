---
name: quiz
description: Test the user's understanding of concepts from linked folders, files, or specified topics. Generates deep, conceptual, open-ended questions that require the student to think, reason, and write their own answers, evaluates their responses, identifies knowledge gaps, and provides targeted feedback.
---

# Quiz & Knowledge Testing

The goal is not trivia recall or multiple-choice guessing. The goal is **verifying genuine understanding**: testing whether the student can derive mechanisms, reason about causality, diagnose failure modes, and explain concepts in their own words.

## Philosophy: Generative Retrieval over Option Recognition

Multiple-choice questions test *recognition* — a student can often eliminate distractors by shape, guess lucky, or recognize keywords without having an integrated mental model.

Real understanding requires **generative retrieval**:
- The student must construct their reasoning from scratch.
- The student writes their answer in an interactive editor.
- The agent reads their written response, assesses nuances, flags misconceptions, and provides targeted feedback.

Options-based multiple choice is reserved strictly for rapid diagnostic edge-probing (binary-searching where knowledge breaks down). Primary testing should be open-ended and conceptual.

## Step 1: Ingesting Knowledge from Linked Sources

Knowledge to test comes from:
1. **Linked sources** set via `/quiz-source <path1> [path2]...`. Call `get_quiz_sources` at the start to retrieve all linked paths.
2. **Explicit paths, files, or folders** passed by the user in chat or via `@file` references.
3. If `get_quiz_sources` returns empty and no path is passed, ask the user what materials or topics they want to be tested on.

### Difficulty Selection:
Ask or confirm user preference at session start:
- **Easy:** Core definitions, foundational axioms, direct causal mechanisms, clear baseline invariants.
- **Medium:** Tradeoff comparisons, multi-component interactions, why naive alternatives fail, standard scenario analysis.
- **Hard:** Boundary stress tests, invariant violations, counter-factual derivations, subtle failure modes, cross-module synthesis.
- **Mixed / Adaptive (Default for Exam Prep):**
  - Starts with an easy/medium anchor on a topic.
  - Advances to harder questions on that topic as the student proves mastery.
  - **Strict Topic Isolation Rule:** Mastery is scoped to each topic. Answering a hard question on Topic A does *not* mean the student knows hard concepts on Topic B. Every new topic must be probed from its own anchor before escalating.
  - The agent has full discretion to ask multiple questions per topic to test depth, or pivot across topics.

### Non-Linear & Interleaved Questioning (Exam Simulation):
Do NOT test sequentially in the order topics were introduced or organized in files.
- Real exams are non-linear: professors mix questions across different chapters and modules.
- **Interleaved Sampling:** Randomly jump between distinct topics, mechanisms, and files across the linked sources. Interleaving disrupts short-term memory momentum and forces the brain to retrieve mental models cold — which builds durable retention.
- **Spaced Re-probing:** After jumping across other topics, loop back to a previously tested topic at a higher difficulty to verify long-term retention.

### How to acquire knowledge from the source:
- **Scan directory structure:** Use `find` or `ls` to survey the scope.
- **Inspect key files:** Use `read` and `grep` (or spawn a `researcher` subagent for large codebases or literature) to build a clear topic hierarchy.
- **Identify high-leverage targets:**
  - *Core definitions & unconditional truths* (the ground rules of the domain).
  - *Causal mechanisms* (how components interact and why).
  - *Design tradeoffs & constraints* (why approach A was picked over B).
  - *Edge cases & failure modes* (what breaks when invariants fail).
  - *Common traps* (counter-intuitive behaviors and frequent misconceptions).

## Step 2: Designing Conceptual Questions

Write questions that force the student to think and explain, not recite:

### Good Question Archetypes:
1. **Mechanism & Derivation:**
   - *"How does [component X] ensure [property Y]? Walk through the step-by-step mechanism."*
   - *"Why can't we simply [naive alternative Z]? What breaks?"*
2. **Failure Analysis & Debugging:**
   - *"Suppose [condition C] occurs. Trace the exact chain of events and predict the failure."*
   - *"A user encounters error E under state S. What invariant was violated and where?"*
3. **First-Principles Tradeoff:**
   - *"Compare approach A and approach B for [workload W]. Under what specific conditions does A outperform B, and what do you sacrifice?"*
4. **Boundary & Counter-factual Reasoning:**
   - *"If we remove [constraint K], does the system still remain sound? Why or why not?"*

### Rules for Questions:
- Ask exactly **one** focused question per tool call.
- State clear expectations in `details` (e.g., what aspects to address).
- Do not ask open-ended questions so broad they require writing an essay; keep the scope tightly bounded to a single concept or interaction.

## Step 3: Posing the Question via `quiz`

Use the `quiz` tool:
- **Open-Ended / Free-Text (Default):**
  - Omit `options` (or leave empty).
  - Provide `question`: the prompt to answer.
  - Provide `details`: any context, setup scenario, or rubric hints.
  - Provide `difficulty`: `"easy"`, `"medium"`, or `"hard"`.
  - Provide `explanation`: the key ground-truth points / rubric criteria you will grade against.
  - The student gets an editor popup in the TUI, types their answer, and submits.
- **Diagnostic Multiple-Choice (When mapping boundaries quickly):**
  - Provide `options` (at least 2 bare claims), `correctAnswer` (option value), `difficulty`, and `explanation`.
  - Follow strict distractor construction: each distractor must represent a believable specific misconception.

## Step 4: Rigorous Evaluation & Socratic Feedback

### Mandatory Feedback Rule (Never Skip)
When the student submits an answer to an open-ended/cloze question, you **MUST** provide full conversational feedback in your assistant text **before** moving on. Never invoke `quiz` back-to-back in the same turn or silently advance without delivering your evaluation.

When the student submits their written answer, evaluate it with precision:

1. **Acknowledge accurate understanding:** Specifically cite which parts of their mental model are solid.
2. **Isolate specific errors or gaps:**
   - Did they confuse causality?
   - Did they miss a critical invariant or constraint?
   - Did they hold a common misconception?
3. **Explain the causal reason:** Don't just assert the right answer; show *why* the physics, logic, or code behaves that way, referencing the linked source file or lines.
4. **Adaptive next step:**
   - If they nailed it: escalate difficulty or move to the next dependent concept in the knowledge graph.
   - If they had a partial gap: ask a quick targeted follow-up to guide them to self-correct.
   - If they missed a foundational root: step back and test the prerequisite unconditional truth before re-attempting.

## Step 5: Formatting & Tone

- **Tone:** Direct, rigorous, supportive, intellectually honest. No false praise or empty filler.
- **Interactive Diagrams — No Terminal ASCII:** Never draw ASCII art or text wireframes in terminal messages. When a question or explanation involves structure, workflows, architecture, states, geometry, or math curves, call the `draw_diagram` tool (`type: "mermaid"`, `"svg"`, or `"python"` for matplotlib curves/plots). It creates a clean asset in `viz/` and snaps an interactive visual directly into the student's Obsidian note.
- **Math/Formulas in Markdown:** Always enclose math formulas and quantitative expressions in `$$` fences for clean Obsidian rendering:
  - Inline formulas: `$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$`
  - Display blocks:
    ```markdown
    $$
    \nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}
    $$
    ```
- **Session Progress:** Keep track of topics tested, concepts mastered, and gaps to review.
