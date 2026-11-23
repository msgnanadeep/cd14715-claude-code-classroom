/**
 * Test Coverage Analyzer Agent
 * Evaluates test completeness by analyzing code structure and comparing with existing tests.
 * Suggests specific, actionable test cases for untested code paths.
 * Uses Claude Skills for specialized testing analysis (pattern from Claude Agent SDK Lesson 5-7)
 */

import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  TestCoverageResultJSONSchema,
  TestCoverageResultSchema,
  type TestCoverageResult,
} from "../types/index.js";

const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-5-20251101";

/**
 * Agent Description for Orchestrator
 * Explains what this agent does and when to use it
 */
export const AGENT_DESCRIPTION = {
  name: "Test Coverage Analyzer",
  purpose:
    "Evaluates test completeness by analyzing source code structure and comparing with existing test files. Provides actionable test suggestions for uncovered code paths.",
  capabilities: [
    "Static analysis: Analyzes code structure without executing tests (functions, classes, branches, edge cases)",
    "Test file discovery: Identifies existing test files and their scope",
    "Coverage estimation: Estimates coverage percentage based on code structure analysis",
    "Untested path detection: Identifies functions, classes, branches, and edge cases without test coverage",
    "Actionable suggestions: Provides specific, runnable test code snippets for each untested path",
    "Priority ranking: Prioritizes untested code by criticality (critical, high, medium, low)",
  ],
  tools: [
    "Read",    // Read source file and test files to analyze structure
    "Grep",    // Search for test patterns and existing test coverage
    "Glob",    // Find test files and discover testing patterns
    "Skill",   // Invoke specialized testing analysis skills (testing-best-practices, test-generation, edge-case-analysis, code-structure-analysis)
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
  result: TestCoverageResult | null;
}

/**
 * Input message generator for custom MCP tools and skills
 */
async function* generateMessages(
  sourceFilePath: string,
  testDirectory: string
) {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: `Analyze test coverage for the following source file by comparing it with existing tests.

Source file: ${sourceFilePath}
Test directory: ${testDirectory}

To perform this analysis:
1. Use Read tool to get the source file contents and analyze its structure
2. Use Glob tool to find test files in the test directory
3. Use Grep tool to search for test patterns and existing tests
4. Use Skill to invoke specialized analysis (testing-best-practices, test-generation, edge-case-analysis, code-structure-analysis)

Steps to perform:

1. **Discover existing tests** (use testing-best-practices and code-structure-analysis skills):
   - Find test files that test the source file
   - Identify what code paths are currently being tested
   - Note the testing framework and patterns used

2. **Analyze code structure** (use code-structure-analysis skill):
   - Identify all functions and classes in the source file
   - Map out all conditional branches (if/else, switch statements, try/catch)
   - Identify error paths and edge cases

3. **Identify untested paths** (use edge-case-analysis and test-generation skills):
   - Determine which functions/classes lack test coverage
   - Find untested branches and conditions
   - Identify edge cases and boundary conditions that aren't tested

4. **Generate actionable test suggestions** (use test-generation skill):
   - For EACH untested path, provide:
     * Specific location in code (function name, line number if possible)
     * Type of path (function, class, branch, edge-case)
     * Priority level based on function importance/complexity (critical, high, medium, low)
     * Detailed reasoning why this needs testing
     * Complete, runnable test code snippet that:
       - Uses the same framework as existing tests
       - Covers the specific untested scenario
       - Includes clear assertions
       - Is copy-pasteable and production-ready

5. **Calculate coverage estimate**:
   - Estimate what percentage of the code is currently tested (0-100)
   - Base this on: tested functions/classes / total functions/classes

Provide results as structured JSON with:
- file: The source file analyzed
- hasTests: Whether any tests exist for this file
- testFiles: List of test files discovered
- untestedPaths: Array of untested paths with the details above
- coverageEstimate: Estimated coverage percentage
- summary: Brief summary of test status and recommendations

Remember: Test suggestions must be SPECIFIC and ACTIONABLE, not generic templates.
Include actual test code that can be run immediately.`,
    },
    parent_tool_use_id: null,
    session_id: "test-coverage-analysis",
  };
}

/**
 * Analyzes test coverage for a source file by comparing with existing tests
 * and suggesting specific test cases for untested paths
 *
 * @param sourceFilePath - Path to the source file to analyze
 * @param testDirectory - Path to directory containing tests (default: same directory)
 * @returns AgentTrace with tool calls and coverage analysis result
 */
export async function analyzeTestCoverage(
  sourceFilePath: string,
  testDirectory = "./"
): Promise<AgentTrace> {
  const trace: AgentTrace = {
    toolCalls: [],
    skillsInvoked: [],
    result: null,
  };

  for await (const message of query({
    prompt: generateMessages(sourceFilePath, testDirectory),
    options: {
      model,
      // Real tools for file analysis
      allowedTools: [
        "Read",                   // Read file contents
        "Grep",                   // Search for test patterns
        "Glob",                   // Find test files
        "Skill",                  // Invoke specialized testing analysis skills
      ],
      outputFormat: {
        type: "json_schema",
        schema: TestCoverageResultJSONSchema,
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
            if (toolName.includes("testing-best-practices")) {
              trace.skillsInvoked.push({
                name: "testing-best-practices",
                purpose: "Analyzing testing frameworks and patterns",
              });
            } else if (toolName.includes("test-generation")) {
              trace.skillsInvoked.push({
                name: "test-generation",
                purpose: "Generating specific test code snippets",
              });
            } else if (toolName.includes("edge-case-analysis")) {
              trace.skillsInvoked.push({
                name: "edge-case-analysis",
                purpose: "Identifying boundary conditions and edge cases",
              });
            } else if (toolName.includes("code-structure-analysis")) {
              trace.skillsInvoked.push({
                name: "code-structure-analysis",
                purpose: "Analyzing code structure and paths",
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
      trace.result = TestCoverageResultSchema.parse(
        message.structured_output
      );
    }
  }

  if (!trace.result) {
    throw new Error("Failed to get structured output from test coverage agent");
  }

  return trace;
}

/**
 * Convenience function for analyzing coverage of a single file
 */
export async function analyzeCoverage(
  filePath: string,
  testDir?: string
): Promise<TestCoverageResult> {
  const trace = await analyzeTestCoverage(filePath, testDir);
  return trace.result!;
}

/**
 * Convenience function for analyzing coverage of multiple files
 * Returns array of coverage results
 */
export async function analyzeCoverageMultiple(
  filePaths: string[],
  testDir?: string
): Promise<TestCoverageResult[]> {
  const results = await Promise.all(
    filePaths.map((filePath) => analyzeCoverage(filePath, testDir))
  );
  return results;
}
