import { readFileSync } from 'fs';
import { ReviewReportSchema } from './src/types/report-types';

const prNumbers = [1, 2, 3];
const baseDir = './reports';

console.log('═'.repeat(80));
console.log('TASK 6.3: REPORT QUALITY VERIFICATION');
console.log('═'.repeat(80));
console.log('');

console.log('🔍 CONTENT QUALITY VERIFICATION');
console.log('─'.repeat(80));
console.log('');

for (const prNum of prNumbers) {
  const reportPath = `${baseDir}/udacity-cd14715-simple-todo-app-${prNum}.json`;
  
  try {
    const reportContent = readFileSync(reportPath, 'utf-8');
    const reportData = JSON.parse(reportContent);
    
    // Validate schema
    const validatedReport = ReviewReportSchema.parse(reportData);
    
    console.log(`PR #${prNum}:`);
    console.log('');
    
    // Check data population
    console.log('  ✅ Data Population:');
    console.log(`     - Pull Request: ${validatedReport.pullRequest.owner}/${validatedReport.pullRequest.repo}#${validatedReport.pullRequest.number}`);
    console.log(`     - Files Reviewed: ${validatedReport.fileReviews.length}`);
    console.log(`     - Overall Score: ${validatedReport.summary.overallScore}/100`);
    
    if (validatedReport.summary.overallScore >= 0 && validatedReport.summary.overallScore <= 100) {
      console.log(`     ✓ Score is valid number (0-100)`);
    } else {
      console.log(`     ✗ Score out of range!`);
    }
    
    // Check issues have specific details
    let totalIssues = 0;
    let issuesWithLineNumbers = 0;
    for (const fileReview of validatedReport.fileReviews) {
      totalIssues += fileReview.codeQuality.issues.length;
      for (const issue of fileReview.codeQuality.issues) {
        if (issue.line !== undefined && issue.line !== null) {
          issuesWithLineNumbers++;
        }
      }
    }
    
    console.log('');
    console.log('  ✅ Code Quality Issues:');
    console.log(`     - Total issues: ${totalIssues}`);
    console.log(`     - Issues with line numbers: ${issuesWithLineNumbers}/${totalIssues}`);
    
    // Check test coverage suggestions
    let totalTestGaps = 0;
    let gapsWithSuggestions = 0;
    for (const fileReview of validatedReport.fileReviews) {
      totalTestGaps += fileReview.testCoverage.untestedPaths.length;
      for (const gap of fileReview.testCoverage.untestedPaths) {
        if (gap.suggestedTest && gap.suggestedTest.length > 10) {
          gapsWithSuggestions++;
        }
      }
    }
    
    console.log('');
    console.log('  ✅ Test Coverage Analysis:');
    console.log(`     - Total test gaps: ${totalTestGaps}`);
    console.log(`     - Gaps with detailed suggestions: ${gapsWithSuggestions}/${totalTestGaps}`);
    
    // Check refactoring suggestions have examples
    let totalRefactorings = 0;
    let refactoringsWithExamples = 0;
    for (const fileReview of validatedReport.fileReviews) {
      totalRefactorings += fileReview.refactorings.suggestions.length;
      for (const ref of fileReview.refactorings.suggestions) {
        if (ref.before && ref.after && ref.before.length > 10 && ref.after.length > 10) {
          refactoringsWithExamples++;
        }
      }
    }
    
    console.log('');
    console.log('  ✅ Refactoring Suggestions:');
    console.log(`     - Total suggestions: ${totalRefactorings}`);
    console.log(`     - Suggestions with code examples: ${refactoringsWithExamples}/${totalRefactorings}`);
    
    // Check summaries
    console.log('');
    console.log('  ✅ Summaries:');
    for (const fileReview of validatedReport.fileReviews) {
      const qualitySummary = fileReview.codeQuality.summary;
      const testSummary = fileReview.testCoverage.summary;
      const refactoringSummary = fileReview.refactorings.summary;
      
      console.log(`     - ${fileReview.file}:`);
      console.log(`       • Quality summary: ${qualitySummary.substring(0, 60)}...`);
      console.log(`       • Test summary: ${testSummary.substring(0, 60)}...`);
      console.log(`       • Refactoring summary: ${refactoringSummary.substring(0, 60)}...`);
    }
    
    console.log('');
    console.log('  ✅ Recommendations:');
    console.log(`     - Total recommendations: ${validatedReport.recommendations.length}`);
    if (validatedReport.recommendations.length > 0) {
      console.log(`     - First recommendation priority: ${validatedReport.recommendations[0].priority}`);
      console.log(`     - All recommendations have descriptions: ${validatedReport.recommendations.every(r => r.description && r.description.length > 20) ? 'Yes ✓' : 'No ✗'}`);
    }
    
    console.log('');
    console.log('  ✅ Metadata:');
    console.log(`     - Analysis timestamp: ${validatedReport.metadata.analyzedAt}`);
    console.log(`     - Duration recorded: ${validatedReport.metadata.duration}ms`);
    console.log(`     - Agent versions: ${Object.keys(validatedReport.metadata.agentVersions).join(', ')}`);
    
    console.log('');
    console.log('═'.repeat(80));
    console.log('');
    
  } catch (error) {
    console.log(`❌ PR #${prNum}: VALIDATION FAILED`);
    if (error instanceof Error) {
      console.log(`   Error: ${error.message}`);
    }
  }
}

console.log('✅ CONTENT QUALITY VERIFICATION COMPLETE');
