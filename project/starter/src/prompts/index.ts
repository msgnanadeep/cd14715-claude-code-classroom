/**
 * Agent Prompts
 *
 * Central export hub for all agent prompts.
 * Each prompt is a detailed instruction set that guides the agent to analyze code
 * and return structured output matching the corresponding Zod schema.
 *
 * Usage:
 * ```typescript
 * import {
 *   CODE_QUALITY_ANALYZER_PROMPT,
 *   TEST_COVERAGE_ANALYZER_PROMPT,
 *   REFACTORING_SUGGESTER_PROMPT
 * } from './prompts/index.js';
 *
 * // Inject prompt into agent query
 * const userMessage = CODE_QUALITY_ANALYZER_PROMPT + '\n\nFile to analyze: ' + filePath;
 * ```
 */

// ============================================================================
// Code Quality Analyzer Prompt
// ============================================================================
// Guides agent to analyze code for security vulnerabilities, performance issues,
// and maintainability concerns. Returns CodeQualityResultSchema.
export { CODE_QUALITY_ANALYZER_PROMPT } from './code-quality-analyzer.prompt.js';

// ============================================================================
// Test Coverage Analyzer Prompt
// ============================================================================
// Guides agent to evaluate test completeness and suggest specific test cases.
// Returns TestCoverageResultSchema.
export { TEST_COVERAGE_ANALYZER_PROMPT } from './test-coverage-analyzer.prompt.js';

// ============================================================================
// Refactoring Suggester Prompt
// ============================================================================
// Guides agent to identify code improvement opportunities with before/after examples.
// Returns RefactoringSuggestionSchema.
export { REFACTORING_SUGGESTER_PROMPT } from './refactoring-suggester.prompt.js';

// ============================================================================
// Orchestrator Prompt
// ============================================================================
// MASTER PROMPT: Coordinates all three subagents to analyze a PR comprehensively.
// Fetches PR data via GitHub MCP, invokes subagents in parallel, aggregates results.
// Returns ReviewReportSchema.
export { ORCHESTRATOR_PROMPT } from './orchestrator.prompt.js';

/**
 * Prompt Registry
 * Maps prompt names to metadata for easy discovery and orchestrator use
 */
export const PromptRegistry = {
  CodeQuality: {
    name: 'Code Quality Analyzer',
    id: 'code-quality-analyzer',
    description: 'Analyzes code for security vulnerabilities, performance issues, and maintainability concerns',
    outputSchema: 'CodeQualityResultSchema',
    skillsUsed: ['javascript-best-practices', 'security-analysis', 'performance-optimization', 'code-review'],
  },
  TestCoverage: {
    name: 'Test Coverage Analyzer',
    id: 'test-coverage-analyzer',
    description: 'Evaluates test completeness and suggests specific test cases for untested code paths',
    outputSchema: 'TestCoverageResultSchema',
    skillsUsed: ['testing-best-practices', 'test-generation', 'edge-case-analysis', 'code-structure-analysis'],
  },
  Refactoring: {
    name: 'Refactoring Suggester',
    id: 'refactoring-suggester',
    description: 'Identifies opportunities to improve code structure, modernize patterns, and enhance clarity',
    outputSchema: 'RefactoringSuggestionSchema',
    skillsUsed: ['code-refactoring', 'design-patterns', 'modernization-strategies', 'code-clarity-improvement'],
  },
  Orchestrator: {
    name: 'Code Review Orchestrator',
    id: 'orchestrator',
    description: 'Master coordinator that fetches PR data, invokes all three subagents in parallel, and aggregates results into a comprehensive review report',
    outputSchema: 'ReviewReportSchema',
    skillsUsed: ['orchestration', 'parallel-execution', 'data-aggregation', 'pr-analysis'],
  },
} as const;
