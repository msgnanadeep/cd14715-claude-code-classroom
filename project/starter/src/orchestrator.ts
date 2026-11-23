import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ReviewReport, ReviewReportSchema, ReviewReportJSONSchema } from './types/report-types.js';
import { ORCHESTRATOR_PROMPT } from './prompts/orchestrator.prompt.js';
import { logger } from './utils/logger.js';
import { mcpServersConfig } from './config/mcp.config.js';
import {
  codeQualityAgent,
  testCoverageAgent,
  refactoringAgent
} from './agents/index.js';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  /**
   * Optional custom model override (defaults to ANTHROPIC_MODEL env var)
   */
  model?: string;

  /**
   * Optional max turns override (defaults to 25)
   */
  maxTurns?: number;

  /**
   * Optional logging flag (defaults to true)
   */
  verbose?: boolean;
}

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 *
 * Architecture:
 * 1. Accepts PR coordinates (owner, repo, prNumber)
 * 2. Sends ORCHESTRATOR_PROMPT to Claude with Task tool enabled
 * 3. Orchestrator fetches PR data via GitHub MCP
 * 4. Orchestrator invokes 3 subagents IN PARALLEL for each modified file
 * 5. Subagents return structured analysis (CodeQuality, TestCoverage, Refactoring)
 * 6. Orchestrator aggregates into ReviewReportSchema
 * 7. Returns complete validated ReviewReport
 */
export class CodeReviewOrchestrator {
  private model: string;
  private maxTurns: number;
  private verbose: boolean;

  constructor(options: OrchestratorOptions = {}) {
    // Configuration with environment variable fallback
    this.model = options.model || process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20251101';
    this.maxTurns = options.maxTurns || 25;
    this.verbose = options.verbose !== false; // Default to true

    if (this.verbose) {
      logger.info('CodeReviewOrchestrator initialized', {
        model: this.model,
        maxTurns: this.maxTurns
      });
    }
  }

  /**
   * Generator function that yields the orchestrator prompt with PR coordinates
   * Pattern: Required by Claude Agent SDK for custom message generation
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   */
  private async *generateMessages(
    owner: string,
    repo: string,
    prNumber: number
  ) {
    yield {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: `${ORCHESTRATOR_PROMPT}

## Pull Request to Review
- Owner: ${owner}
- Repository: ${repo}
- PR Number: ${prNumber}

Please fetch the PR data, invoke all subagents to analyze modified files in parallel, and generate a comprehensive review report.`
      },
      parent_tool_use_id: null,
      session_id: `orchestrator-review-${owner}-${repo}-${prNumber}`
    };
  }

  /**
   * Review a pull request using parallel subagent analysis
   *
   * Flow:
   * 1. Initialize query with orchestrator prompt
   * 2. Configure Agent SDK with:
   *    - Model from env or options
   *    - Task tool enabled (critical for subagent spawning)
   *    - GitHub MCP tools for PR data fetching
   *    - JSON Schema structured output
   *    - maxTurns=25 for orchestration
   *    - permissionMode=auto for CI/CD
   * 3. Iterate over async results until structured_output received
   * 4. Validate output against ReviewReportSchema
   * 5. Return validated ReviewReport
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Complete review report with aggregated analyses
   * @throws Error if orchestration fails or output validation fails
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startTime = Date.now();

    if (this.verbose) {
      logger.info('Starting PR review', { owner, repo, prNumber });
      logger.info('Orchestrator configuration', {
        model: this.model,
        maxTurns: this.maxTurns,
        allowedTools: [
          'Task',
          'mcp__github__get_pull_request',
          'mcp__github__get_pull_request_files',
          'mcp__github__get_pull_request_diff',
          'mcp__github__get_pull_request_commits'
        ],
        registeredSubagents: [
          'code-quality-analyzer',
          'test-coverage-analyzer',
          'refactoring-suggester'
        ]
      });
    }

    try {
      let reviewReport: ReviewReport | null = null;
      let lastError: Error | null = null;
      let messageCount = 0;
      let toolCallCount = 0;
      let subagentInvocations: string[] = [];

      if (this.verbose) {
        logger.info('Launching orchestrator query with agent SDK', {
          owner,
          repo,
          prNumber
        });
      }

      // Query the orchestrator agent using Claude Agent SDK
      for await (const message of query({
        // Async generator that yields the user message with orchestrator prompt
        prompt: this.generateMessages(owner, repo, prNumber),

        // Agent SDK configuration
        options: {
          // Model from environment or constructor options
          model: this.model,

          // ★★★ MCP Servers Configuration
          // Connect to external MCP servers (GitHub, ESLint, etc.)
          // These servers provide tools that the agent can invoke
          mcpServers: mcpServersConfig,

          // ★★★ CRITICAL: allowedTools configuration
          allowedTools: [
            'Task',                      // ★ CRITICAL: Enables subagent invocation

            // GitHub MCP tools for fetching PR data
            // These use the mcp__ prefix to reference MCP server tools
            'mcp__github__get_pull_request',          // Fetch PR metadata
            'mcp__github__get_pull_request_files',    // List files changed in PR
            'mcp__github__get_pull_request_diff',     // Get unified diff
            'mcp__github__get_pull_request_commits',  // Get commit information
          ],

          // ★ Agents: Register the three subagents for the Task tool
          // These agent definitions are imported from ./agents/index.js
          // Each definition includes description, prompt, and tools array with Task enabled
          agents: {
            'code-quality-analyzer': codeQualityAgent,
            'test-coverage-analyzer': testCoverageAgent,
            'refactoring-suggester': refactoringAgent
          },

          // Structured output configuration
          // ReviewReportSchema must be converted to JSON Schema with $refStrategy: 'root'
          // This is already done in src/types/report-types.ts
          outputFormat: {
            type: 'json_schema',
            schema: ReviewReportJSONSchema  // Pre-converted, inlined JSON Schema
          },

          // Reasonable budget for multi-agent orchestration:
          // - Fetch PR data (2-3 turns)
          // - Invoke 3 subagents (3+ turns)
          // - Aggregate results (5+ turns)
          // - Generate recommendations (3+ turns)
          // - Final formatting (2+ turns)
          // - Buffer for retries/errors (5+ turns)
          // Total: ~25 turns
          maxTurns: this.maxTurns
        }
      })) {
        messageCount++;

        // Log streaming progress if verbose
        if (this.verbose) {
          logger.debug('Orchestrator message received', {
            messageCount,
            type: message.type,
            subtype: 'subtype' in message ? message.subtype : undefined
          });
        }

        // Track tool calls and subagent invocations
        if (message.type === 'assistant') {
          const content = message.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use') {
                toolCallCount++;
                const toolName = block.name as string;

                // Track subagent invocations via Task tool
                if (toolName === 'Task') {
                  const taskInput = block.input as Record<string, unknown>;
                  const subagentName = taskInput.description as string;
                  subagentInvocations.push(subagentName);

                  if (this.verbose) {
                    logger.info('Subagent invoked', {
                      subagent: subagentName,
                      invocationCount: subagentInvocations.length
                    });
                  }
                }

                // Track GitHub MCP tool calls
                if (toolName.startsWith('mcp__github__')) {
                  if (this.verbose) {
                    logger.info('GitHub MCP tool called', {
                      tool: toolName,
                      input: block.input
                    });
                  }
                }
              }
            }
          }
        }

        // Check for final result with structured output
        if (message.type === 'result') {
          // Handle success case (has structured_output)
          if ('structured_output' in message && message.structured_output) {
            // ✓ SUCCESS: Received structured output from orchestrator
            // Now validate it against ReviewReportSchema

            // Use safeParse for robust error handling (doesn't throw)
            const validationResult = ReviewReportSchema.safeParse(
              message.structured_output
            );

            if (validationResult.success) {
              // ✓ VALID: Output matches schema exactly
              reviewReport = validationResult.data;

              if (this.verbose) {
                logger.info('Orchestrator aggregation complete', {
                  owner,
                  repo,
                  prNumber,
                  messageCount,
                  toolCallCount,
                  subagentInvocations: subagentInvocations.length,
                  subagentsInvoked: subagentInvocations,
                  filesAnalyzed: reviewReport.fileReviews.map(fr => fr.file),
                  fileCount: reviewReport.fileReviews.length
                });

                logger.info('Orchestrator completed successfully', {
                  owner,
                  repo,
                  prNumber,
                  totalFiles: reviewReport.fileReviews.length,
                  criticalIssues: reviewReport.summary.criticalIssues,
                  codeQualityFindings: reviewReport.fileReviews.reduce(
                    (sum, fr) => sum + (fr.codeQuality?.issues?.length ?? 0),
                    0
                  ),
                  testCoverageFindings: reviewReport.fileReviews.reduce(
                    (sum, fr) => sum + (fr.testCoverage?.untestedPaths?.length ?? 0),
                    0
                  ),
                  refactoringOpportunities: reviewReport.fileReviews.reduce(
                    (sum, fr) => sum + (fr.refactorings?.suggestions?.length ?? 0),
                    0
                  ),
                  duration: Date.now() - startTime
                });
              }
            } else {
              // ✗ INVALID: Output doesn't match schema
              lastError = new Error(
                `Review report validation failed: ${validationResult.error.message}`
              );
              logger.error('Schema validation failed', {
                errors: validationResult.error.flatten(),
                output: JSON.stringify(message.structured_output).substring(0, 500)
              });
            }
          } else {
            // Error case - no structured output
            const errorMsg = 'error_message' in message ? message.error_message : 'Unknown error';
            lastError = new Error(
              `Orchestrator failed: ${errorMsg}`
            );
            logger.error('Orchestrator error', {
              error: errorMsg,
              duration: Date.now() - startTime
            });
          }
        }
      }

      // After async iteration completes, check if we got valid results
      if (reviewReport) {
        return reviewReport;
      } else if (lastError) {
        throw lastError;
      } else {
        throw new Error(
          'Orchestrator completed but produced no structured output'
        );
      }
    } catch (error) {
      // Log and re-throw any errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('PR review failed', {
        owner,
        repo,
        prNumber,
        error: errorMessage,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }
}
