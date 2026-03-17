# Module 1 - Task 01 - Prompt Engineering

Prompt config: 0.1 for a more deterministic response
- **The Goal:** You want the AI to stick strictly to the provided requirements.
- **Why it works:** At this range, the model consistently chooses the most probable next token. This reduces "hallucinations" (inventing features that don't exist) and ensures that the Gherkin steps or script logic directly mirror your documentation.

Pro-Tips for Better Test Generation

**Top-P** sampling selects the top tokens whose cumulative probability does not exceed a	certain	value	(P).	Values	for	P	range	from	0	(greedy	decoding)	to	1	(all	tokens	in	the	LLM’s	vocabulary).

- **Top P (Nucleus Sampling):** Keep this around **0.9**. It works alongside temperature to ensure the AI considers a diverse enough set of words to remain coherent without getting "lost."
    
- **The "Zero-Shot" Trap:** Even with the perfect temperature, an AI can miss context. Always include your **Tech Stack** (e.g., "Write these tests for Playwright using TypeScript") in the prompt.
    
- **Few-Shot Prompting:** Provide one example of a "Requirement $\rightarrow$ Test Case" pair. This is often more effective than any temperature tweak.

## Demo
### TestCaseGenerator
`node src/generators/TestCaseGenerator.js --i ./data/input/requirements/01_add_task.md --o data/results/tc/`

### PageObjectGenerator
`node src/generators/PageObjectGenerator.js --i ./data/input/traces/todo_mvc.traces --o ./data/results/po`

### TestAutomationTool
`node src/generators/TestAutomationTool.js --testcase ./data/results/tc/TC_ADD_TASK_001.json --po ./data/results/po/po.js --o ./data/results/tests`


