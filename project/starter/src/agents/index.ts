/**
 * Subagent Exports
 *
 * Central export hub for all code review agents used by the orchestrator.
 * Uses ES module syntax with .js extensions for compatibility with Node.js ESM.
 *
 * Three specialized agents are available:
 * 1. Code Quality Analyzer - Detects security, performance, and maintainability issues
 * 2. Test Coverage Analyzer - Evaluates test completeness and suggests test cases
 * 3. Refactoring Suggester - Identifies code improvement opportunities
 *
 * Usage in orchestrator:
 * ```
 * import { analyzeCodeQuality, analyzeTestCoverage, suggestRefactorings } from './agents/index.js';
 *
 * const qualityResult = await analyzeCodeQuality(filePath);
 * const coverageResult = await analyzeTestCoverage(filePath);
 * const refactoringResult = await suggestRefactorings(filePath);
 * ```
 */

// ============================================================================
// Code Quality Analyzer Agent
// ============================================================================
export {
  analyzeCodeQuality,
  AGENT_DESCRIPTION as CodeQualityDescription,
  type AgentTrace as CodeQualityTrace,
} from './code-quality-analyzer.js';

// ============================================================================
// Test Coverage Analyzer Agent
// ============================================================================
export {
  analyzeTestCoverage,
  analyzeCoverage,
  analyzeCoverageMultiple,
  AGENT_DESCRIPTION as TestCoverageDescription,
  type AgentTrace as TestCoverageTrace,
} from './test-coverage-analyzer.js';

// ============================================================================
// Refactoring Suggester Agent
// ============================================================================
export {
  suggestRefactorings,
  refactor,
  filterByType,
  filterByImpact,
  AGENT_DESCRIPTION as RefactoringDescription,
  type AgentTrace as RefactoringTrace,
} from './refactoring-suggester.js';

/**
 * Agent Registry
 * Maps agent names to their descriptions for orchestrator use
 */
export const AgentRegistry = {
  CodeQuality: {
    id: 'code-quality-analyzer',
    name: 'Code Quality Analyzer',
    purpose: 'Analyzes code for security vulnerabilities, performance issues, and maintainability concerns',
  },
  TestCoverage: {
    id: 'test-coverage-analyzer',
    name: 'Test Coverage Analyzer',
    purpose: 'Evaluates test completeness and suggests specific test cases',
  },
  Refactoring: {
    id: 'refactoring-suggester',
    name: 'Refactoring Suggester',
    purpose: 'Identifies opportunities to improve code structure and modernize patterns',
  },
} as const;
