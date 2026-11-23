/**
 * Code Quality Analyzer Agent
 * Analyzes code for security vulnerabilities, performance issues, and maintainability concerns.
 * Uses Claude Skills for specialized analysis (pattern from Claude Agent SDK Lesson 5-7)
 */

import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  CodeQualityResultJSONSchema,
  CodeQualityResultSchema,
  type CodeQualityResult,
} from "../types/index.js";

const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-5-20251101";

/**
 * SDK-compatible agent definition for registration with orchestrator
 * Used by the orchestrator to register this agent as a subagent
 */
export const codeQualityAgent = {
  description: "Code Quality Analyzer - Analyzes code for security vulnerabilities, performance issues, and maintainability concerns. Provides comprehensive quality scores and actionable recommendations.",
  prompt: `You are a code quality analyzer. Your role is to analyze source code files for security vulnerabilities, performance issues, and maintainability concerns.

When analyzing code:
1. Use Read tool to get the file contents
2. Use Grep tool to search for specific patterns, vulnerabilities, and anti-patterns
3. Use Glob tool if you need to find related files for context
4. Use Skill tool to invoke specialized analysis (security-analysis, performance-optimization, code-review, javascript-best-practices)

For each file, perform:
1. **Security analysis** - Identify security vulnerabilities (injection, XSS, authentication issues, etc.)
2. **Performance analysis** - Find performance issues and optimization opportunities
3. **Maintainability analysis** - Evaluate code complexity, readability, and architectural concerns

Provide comprehensive analysis with:
- Specific line numbers and code context for each issue
- Severity levels (critical, high, medium, low, info)
- Clear recommendations for fixes
- Overall quality score for the file (0-100)
- Summary of findings

Format your complete response as structured JSON according to the schema.`,
  tools: ['Task', 'Read', 'Grep', 'Glob', 'Skill']
};

/**
 * Agent Description for Orchestrator
 * Explains what this agent does and when to use it
 */
export const AGENT_DESCRIPTION = {
  name: "Code Quality Analyzer",
  purpose:
    "Analyzes source code files for security vulnerabilities, performance issues, and maintainability concerns. Provides comprehensive quality scores and actionable recommendations.",
  capabilities: [
    "Security analysis: Detects common security vulnerabilities (injection, XSS, authentication issues, etc.)",
    "Performance analysis: Identifies performance bottlenecks, inefficient patterns, and optimization opportunities",
    "Maintainability analysis: Evaluates code complexity, readability, testing coverage, and architectural concerns",
    "Multi-file analysis: Can analyze single files or entire codebases",
    "Actionable recommendations: Provides specific fixes and improvements for each issue found",
  ],
  tools: [
    "Read",    // Read file contents for analysis
    "Grep",    // Search for patterns, vulnerabilities, and anti-patterns
    "Glob",    // Find related files for context
    "Skill",   // Invoke specialized analysis skills (security-analysis, performance-optimization, code-review, javascript-best-practices)
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
  result: CodeQualityResult | null;
}

/**
 * Input message generator for custom MCP tools and skills (required pattern from Claude Agent SDK)
 */
async function* generateMessages(filePath: string, analysisScope: string) {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: `Analyze the following code file for code quality issues. Focus on ${analysisScope}.

File to analyze: ${filePath}

To perform this analysis:
1. Use Read tool to get the file contents
2. Use Grep tool to search for specific patterns (security issues, anti-patterns)
3. Use Glob tool if you need to find related files
4. Use Skill to invoke specialized analysis (javascript-best-practices, security-analysis, performance-optimization, code-review)

For this file, perform:
1. Security analysis - Identify security vulnerabilities (use security-analysis skill)
2. Performance analysis - Find performance issues and optimization opportunities (use performance-optimization skill)
3. Maintainability analysis - Evaluate complexity, readability, and architectural concerns (use code-review skill)

Provide a comprehensive analysis with:
- Specific line numbers and code context for each issue
- Severity levels (critical, high, medium, low, info)
- Clear recommendations for fixes
- Overall quality score for the file (0-100)
- Summary of findings

Format your complete response as structured JSON according to the schema.`,
    },
    parent_tool_use_id: null,
    session_id: "code-quality-analysis",
  };
}

/**
 * Analyzes a code file for quality issues using specialized skills
 * Returns structured analysis with scores and recommendations
 *
 * @param filePath - Path to the file to analyze
 * @param analysisScope - What to focus on (e.g., "security vulnerabilities and performance issues")
 * @returns AgentTrace with tool calls and analysis result
 */
export async function analyzeCodeQuality(
  filePath: string,
  analysisScope = "security vulnerabilities, performance issues, and maintainability concerns"
): Promise<AgentTrace> {
  const trace: AgentTrace = {
    toolCalls: [],
    skillsInvoked: [],
    result: null,
  };

  for await (const message of query({
    prompt: generateMessages(filePath, analysisScope),
    options: {
      model,
      // Real tools for file analysis
      allowedTools: [
        "Read",                    // Read file contents
        "Grep",                    // Search for patterns in files
        "Glob",                    // Find related files by pattern
        "Skill",                   // Invoke specialized analysis skills
      ],
      outputFormat: {
        type: "json_schema",
        schema: CodeQualityResultJSONSchema,
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
            if (toolName.includes("javascript-best-practices")) {
              trace.skillsInvoked.push({
                name: "javascript-best-practices",
                purpose: "Analyzing JavaScript/TypeScript best practices",
              });
            } else if (toolName.includes("security-analysis")) {
              trace.skillsInvoked.push({
                name: "security-analysis",
                purpose: "Detecting security vulnerabilities",
              });
            } else if (toolName.includes("performance-optimization")) {
              trace.skillsInvoked.push({
                name: "performance-optimization",
                purpose: "Identifying performance bottlenecks",
              });
            } else if (toolName.includes("code-review")) {
              trace.skillsInvoked.push({
                name: "code-review",
                purpose: "Evaluating code quality and maintainability",
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
      trace.result = CodeQualityResultSchema.parse(
        message.structured_output
      );
    }
  }

  if (!trace.result) {
    throw new Error("Failed to get structured output from code quality agent");
  }

  return trace;
}
