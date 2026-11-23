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
  skills: [
    "javascript-best-practices",
    "security-analysis",
    "performance-optimization",
    "code-review",
  ],
  tools: [
    "File reading and pattern searching",
    "AST analysis for code structure",
    "Dependency analysis",
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

For this file, use the appropriate analysis skills to:
1. Identify security vulnerabilities (use javascript-best-practices and security-analysis skills)
2. Find performance issues and optimization opportunities (use performance-optimization skill)
3. Evaluate maintainability, complexity, and architectural concerns (use code-review skill)

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
      // Skills are invoked through tool_use with "mcp__" prefix
      // The agent can use skills like:
      // - javascript-best-practices for code standards
      // - security-analysis for vulnerability detection
      // - performance-optimization for performance issues
      // - code-review for maintainability concerns
      allowedTools: [
        "javascript-best-practices",
        "security-analysis",
        "performance-optimization",
        "code-review",
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
