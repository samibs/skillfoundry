---
name: learn
description: >-
  Consolidated reference combining advanced Claude Code workflows and AI-assisted learning techniques
---


# AI-Powered Development & Learning Guide

A consolidated reference combining advanced Claude Code workflows and AI-assisted learning techniques.

**Persona**: See `agents/ai-workflows-and-learning-guide.md` for full persona definition.


## Part 1: Claude Code Workflow for 2026

*Based on RAmjad's video "My Claude Code Workflow for 2026" (16k views) — summarized by Om Nalinde*

> "This dude from Cambridge plays with Claude Code like he owns it."

### 1. Video-Based Specification (Spec Phase)

**Screen Recording**  
Instead of writing a spec from scratch, find an existing product similar to your idea. Record your screen while using it and talking through your specific feature ideas and changes.

**Generate PRD**  
Upload this video to Gemini 1.5 Pro (or Gemini 3 Pro/Free Pro) and ask it to generate a Product Requirement Document (PRD).

**Refine Spec**  
Use the "Ask User Question" tool in Claude Code. Prompt it to interview you about the generated spec to fill in missing details (e.g., "How should the emoji picker be positioned?").

**Package Discovery**  
Feed the refined spec into ChatGPT with "Heavy Thinking" (likely OpenAI's o1/o3 models) to search for and recommend specific, well-maintained GitHub packages (e.g., for a WYSIWYG editor) to avoid building complex components from scratch.

### 2. The Orchestrator Role

**Design Feedback Loops**  
Your primary job is not to write code but to design loops where the agent can build, fail, and learn.

**Monitor & Update**  
Watch the agent's reasoning. If it makes a mistake, don't just fix the code—update the `claude.md` (project instructions file) to prevent that specific mistake from happening again.

**High-Level Decisions**  
Make the architectural decisions the agent can't, such as choosing the database or specific tools.

### 3. Model Choice & Tools

**Model Selection**
- **Opus 4.5** → Building large-scale features
- **GPT-5.2** → Architecture and debugging

**Voice Dictation**  
Use HyperWhisper to dictate prompts significantly faster than typing.

### 4. Execution & "Parallel Vibe Coding"

**Parallel Agents**  
For small, well-defined tasks (like extracting hard-coded strings for translations), spin up multiple sub-agents to work on different parts of the project simultaneously.

**Avoid Conflicts**  
Do not use parallel agents for large features within the same project to avoid complex merge conflicts ("meshing issues").

**Sub-agents for Multi-Project Fixes**  
If a bug exists in a template used by multiple projects, spin up one sub-agent per project to fix them all in parallel.

### 5. Review & Maintenance

**Planning Mode**  
Use Claude Code's "Planning Mode" to prevent Architectural Drift, ensuring the agent sticks to the original design vision over time.

**Shape of Diffs**  
Inspect the "shape" of the code changes (diffs) to ensure they are manageable and align with expectations before accepting them.

**Forking for Learning**  
If the agent does something surprising or complex, fork the session. In the forked session, ask "Why did you do that?" or request diagrams to understand the code without polluting the context of the main working session.


## Part 2: AI-Powered Learning Prompts

Six strategic prompts to accelerate any learning journey.

### 1. Create a Personalized Learning Roadmap

> No more $200 courses with 80% filler content. Just what YOU need to learn.

**Prompt:**
```
"I want to learn [skill] from complete beginner to advanced level.

My current knowledge: [describe what you already know]
Time available: [hours per week]
Learning style: [visual/hands-on/reading/etc.]
End goal: [what you want to achieve]

Create a detailed 12-week learning roadmap with:
1. Weekly focus areas and milestones
2. Specific topics to cover in order
3. Estimated time for each section
4. How to measure progress"
```

### 2. Get Concepts Explained Multiple Ways

**Prompt:**
```
"Explain [concept] to me in 4 different ways:

1. Like I'm 10 years old (simple analogy)
2. Using a real-world example
3. With a technical breakdown
4. Through a story or scenario

Concept: [what you're trying to understand]"
```

### 3. Build Practice Projects That Matter

> Learn by DOING, not just watching videos you'll forget in a week.

**Prompt:**
```
"I'm learning [skill] and need hands-on practice.

My skill level: [beginner/intermediate/advanced]
My interests: [what motivates you]
Time per project: [hours available]

Create 5 project ideas that:
- Match my skill level
- Gradually increase in difficulty
- Can be added to a portfolio
- Teach practical, real-world applications

For each project, outline the steps and what I'll learn."
```

### 4. Get Instant Answers to Specific Questions

> No more scrolling through 40-minute videos to find one answer.

**Prompt:**
```
"I'm stuck on this specific part of [skill/topic]:

[describe exactly what you don't understand]

Explain it clearly and provide:
1. The answer to my specific question
2. Why it works this way
3. Common mistakes people make here
4. A simple example I can reference"
```

### 5. Create Custom Flashcards & Study Materials

**Prompt:**
```
"Create a study guide for [topic] that includes:

1. 20 key concepts I must memorize
2. Flashcard-style Q&A for each concept
3. Mnemonics or memory tricks
4. Common misconceptions to avoid
5. Self-test questions with answers

Topic: [what you're studying]
My goal: [exam, certification, practical use, etc.]"
```

### 6. Learn Through the Feynman Technique

> This forces deep understanding instead of surface-level memorization.

**Prompt:**
```
"I want to truly understand [concept] using the Feynman Technique.

1. Explain [concept] to me in simple terms
2. Ask me to explain it back to you in my own words
3. Identify gaps in my understanding based on my explanation
4. Re-teach what I'm missing
5. Give me an analogy to solidify my understanding

Let's start: [paste the concept or topic]"
```


## Quick Reference

| Use Case | Tool/Model | Technique |
|----------|------------|-----------|
| Spec generation from demo | Gemini 1.5 Pro | Video upload + PRD prompt |
| Spec refinement | Claude Code | "Ask User Question" tool |
| Package discovery | ChatGPT (o1/o3) | Heavy Thinking mode |
| Large features | Opus 4.5 | Single agent focus |
| Architecture & debugging | GPT-5.2 | Deep reasoning |
| Parallel small tasks | Claude Code | Multiple sub-agents |
| Fast prompt input | HyperWhisper | Voice dictation |
| Prevent drift | Claude Code | Planning Mode |
| Debug agent decisions | Claude Code | Fork session |


## Resources

- **Claude Code Workflow Video:** [My Claude Code Workflow for 2026](https://lnkd.in/dcibJhzQ) by @RAmjad
- **10k+ Prompts Library:** https://lnkd.in/eQrDuXtv


*Compiled from LinkedIn posts by Om Nalinde and learning prompts collection — January 2026*


## Learning Guidance

### Summary
[1-2 sentences: recommended approach]

### Roadmap
| Week | Focus | Milestone |
|------|-------|-----------|
| [X] | [Topic] | [Outcome] |

### Key Resources
- [Resource 1]: [why useful]
- [Resource 2]: [why useful]

### Next Step
[Immediate action to take]
```
