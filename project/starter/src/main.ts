import 'dotenv/config';
import { promises as fs } from 'fs';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';
import {
  withRetry,
  withTimeout,
  isReviewError,
  ErrorCodes,
  formatError
} from './utils/error-handler.js';
import { logger } from './utils/logger.js';

/**
 * Claude Multi-Agent Code Review System
 * Analyzes pull requests using multiple specialized agents
 *
 * Usage: npm run dev -- <owner> <repo> <pr-number>
 * Example: npm run dev -- octocat Hello-World 1
 *
 * Features:
 * - Validates all command-line arguments
 * - Checks authentication (Anthropic API or AWS Bedrock)
 * - Verifies model configuration
 * - Analyzes PRs with 3 parallel agents
 * - Generates reports in Markdown, HTML, and JSON
 * - Saves reports to reports/ directory
 */
async function main() {
  const startTime = Date.now();
  const [owner, repo, prStr] = process.argv.slice(2);

  try {
    // ============================================================================
    // VALIDATION STEP 1: Command-Line Arguments
    // ============================================================================
    console.log('📋 Validating command-line arguments...');

    if (!owner || !repo || !prStr) {
      console.error('');
      console.error('❌ Missing required arguments');
      console.error('');
      console.error('Usage:');
      console.error('  npm run dev -- <owner> <repo> <pr-number>');
      console.error('');
      console.error('Example:');
      console.error('  npm run dev -- octocat Hello-World 1');
      console.error('');
      console.error('Arguments:');
      console.error('  owner     - Repository owner (e.g., octocat)');
      console.error('  repo      - Repository name (e.g., Hello-World)');
      console.error('  pr-number - Pull request number (e.g., 1)');
      console.error('');
      process.exit(1);
    }

    // ★ VALIDATE PR NUMBER
    const prNumber = parseInt(prStr, 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      console.error('');
      console.error(`❌ Invalid PR number: "${prStr}"`);
      console.error('');
      console.error('PR number must be a positive integer');
      console.error(`  Provided: "${prStr}"`);
      console.error(`  Parsed as: ${isNaN(prNumber) ? 'not a number' : prNumber}`);
      console.error('');
      process.exit(1);
    }

    console.log(`✓ Owner: ${owner}`);
    console.log(`✓ Repository: ${repo}`);
    console.log(`✓ PR Number: ${prNumber}`);
    console.log('');

    // ============================================================================
    // VALIDATION STEP 2: Authentication Method
    // ============================================================================
    console.log('🔐 Validating authentication...');

    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasAwsAuth =
      !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;

    if (!hasAnthropicKey && !hasAwsAuth) {
      console.error('');
      console.error('❌ No authentication configured');
      console.error('');
      console.error('Please configure ONE of the following:');
      console.error('');
      console.error('Option 1: Anthropic API');
      console.error('  export ANTHROPIC_API_KEY="sk-ant-..."');
      console.error('');
      console.error('Option 2: AWS Bedrock');
      console.error('  export AWS_ACCESS_KEY_ID="..."');
      console.error('  export AWS_SECRET_ACCESS_KEY="..."');
      console.error('  export AWS_REGION="us-east-1"');
      console.error('');
      process.exit(1);
    }

    if (hasAnthropicKey) {
      console.log('✓ Using Anthropic API authentication');
      console.log(`  Key configured: ${process.env.ANTHROPIC_API_KEY?.substring(0, 7)}...`);
    }

    if (hasAwsAuth) {
      console.log('✓ Using AWS Bedrock authentication');

      // ★ VALIDATE AWS_REGION IF USING BEDROCK
      if (!process.env.AWS_REGION) {
        console.error('');
        console.error('❌ AWS_REGION not configured (required for Bedrock)');
        console.error('');
        console.error('Set the region:');
        console.error('  export AWS_REGION="us-east-1"  # or your preferred region');
        console.error('');
        process.exit(1);
      }
      console.log(`  Region: ${process.env.AWS_REGION}`);
      console.log(
        `  Keys configured: ${process.env.AWS_ACCESS_KEY_ID?.substring(0, 4)}... / ${process.env.AWS_SECRET_ACCESS_KEY?.substring(0, 4)}...`
      );
    }

    console.log('');

    // ============================================================================
    // VALIDATION STEP 3: Model Configuration
    // ============================================================================
    console.log('🤖 Validating model configuration...');

    if (!process.env.ANTHROPIC_MODEL) {
      console.error('');
      console.error('❌ ANTHROPIC_MODEL environment variable not set');
      console.error('');
      console.error('Set the model for your authentication method:');
      console.error('');
      console.error('For Anthropic API:');
      console.error('  export ANTHROPIC_MODEL="claude-sonnet-4-5-20250929"');
      console.error('  export ANTHROPIC_MODEL="claude-opus-4-5-20251101"');
      console.error('');
      console.error('For AWS Bedrock:');
      console.error('  export ANTHROPIC_MODEL="us.anthropic.claude-sonnet-4-5-20250929-v1:0"');
      console.error('  export ANTHROPIC_MODEL="us.anthropic.claude-opus-4-5-20251101-v1:0"');
      console.error('');
      process.exit(1);
    }

    console.log(`✓ Model: ${process.env.ANTHROPIC_MODEL}`);
    console.log('');

    // ============================================================================
    // STEP 4: Create Orchestrator
    // ============================================================================
    console.log('🔧 Initializing code review orchestrator...');

    const orchestrator = new CodeReviewOrchestrator({
      model: process.env.ANTHROPIC_MODEL,
      maxTurns: 25,
      verbose: true
    });

    console.log('✓ Orchestrator initialized');
    console.log('');

    // ============================================================================
    // STEP 5: Run PR Review with Error Handling & Rate Limiting
    // ============================================================================
    console.log('🔍 Starting PR analysis...');
    console.log('');
    console.log('This will:');
    console.log('  1️⃣  Fetch PR data via GitHub MCP');
    console.log('  2️⃣  Invoke 3 subagents in parallel:');
    console.log('      • Code Quality Analyzer (security, performance, maintainability)');
    console.log('      • Test Coverage Analyzer (testing gaps, suggested tests)');
    console.log('      • Refactoring Suggester (improvements, modernization)');
    console.log('  3️⃣  Aggregate results into unified review');
    console.log('  4️⃣  Generate reports in multiple formats');
    console.log('');

    // ★ WITH ERROR HANDLING & TIMEOUTS
    const result = await withRetry(
      () =>
        withTimeout(
          () => orchestrator.reviewPullRequest(owner, repo, prNumber),
          300000, // 5 minute timeout
          'PR review exceeded 5 minute time limit'
        ),
      3, // Max 3 retries
      1000 // 1 second base delay
    );

    console.log('');
    console.log('✅ Analysis complete!');
    console.log('');

    // ============================================================================
    // STEP 6: Generate Reports in Multiple Formats
    // ============================================================================
    console.log('📊 Generating reports...');

    const reportGenerator = new ReportGenerator();

    // ★ GENERATE THREE REPORT FORMATS
    const markdownReport = reportGenerator.generateMarkdownReport(result);
    const htmlReport = reportGenerator.generateHTMLReport(result);
    const jsonReport = reportGenerator.generateJSONReport(result);

    // ============================================================================
    // STEP 7: Create reports/ Directory and Save Files
    // ============================================================================
    console.log('💾 Saving reports to disk...');

    // ★ CREATE REPORTS DIRECTORY IF IT DOESN'T EXIST
    try {
      await fs.mkdir('reports', { recursive: true });
    } catch (error) {
      logger.warn('Could not create reports directory', { error });
    }

    // ★ GENERATE FILENAMES WITH TIMESTAMP AND PR INFO
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `${owner}-${repo}-${prNumber}`;

    const markdownPath = `reports/${baseFilename}.md`;
    const htmlPath = `reports/${baseFilename}.html`;
    const jsonPath = `reports/${baseFilename}.json`;

    // ★ SAVE ALL THREE REPORTS
    await fs.writeFile(markdownPath, markdownReport, 'utf-8');
    console.log(`  ✓ Markdown: ${markdownPath}`);

    await fs.writeFile(htmlPath, htmlReport, 'utf-8');
    console.log(`  ✓ HTML: ${htmlPath}`);

    await fs.writeFile(jsonPath, jsonReport, 'utf-8');
    console.log(`  ✓ JSON: ${jsonPath}`);

    console.log('');

    // ============================================================================
    // STEP 8: Display Summary
    // ============================================================================
    console.log('📋 Review Summary:');
    console.log('');
    console.log(
      JSON.stringify(
        {
          pullRequest: result.pullRequest,
          filesReviewed: result.fileReviews.length,
          overallScore: result.summary.overallScore,
          criticalIssues: result.summary.criticalIssues,
          highPriorityTests: result.summary.highPriorityTests,
          refactoringOpportunities: result.summary.refactoringOpportunities,
          totalRecommendations: result.recommendations.length
        },
        null,
        2
      )
    );

    console.log('');

    // ============================================================================
    // STEP 9: Final Status
    // ============================================================================
    const duration = Date.now() - startTime;
    console.log('🎉 Success!');
    console.log('');
    console.log('📝 Reports generated:');
    console.log(`  • Markdown (for PR comments): ${markdownPath}`);
    console.log(`  • HTML (for web viewing): ${htmlPath}`);
    console.log(`  • JSON (for programmatic use): ${jsonPath}`);
    console.log('');
    console.log(`⏱️  Total time: ${(duration / 1000).toFixed(1)}s`);
    console.log('');

    logger.info('Code review completed successfully', {
      owner,
      repo,
      prNumber,
      fileCount: result.fileReviews.length,
      criticalIssues: result.summary.criticalIssues,
      duration
    });

  } catch (error) {
    // ============================================================================
    // ERROR HANDLING
    // ============================================================================
    console.error('');
    console.error('❌ Error occurred during code review:');
    console.error('');

    if (isReviewError(error)) {
      // ★ HANDLE REVIEW-SPECIFIC ERRORS
      console.error(`Error Type: [${error.code}]`);
      console.error(`Message: ${error.message}`);

      if (error.metadata) {
        console.error('Metadata:', JSON.stringify(error.metadata, null, 2));
      }

      console.error('');

      // ★ PROVIDE HELPFUL GUIDANCE FOR SPECIFIC ERROR CODES
      switch (error.code) {
        case ErrorCodes.AGENT_TIMEOUT:
          console.error('💡 Troubleshooting: Agent operation timed out');
          console.error('  • Try increasing maxTurns in CodeReviewOrchestrator');
          console.error('  • Check API health and network connectivity');
          console.error('  • Large PRs may need longer timeouts');
          break;

        case ErrorCodes.RETRY_EXHAUSTED:
          console.error('💡 Troubleshooting: All retry attempts failed');
          console.error('  • Check API credentials and rate limits');
          console.error('  • Verify GitHub token has proper permissions');
          console.error('  • Wait and retry later if rate limited');
          break;

        case ErrorCodes.VALIDATION_FAILED:
          console.error('💡 Troubleshooting: Output validation failed');
          console.error('  • Review report structure may not match schema');
          console.error('  • Check orchestrator prompt and agent outputs');
          break;

        default:
          console.error('💡 Troubleshooting: Check error code and metadata above');
          break;
      }
    } else if (error instanceof Error) {
      // ★ HANDLE STANDARD JAVASCRIPT ERRORS
      console.error(`Error: ${error.name}`);
      console.error(`Message: ${error.message}`);

      if (process.env.DEBUG) {
        console.error('Stack trace:');
        console.error(error.stack);
      }

      console.error('');
      console.error('💡 Additional troubleshooting:');

      if (error.message.includes('ENOENT')) {
        console.error('  • File or directory not found');
      } else if (error.message.includes('EACCES')) {
        console.error('  • Permission denied - check file permissions');
      } else if (error.message.includes('network')) {
        console.error('  • Network error - check connectivity and proxy settings');
      }
    } else {
      // ★ HANDLE UNKNOWN ERROR TYPES
      console.error(`Unexpected error: ${error}`);
    }

    console.error('');
    console.error('📚 For more information:');
    console.error('  • Run with DEBUG=1 for detailed stack traces');
    console.error('  • Check .env file for proper configuration');
    console.error('  • Verify GitHub repository is accessible');
    console.error('  • Confirm PR number exists in repository');
    console.error('');

    logger.error('Code review failed', {
      error: error instanceof Error ? error.message : String(error),
      code: isReviewError(error) ? error.code : 'UNKNOWN'
    });

    process.exit(1);
  }
}

main();
