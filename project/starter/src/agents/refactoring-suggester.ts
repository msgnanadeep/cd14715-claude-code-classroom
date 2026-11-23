/**
 * Refactoring Suggester Agent
 * Identifies opportunities to improve code structure, modernize patterns, and enhance clarity.
 * Provides before/after examples with concrete refactoring suggestions.
 * Uses Claude Skills for specialized refactoring expertise (pattern from Claude Agent SDK Lesson 5-7)
 */

import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  RefactoringSuggestionJSONSchema,
  RefactoringSuggestionSchema,
  type RefactoringSuggestion,
} from "../types/index.js";

const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-5-20251101";

/**
 * Agent Description for Orchestrator
 * Explains what this agent does and when to use it
 */
export const AGENT_DESCRIPTION = {
  name: "Refactoring Suggester",
  purpose:
    "Identifies opportunities to improve code structure, design patterns, and overall code clarity. Provides concrete before/after examples for modernization and architectural improvements.",
  capabilities: [
    "Function extraction: Identifies overly complex functions that should be decomposed",
    "Modernization: Suggests updates to use modern language features and frameworks",
    "Design pattern improvements: Recommends better architectural patterns and abstractions",
    "Code simplification: Finds complex logic that can be expressed more clearly",
    "Naming improvements: Suggests better variable, function, and class names for clarity",
    "Pattern migration: Recommends newer patterns (async/await, destructuring, arrow functions, etc.)",
  ],
  skills: [
    "code-refactoring",
    "design-patterns",
    "modernization-strategies",
    "code-clarity-improvement",
  ],
  tools: [
    "AST analysis for code structure",
    "Pattern matching for identifying refactoring opportunities",
    "Code similarity detection for duplication",
    "Framework/language version analysis",
  ],
};

/**
 * Track tool calls and skill invocations for evaluation
 */
export interface AgentTrace {
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
  }>;
  skillsInvoked: Array<{
    name: string;
    purpose: string;
  }>;
  result: RefactoringSuggestion | null;
}

/**
 * Input message generator for refactoring analysis
 */
async function* generateMessages(
  sourceFilePath: string,
  projectContext: string
) {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: `Analyze the following file and suggest refactoring improvements.

File to analyze: ${sourceFilePath}
Project context: ${projectContext}

Identify refactoring opportunities in these categories:

1. **Extract Functions** (use code-refactoring skill):
   - Find complex functions that do too much
   - Identify repeated logic blocks that should be extracted
   - Look for overly long conditional chains
   - Identify deep nesting levels that reduce readability

2. **Rename** (use code-clarity-improvement skill):
   - Variables with unclear or misleading names
   - Functions with names that don't reflect their purpose
   - Classes with vague names
   - Constants with acronyms or abbreviations that need expansion

3. **Modernize** (use modernization-strategies skill):
   - Callback-based code that could use async/await
   - var declarations that should be const/let
   - Old object/array syntax that could use destructuring
   - Promise chains that could be async/await
   - Traditional classes that could use modern syntax
   - CommonJS requires that could be ES6 imports

4. **Simplify** (use code-clarity-improvement skill):
   - Complex conditional logic that could use guard clauses
   - Nested if/else chains that could use switch statements
   - Overly defensive code that adds noise
   - Multiple return statements in simple logic
   - Unnecessary wrapper functions

5. **Pattern Improvement** (use design-patterns skill):
   - Opportunities to use established design patterns
   - Better error handling strategies
   - Improved state management patterns
   - Alternative architectural approaches
   - Utility library usage opportunities

For EACH refactoring suggestion, provide:

- **type**: One of: 'extract-function', 'rename', 'modernize', 'simplify', 'pattern-improvement'
- **location**: Exact location in code (function name, line number, what specifically)
- **impact**: 'low' (cosmetic), 'medium' (improves clarity/maintenance), 'high' (significant architecture change)
- **description**: Clear explanation of WHY this refactoring improves the code
- **before**: Complete code snippet showing current implementation
- **after**: Complete code snippet showing refactored version
- **benefits**: Specific benefits of making this change:
  - Readability: How it's clearer
  - Maintainability: How it's easier to modify
  - Performance: Any performance improvements
  - Type safety: Better type coverage
  - Testability: Easier to unit test

Important guidelines:

✓ Make suggestions ACTIONABLE - provide real code that can be copy-pasted
✓ Prioritize high-impact refactorings that improve maintainability
✓ Show context in before/after (don't just show isolated lines)
✓ Consider the codebase's existing patterns and framework conventions
✓ Balance modernization with practical constraints
✓ Group related refactorings (e.g., multiple function extractions)

Provide results as structured JSON with:
- file: The file analyzed
- suggestions: Array of refactoring suggestions with all details above
- summary: Brief executive summary of recommended refactorings and their benefits`,
    },
    parent_tool_use_id: null,
    session_id: "refactoring-analysis",
  };
}

/**
 * Analyzes a source file and suggests refactoring improvements
 * Returns concrete before/after examples for each opportunity
 *
 * @param sourceFilePath - Path to the file to analyze
 * @param projectContext - Context about the project (framework, conventions, goals)
 * @returns AgentTrace with tool calls and refactoring suggestions
 */
export async function suggestRefactorings(
  sourceFilePath: string,
  projectContext = "TypeScript/Node.js project"
): Promise<AgentTrace> {
  const trace: AgentTrace = {
    toolCalls: [],
    skillsInvoked: [],
    result: null,
  };

  for await (const message of query({
    prompt: generateMessages(sourceFilePath, projectContext),
    options: {
      model,
      // Skills for refactoring analysis and suggestions
      allowedTools: [
        "code-refactoring",              // Specific refactoring techniques
        "design-patterns",               // Design pattern improvements
        "modernization-strategies",      // Modern language/framework features
        "code-clarity-improvement",      // Readability and naming improvements
      ],
      outputFormat: {
        type: "json_schema",
        schema: RefactoringSuggestionJSONSchema,
      },
    },
  })) {
    // Track tool and skill calls
    if (message.type === "assistant") {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_use") {
            const toolName = block.name as string;

            // Track skill invocations separately
            if (toolName.includes("code-refactoring")) {
              trace.skillsInvoked.push({
                name: "code-refactoring",
                purpose: "Analyzing refactoring techniques and opportunities",
              });
            } else if (toolName.includes("design-patterns")) {
              trace.skillsInvoked.push({
                name: "design-patterns",
                purpose: "Recommending design pattern improvements",
              });
            } else if (toolName.includes("modernization-strategies")) {
              trace.skillsInvoked.push({
                name: "modernization-strategies",
                purpose: "Suggesting modern language/framework features",
              });
            } else if (toolName.includes("code-clarity-improvement")) {
              trace.skillsInvoked.push({
                name: "code-clarity-improvement",
                purpose: "Improving code readability and naming",
              });
            }

            // Track all tool calls
            trace.toolCalls.push({
              name: toolName,
              input: block.input as Record<string, unknown>,
            });
          }
        }
      }
    }

    // Capture structured output
    if (
      message.type === "result" &&
      message.subtype === "success" &&
      message.structured_output
    ) {
      trace.result = RefactoringSuggestionSchema.parse(
        message.structured_output
      );
    }
  }

  if (!trace.result) {
    throw new Error(
      "Failed to get structured output from refactoring suggester agent"
    );
  }

  return trace;
}

/**
 * Convenience function for analyzing a single file
 */
export async function refactor(
  filePath: string,
  context?: string
): Promise<RefactoringSuggestion> {
  const trace = await suggestRefactorings(filePath, context);
  return trace.result!;
}

/**
 * Convenience function for filtering suggestions by type
 */
export function filterByType(
  suggestions: RefactoringSuggestion,
  type: "extract-function" | "rename" | "modernize" | "simplify" | "pattern-improvement"
): RefactoringSuggestion {
  return {
    ...suggestions,
    suggestions: suggestions.suggestions.filter((s) => s.type === type),
  };
}

/**
 * Convenience function for filtering suggestions by impact
 */
export function filterByImpact(
  suggestions: RefactoringSuggestion,
  impact: "low" | "medium" | "high"
): RefactoringSuggestion {
  return {
    ...suggestions,
    suggestions: suggestions.suggestions.filter((s) => s.impact === impact),
  };
}
