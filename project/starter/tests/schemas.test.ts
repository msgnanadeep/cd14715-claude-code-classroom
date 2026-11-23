import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
  CodeQualityResultJSONSchema,
  TestCoverageResultJSONSchema,
  RefactoringSuggestionJSONSchema,
  type CodeQualityResult,
  type TestCoverageResult,
  type RefactoringSuggestion
} from '../src/types/analysis-results';
import {
  ReviewReportSchema,
  ReviewReportJSONSchema,
  type ReviewReport
} from '../src/types/report-types';

// ============================================================================
// TESTS FOR CodeQualityResultSchema
// ============================================================================

describe('CodeQualityResultSchema', () => {
  describe('Valid Data', () => {
    it('should parse valid code quality result with single issue', () => {
      const validData = {
        file: 'src/index.ts',
        issues: [
          {
            line: 42,
            severity: 'high' as const,
            category: 'security' as const,
            description: 'SQL injection vulnerability detected',
            suggestion: 'Use parameterized queries'
          }
        ],
        overallScore: 75,
        summary: 'Found 1 security issue'
      };

      expect(() => CodeQualityResultSchema.parse(validData)).not.toThrow();
      const result = CodeQualityResultSchema.parse(validData);
      expect(result.file).toBe('src/index.ts');
      expect(result.overallScore).toBe(75);
      expect(result.issues).toHaveLength(1);
    });

    it('should parse valid code quality result with multiple issues of different severities', () => {
      const validData = {
        file: 'src/utils.ts',
        issues: [
          {
            line: 10,
            severity: 'critical' as const,
            category: 'security' as const,
            description: 'XSS vulnerability',
            suggestion: 'Sanitize input'
          },
          {
            line: 20,
            severity: 'medium' as const,
            category: 'performance' as const,
            description: 'Inefficient loop',
            suggestion: 'Use Set instead of Array'
          },
          {
            line: 30,
            severity: 'low' as const,
            category: 'style' as const,
            description: 'Inconsistent naming',
            suggestion: 'Follow camelCase convention'
          }
        ],
        overallScore: 50,
        summary: 'Multiple issues found'
      };

      const result = CodeQualityResultSchema.parse(validData);
      expect(result.issues).toHaveLength(3);
      expect(result.issues[0].severity).toBe('critical');
      expect(result.issues[2].severity).toBe('low');
    });

    it('should parse valid code quality result with all severity types', () => {
      const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;

      severities.forEach(severity => {
        const validData = {
          file: 'test.ts',
          issues: [
            {
              line: 1,
              severity,
              category: 'best-practice' as const,
              description: 'Test issue',
              suggestion: 'Fix it'
            }
          ],
          overallScore: 60,
          summary: 'Test'
        };

        expect(() => CodeQualityResultSchema.parse(validData)).not.toThrow();
      });
    });

    it('should parse valid code quality result with all category types', () => {
      const categories = [
        'security',
        'performance',
        'maintainability',
        'style',
        'bug-risk',
        'best-practice'
      ] as const;

      categories.forEach(category => {
        const validData = {
          file: 'test.ts',
          issues: [
            {
              line: 1,
              severity: 'info' as const,
              category,
              description: 'Test issue',
              suggestion: 'Fix it'
            }
          ],
          overallScore: 60,
          summary: 'Test'
        };

        expect(() => CodeQualityResultSchema.parse(validData)).not.toThrow();
      });
    });
  });

  describe('Invalid Data', () => {
    it('should reject missing file property', () => {
      const invalidData = {
        issues: [],
        overallScore: 75,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject non-string file', () => {
      const invalidData = {
        file: 123,
        issues: [],
        overallScore: 75,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject missing issues property', () => {
      const invalidData = {
        file: 'test.ts',
        overallScore: 75,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject non-array issues', () => {
      const invalidData = {
        file: 'test.ts',
        issues: 'not an array',
        overallScore: 75,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject issue with missing line property', () => {
      const invalidData = {
        file: 'test.ts',
        issues: [
          {
            severity: 'high',
            category: 'security',
            description: 'Issue',
            suggestion: 'Fix'
          }
        ],
        overallScore: 75,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject issue with non-number line', () => {
      const invalidData = {
        file: 'test.ts',
        issues: [
          {
            line: 'forty-two',
            severity: 'high',
            category: 'security',
            description: 'Issue',
            suggestion: 'Fix'
          }
        ],
        overallScore: 75,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject invalid severity enum value', () => {
      const invalidData = {
        file: 'test.ts',
        issues: [
          {
            line: 1,
            severity: 'extreme',
            category: 'security',
            description: 'Issue',
            suggestion: 'Fix'
          }
        ],
        overallScore: 75,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject invalid category enum value', () => {
      const invalidData = {
        file: 'test.ts',
        issues: [
          {
            line: 1,
            severity: 'high',
            category: 'unknown',
            description: 'Issue',
            suggestion: 'Fix'
          }
        ],
        overallScore: 75,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject overallScore below 0', () => {
      const invalidData = {
        file: 'test.ts',
        issues: [],
        overallScore: -1,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject overallScore above 100', () => {
      const invalidData = {
        file: 'test.ts',
        issues: [],
        overallScore: 101,
        summary: 'Test'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject non-string summary', () => {
      const invalidData = {
        file: 'test.ts',
        issues: [],
        overallScore: 75,
        summary: 123
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject missing summary property', () => {
      const invalidData = {
        file: 'test.ts',
        issues: [],
        overallScore: 75
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });
  });

  describe('Edge Cases', () => {
    it('should parse valid result with empty issues array', () => {
      const edgeData = {
        file: 'perfect.ts',
        issues: [],
        overallScore: 100,
        summary: 'No issues found'
      };

      const result = CodeQualityResultSchema.parse(edgeData);
      expect(result.issues).toHaveLength(0);
    });

    it('should parse valid result with score of 0', () => {
      const edgeData = {
        file: 'bad.ts',
        issues: [
          {
            line: 1,
            severity: 'critical' as const,
            category: 'security' as const,
            description: 'Critical issue',
            suggestion: 'Rewrite'
          }
        ],
        overallScore: 0,
        summary: 'Critical issues'
      };

      const result = CodeQualityResultSchema.parse(edgeData);
      expect(result.overallScore).toBe(0);
    });

    it('should parse valid result with score of 100', () => {
      const edgeData = {
        file: 'perfect.ts',
        issues: [],
        overallScore: 100,
        summary: 'Perfect code'
      };

      const result = CodeQualityResultSchema.parse(edgeData);
      expect(result.overallScore).toBe(100);
    });

    it('should parse valid result with very long file path', () => {
      const edgeData = {
        file: 'src/deeply/nested/folder/structure/that/goes/on/and/on/file.ts',
        issues: [],
        overallScore: 50,
        summary: 'Deep path'
      };

      const result = CodeQualityResultSchema.parse(edgeData);
      expect(result.file).toContain('deeply');
    });

    it('should parse valid result with large line numbers', () => {
      const edgeData = {
        file: 'test.ts',
        issues: [
          {
            line: 999999,
            severity: 'info' as const,
            category: 'style' as const,
            description: 'Issue at end of file',
            suggestion: 'Check it'
          }
        ],
        overallScore: 50,
        summary: 'Large line numbers'
      };

      const result = CodeQualityResultSchema.parse(edgeData);
      expect(result.issues[0].line).toBe(999999);
    });

    it('should parse valid result with many issues', () => {
      const issues = Array.from({ length: 100 }, (_, i) => ({
        line: i + 1,
        severity: 'low' as const,
        category: 'style' as const,
        description: `Issue ${i + 1}`,
        suggestion: 'Fix it'
      }));

      const edgeData = {
        file: 'messy.ts',
        issues,
        overallScore: 10,
        summary: 'Many issues'
      };

      const result = CodeQualityResultSchema.parse(edgeData);
      expect(result.issues).toHaveLength(100);
    });
  });
});

// ============================================================================
// TESTS FOR TestCoverageResultSchema
// ============================================================================

describe('TestCoverageResultSchema', () => {
  describe('Valid Data', () => {
    it('should parse valid test coverage result with tests', () => {
      const validData = {
        file: 'src/utils.ts',
        hasTests: true,
        testFiles: ['tests/utils.test.ts'],
        untestedPaths: [],
        coverageEstimate: 95,
        summary: '95% coverage'
      };

      expect(() => TestCoverageResultSchema.parse(validData)).not.toThrow();
      const result = TestCoverageResultSchema.parse(validData);
      expect(result.hasTests).toBe(true);
      expect(result.coverageEstimate).toBe(95);
    });

    it('should parse valid test coverage result without tests', () => {
      const validData = {
        file: 'src/config.ts',
        hasTests: false,
        testFiles: [],
        untestedPaths: [
          {
            type: 'function' as const,
            location: 'loadConfig',
            priority: 'high' as const,
            reasoning: 'Critical initialization',
            suggestedTest: 'Test config loading'
          }
        ],
        coverageEstimate: 0,
        summary: 'No test coverage'
      };

      expect(() => TestCoverageResultSchema.parse(validData)).not.toThrow();
      const result = TestCoverageResultSchema.parse(validData);
      expect(result.hasTests).toBe(false);
    });

    it('should parse valid test coverage with all type enum values', () => {
      const types = ['function', 'class', 'branch', 'edge-case'] as const;

      types.forEach(type => {
        const validData = {
          file: 'test.ts',
          hasTests: true,
          testFiles: ['test.test.ts'],
          untestedPaths: [
            {
              type,
              location: 'location',
              priority: 'low' as const,
              reasoning: 'reason',
              suggestedTest: 'test'
            }
          ],
          coverageEstimate: 50,
          summary: 'Test'
        };

        expect(() => TestCoverageResultSchema.parse(validData)).not.toThrow();
      });
    });

    it('should parse valid test coverage with all priority enum values', () => {
      const priorities = ['critical', 'high', 'medium', 'low'] as const;

      priorities.forEach(priority => {
        const validData = {
          file: 'test.ts',
          hasTests: true,
          testFiles: ['test.test.ts'],
          untestedPaths: [
            {
              type: 'function' as const,
              location: 'location',
              priority,
              reasoning: 'reason',
              suggestedTest: 'test'
            }
          ],
          coverageEstimate: 50,
          summary: 'Test'
        };

        expect(() => TestCoverageResultSchema.parse(validData)).not.toThrow();
      });
    });
  });

  describe('Invalid Data', () => {
    it('should reject missing file property', () => {
      const invalidData = {
        hasTests: true,
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 50,
        summary: 'Test'
      };

      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject missing hasTests property', () => {
      const invalidData = {
        file: 'test.ts',
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 50,
        summary: 'Test'
      };

      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject non-boolean hasTests', () => {
      const invalidData = {
        file: 'test.ts',
        hasTests: 'yes',
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 50,
        summary: 'Test'
      };

      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject non-array testFiles', () => {
      const invalidData = {
        file: 'test.ts',
        hasTests: true,
        testFiles: 'not an array',
        untestedPaths: [],
        coverageEstimate: 50,
        summary: 'Test'
      };

      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject invalid type enum value in untestedPaths', () => {
      const invalidData = {
        file: 'test.ts',
        hasTests: true,
        testFiles: [],
        untestedPaths: [
          {
            type: 'module',
            location: 'location',
            priority: 'low',
            reasoning: 'reason',
            suggestedTest: 'test'
          }
        ],
        coverageEstimate: 50,
        summary: 'Test'
      };

      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject invalid priority enum value in untestedPaths', () => {
      const invalidData = {
        file: 'test.ts',
        hasTests: true,
        testFiles: [],
        untestedPaths: [
          {
            type: 'function',
            location: 'location',
            priority: 'urgent',
            reasoning: 'reason',
            suggestedTest: 'test'
          }
        ],
        coverageEstimate: 50,
        summary: 'Test'
      };

      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject coverageEstimate below 0', () => {
      const invalidData = {
        file: 'test.ts',
        hasTests: true,
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: -1,
        summary: 'Test'
      };

      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject coverageEstimate above 100', () => {
      const invalidData = {
        file: 'test.ts',
        hasTests: true,
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 101,
        summary: 'Test'
      };

      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(z.ZodError);
    });
  });

  describe('Edge Cases', () => {
    it('should parse valid result with empty testFiles array', () => {
      const edgeData = {
        file: 'untested.ts',
        hasTests: false,
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 0,
        summary: 'No tests'
      };

      const result = TestCoverageResultSchema.parse(edgeData);
      expect(result.testFiles).toHaveLength(0);
    });

    it('should parse valid result with empty untestedPaths array', () => {
      const edgeData = {
        file: 'fully-tested.ts',
        hasTests: true,
        testFiles: ['test1.test.ts', 'test2.test.ts'],
        untestedPaths: [],
        coverageEstimate: 100,
        summary: 'Full coverage'
      };

      const result = TestCoverageResultSchema.parse(edgeData);
      expect(result.untestedPaths).toHaveLength(0);
    });

    it('should parse valid result with coverage of 0', () => {
      const edgeData = {
        file: 'untested.ts',
        hasTests: false,
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 0,
        summary: 'No coverage'
      };

      const result = TestCoverageResultSchema.parse(edgeData);
      expect(result.coverageEstimate).toBe(0);
    });

    it('should parse valid result with coverage of 100', () => {
      const edgeData = {
        file: 'perfect.ts',
        hasTests: true,
        testFiles: ['test.test.ts'],
        untestedPaths: [],
        coverageEstimate: 100,
        summary: 'Perfect coverage'
      };

      const result = TestCoverageResultSchema.parse(edgeData);
      expect(result.coverageEstimate).toBe(100);
    });

    it('should parse valid result with many test files', () => {
      const testFiles = Array.from({ length: 50 }, (_, i) => `test${i + 1}.test.ts`);

      const edgeData = {
        file: 'heavily-tested.ts',
        hasTests: true,
        testFiles,
        untestedPaths: [],
        coverageEstimate: 99,
        summary: 'Many tests'
      };

      const result = TestCoverageResultSchema.parse(edgeData);
      expect(result.testFiles).toHaveLength(50);
    });

    it('should parse valid result with many untested paths', () => {
      const untestedPaths = Array.from({ length: 30 }, (_, i) => ({
        type: 'function' as const,
        location: `function${i + 1}`,
        priority: 'low' as const,
        reasoning: `Missing test ${i + 1}`,
        suggestedTest: `Test function${i + 1}`
      }));

      const edgeData = {
        file: 'untested.ts',
        hasTests: false,
        testFiles: [],
        untestedPaths,
        coverageEstimate: 10,
        summary: 'Many untested paths'
      };

      const result = TestCoverageResultSchema.parse(edgeData);
      expect(result.untestedPaths).toHaveLength(30);
    });
  });
});

// ============================================================================
// TESTS FOR RefactoringSuggestionSchema
// ============================================================================

describe('RefactoringSuggestionSchema', () => {
  describe('Valid Data', () => {
    it('should parse valid refactoring suggestion with single suggestion', () => {
      const validData = {
        file: 'src/component.tsx',
        suggestions: [
          {
            type: 'extract-function' as const,
            location: 'renderButton',
            impact: 'high' as const,
            description: 'Extract button rendering logic',
            before: 'const render = () => { ... }',
            after: 'const renderButton = () => { ... }',
            benefits: 'Improves reusability'
          }
        ],
        summary: '1 refactoring suggestion'
      };

      expect(() => RefactoringSuggestionSchema.parse(validData)).not.toThrow();
      const result = RefactoringSuggestionSchema.parse(validData);
      expect(result.suggestions).toHaveLength(1);
    });

    it('should parse valid refactoring suggestion with all type enum values', () => {
      const types = [
        'extract-function',
        'rename',
        'modernize',
        'simplify',
        'pattern-improvement'
      ] as const;

      types.forEach(type => {
        const validData = {
          file: 'test.ts',
          suggestions: [
            {
              type,
              location: 'location',
              impact: 'medium' as const,
              description: 'Suggestion',
              before: 'before',
              after: 'after',
              benefits: 'benefits'
            }
          ],
          summary: 'Test'
        };

        expect(() => RefactoringSuggestionSchema.parse(validData)).not.toThrow();
      });
    });

    it('should parse valid refactoring suggestion with all impact enum values', () => {
      const impacts = ['low', 'medium', 'high'] as const;

      impacts.forEach(impact => {
        const validData = {
          file: 'test.ts',
          suggestions: [
            {
              type: 'simplify' as const,
              location: 'location',
              impact,
              description: 'Suggestion',
              before: 'before',
              after: 'after',
              benefits: 'benefits'
            }
          ],
          summary: 'Test'
        };

        expect(() => RefactoringSuggestionSchema.parse(validData)).not.toThrow();
      });
    });

    it('should parse valid refactoring suggestion with multiple suggestions', () => {
      const validData = {
        file: 'src/utils.ts',
        suggestions: [
          {
            type: 'rename' as const,
            location: 'var1',
            impact: 'low' as const,
            description: 'Rename to meaningful name',
            before: 'var1',
            after: 'userCount',
            benefits: 'Better readability'
          },
          {
            type: 'modernize' as const,
            location: 'asyncCall',
            impact: 'medium' as const,
            description: 'Use async/await',
            before: 'promise.then()',
            after: 'await promise',
            benefits: 'Cleaner code'
          }
        ],
        summary: '2 suggestions'
      };

      const result = RefactoringSuggestionSchema.parse(validData);
      expect(result.suggestions).toHaveLength(2);
    });
  });

  describe('Invalid Data', () => {
    it('should reject missing file property', () => {
      const invalidData = {
        suggestions: [],
        summary: 'Test'
      };

      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject missing suggestions property', () => {
      const invalidData = {
        file: 'test.ts',
        summary: 'Test'
      };

      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject non-array suggestions', () => {
      const invalidData = {
        file: 'test.ts',
        suggestions: 'not an array',
        summary: 'Test'
      };

      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject invalid type enum value', () => {
      const invalidData = {
        file: 'test.ts',
        suggestions: [
          {
            type: 'optimize',
            location: 'location',
            impact: 'low',
            description: 'Suggestion',
            before: 'before',
            after: 'after',
            benefits: 'benefits'
          }
        ],
        summary: 'Test'
      };

      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject invalid impact enum value', () => {
      const invalidData = {
        file: 'test.ts',
        suggestions: [
          {
            type: 'simplify',
            location: 'location',
            impact: 'critical',
            description: 'Suggestion',
            before: 'before',
            after: 'after',
            benefits: 'benefits'
          }
        ],
        summary: 'Test'
      };

      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject suggestion missing location', () => {
      const invalidData = {
        file: 'test.ts',
        suggestions: [
          {
            type: 'simplify',
            impact: 'low',
            description: 'Suggestion',
            before: 'before',
            after: 'after',
            benefits: 'benefits'
          }
        ],
        summary: 'Test'
      };

      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject missing summary property', () => {
      const invalidData = {
        file: 'test.ts',
        suggestions: []
      };

      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(z.ZodError);
    });
  });

  describe('Edge Cases', () => {
    it('should parse valid result with empty suggestions array', () => {
      const edgeData = {
        file: 'perfect.ts',
        suggestions: [],
        summary: 'No suggestions'
      };

      const result = RefactoringSuggestionSchema.parse(edgeData);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should parse valid result with many suggestions', () => {
      const suggestions = Array.from({ length: 50 }, (_, i) => ({
        type: 'simplify' as const,
        location: `location${i + 1}`,
        impact: 'low' as const,
        description: `Suggestion ${i + 1}`,
        before: `before${i + 1}`,
        after: `after${i + 1}`,
        benefits: `benefits${i + 1}`
      }));

      const edgeData = {
        file: 'messy.ts',
        suggestions,
        summary: 'Many suggestions'
      };

      const result = RefactoringSuggestionSchema.parse(edgeData);
      expect(result.suggestions).toHaveLength(50);
    });

    it('should parse valid result with very long before/after strings', () => {
      const longCode = Array.from({ length: 1000 }, () => 'a').join('');

      const edgeData = {
        file: 'test.ts',
        suggestions: [
          {
            type: 'simplify' as const,
            location: 'location',
            impact: 'high' as const,
            description: 'Simplify complex code',
            before: longCode,
            after: 'simplified',
            benefits: 'Much better'
          }
        ],
        summary: 'Large code blocks'
      };

      const result = RefactoringSuggestionSchema.parse(edgeData);
      expect(result.suggestions[0].before).toHaveLength(1000);
    });
  });
});

// ============================================================================
// TESTS FOR ReviewReportSchema
// ============================================================================

describe('ReviewReportSchema', () => {
  describe('Valid Data', () => {
    it('should parse valid review report with single file review', () => {
      const validData: ReviewReport = {
        pullRequest: {
          owner: 'octocat',
          repo: 'Hello-World',
          number: 1
        },
        fileReviews: [
          {
            file: 'src/index.ts',
            codeQuality: {
              file: 'src/index.ts',
              issues: [],
              overallScore: 85,
              summary: 'Good code'
            },
            testCoverage: {
              file: 'src/index.ts',
              hasTests: true,
              testFiles: ['tests/index.test.ts'],
              untestedPaths: [],
              coverageEstimate: 95,
              summary: '95% coverage'
            },
            refactorings: {
              file: 'src/index.ts',
              suggestions: [],
              summary: 'No suggestions'
            }
          }
        ],
        summary: {
          totalFiles: 1,
          overallScore: 85,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 5000,
          agentVersions: {
            'code-quality': '1.0',
            'test-coverage': '1.0',
            'refactoring': '1.0'
          }
        }
      };

      expect(() => ReviewReportSchema.parse(validData)).not.toThrow();
      const result = ReviewReportSchema.parse(validData);
      expect(result.fileReviews).toHaveLength(1);
    });

    it('should parse valid review report with multiple file reviews', () => {
      const validData: ReviewReport = {
        pullRequest: {
          owner: 'user',
          repo: 'repo',
          number: 42
        },
        fileReviews: [
          {
            file: 'src/file1.ts',
            codeQuality: {
              file: 'src/file1.ts',
              issues: [],
              overallScore: 90,
              summary: 'Good'
            },
            testCoverage: {
              file: 'src/file1.ts',
              hasTests: true,
              testFiles: [],
              untestedPaths: [],
              coverageEstimate: 100,
              summary: 'Full coverage'
            },
            refactorings: {
              file: 'src/file1.ts',
              suggestions: [],
              summary: 'No suggestions'
            }
          },
          {
            file: 'src/file2.ts',
            codeQuality: {
              file: 'src/file2.ts',
              issues: [],
              overallScore: 70,
              summary: 'Needs work'
            },
            testCoverage: {
              file: 'src/file2.ts',
              hasTests: false,
              testFiles: [],
              untestedPaths: [],
              coverageEstimate: 0,
              summary: 'No coverage'
            },
            refactorings: {
              file: 'src/file2.ts',
              suggestions: [],
              summary: 'Some suggestions'
            }
          }
        ],
        summary: {
          totalFiles: 2,
          overallScore: 80,
          criticalIssues: 0,
          highPriorityTests: 1,
          refactoringOpportunities: 2
        },
        recommendations: [
          {
            priority: 'high' as const,
            category: 'testing',
            description: 'Add tests to file2.ts',
            files: ['src/file2.ts']
          }
        ],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 10000,
          agentVersions: {
            'code-quality': '1.0'
          }
        }
      };

      expect(() => ReviewReportSchema.parse(validData)).not.toThrow();
      const result = ReviewReportSchema.parse(validData);
      expect(result.fileReviews).toHaveLength(2);
      expect(result.recommendations).toHaveLength(1);
    });

    it('should parse valid review report with all recommendation priorities', () => {
      const priorities = ['critical', 'high', 'medium', 'low'] as const;

      priorities.forEach(priority => {
        const validData: ReviewReport = {
          pullRequest: { owner: 'o', repo: 'r', number: 1 },
          fileReviews: [],
          summary: {
            totalFiles: 0,
            overallScore: 50,
            criticalIssues: 0,
            highPriorityTests: 0,
            refactoringOpportunities: 0
          },
          recommendations: [
            {
              priority,
              category: 'testing',
              description: 'Add tests',
              files: []
            }
          ],
          metadata: {
            analyzedAt: new Date().toISOString(),
            duration: 1000,
            agentVersions: {}
          }
        };

        expect(() => ReviewReportSchema.parse(validData)).not.toThrow();
      });
    });
  });

  describe('Invalid Data', () => {
    it('should reject missing pullRequest property', () => {
      const invalidData = {
        fileReviews: [],
        summary: {
          totalFiles: 0,
          overallScore: 50,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 1000,
          agentVersions: {}
        }
      };

      expect(() => ReviewReportSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject pullRequest with missing owner', () => {
      const invalidData = {
        pullRequest: { repo: 'r', number: 1 },
        fileReviews: [],
        summary: {
          totalFiles: 0,
          overallScore: 50,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 1000,
          agentVersions: {}
        }
      };

      expect(() => ReviewReportSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject missing fileReviews property', () => {
      const invalidData = {
        pullRequest: { owner: 'o', repo: 'r', number: 1 },
        summary: {
          totalFiles: 0,
          overallScore: 50,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 1000,
          agentVersions: {}
        }
      };

      expect(() => ReviewReportSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject invalid recommendation priority', () => {
      const invalidData = {
        pullRequest: { owner: 'o', repo: 'r', number: 1 },
        fileReviews: [],
        summary: {
          totalFiles: 0,
          overallScore: 50,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [
          {
            priority: 'urgent',
            category: 'testing',
            description: 'Add tests',
            files: []
          }
        ],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 1000,
          agentVersions: {}
        }
      };

      expect(() => ReviewReportSchema.parse(invalidData)).toThrow(z.ZodError);
    });

    it('should reject missing metadata property', () => {
      const invalidData = {
        pullRequest: { owner: 'o', repo: 'r', number: 1 },
        fileReviews: [],
        summary: {
          totalFiles: 0,
          overallScore: 50,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: []
      };

      expect(() => ReviewReportSchema.parse(invalidData)).toThrow(z.ZodError);
    });
  });

  describe('Edge Cases', () => {
    it('should parse valid report with empty fileReviews array', () => {
      const edgeData: ReviewReport = {
        pullRequest: { owner: 'o', repo: 'r', number: 1 },
        fileReviews: [],
        summary: {
          totalFiles: 0,
          overallScore: 50,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 1000,
          agentVersions: {}
        }
      };

      const result = ReviewReportSchema.parse(edgeData);
      expect(result.fileReviews).toHaveLength(0);
    });

    it('should parse valid report with many file reviews', () => {
      const fileReviews = Array.from({ length: 100 }, (_, i) => ({
        file: `src/file${i + 1}.ts`,
        codeQuality: {
          file: `src/file${i + 1}.ts`,
          issues: [],
          overallScore: Math.min(100, 50 + (i % 50)),
          summary: `File ${i + 1}`
        },
        testCoverage: {
          file: `src/file${i + 1}.ts`,
          hasTests: true,
          testFiles: [],
          untestedPaths: [],
          coverageEstimate: 50,
          summary: 'Some coverage'
        },
        refactorings: {
          file: `src/file${i + 1}.ts`,
          suggestions: [],
          summary: 'No suggestions'
        }
      }));

      const edgeData: ReviewReport = {
        pullRequest: { owner: 'o', repo: 'r', number: 1 },
        fileReviews,
        summary: {
          totalFiles: 100,
          overallScore: 70,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 60000,
          agentVersions: {}
        }
      };

      const result = ReviewReportSchema.parse(edgeData);
      expect(result.fileReviews).toHaveLength(100);
    });

    it('should parse valid report with many recommendations', () => {
      const recommendations = Array.from({ length: 50 }, (_, i) => ({
        priority: 'low' as const,
        category: `category${i + 1}`,
        description: `Recommendation ${i + 1}`,
        files: [`file${i + 1}.ts`]
      }));

      const edgeData: ReviewReport = {
        pullRequest: { owner: 'o', repo: 'r', number: 1 },
        fileReviews: [],
        summary: {
          totalFiles: 1,
          overallScore: 50,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 50
        },
        recommendations,
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 1000,
          agentVersions: {}
        }
      };

      const result = ReviewReportSchema.parse(edgeData);
      expect(result.recommendations).toHaveLength(50);
    });
  });
});

// ============================================================================
// TESTS FOR JSON Schema Exports
// ============================================================================

describe('JSON Schema Exports', () => {
  describe('CodeQualityResultJSONSchema', () => {
    it('should produce valid JSON schema', () => {
      expect(CodeQualityResultJSONSchema).toBeDefined();
      expect(typeof CodeQualityResultJSONSchema).toBe('object');
      expect(CodeQualityResultJSONSchema).not.toBeNull();
    });

    it('should have type property', () => {
      expect(CodeQualityResultJSONSchema.type).toBe('object');
    });

    it('should mark required properties', () => {
      expect(CodeQualityResultJSONSchema.required).toBeDefined();
      expect(Array.isArray(CodeQualityResultJSONSchema.required)).toBe(true);
      expect(CodeQualityResultJSONSchema.required).toContain('file');
      expect(CodeQualityResultJSONSchema.required).toContain('issues');
      expect(CodeQualityResultJSONSchema.required).toContain('overallScore');
      expect(CodeQualityResultJSONSchema.required).toContain('summary');
    });

    it('should have properties object', () => {
      expect(CodeQualityResultJSONSchema.properties).toBeDefined();
      expect(typeof CodeQualityResultJSONSchema.properties).toBe('object');
    });
  });

  describe('TestCoverageResultJSONSchema', () => {
    it('should produce valid JSON schema', () => {
      expect(TestCoverageResultJSONSchema).toBeDefined();
      expect(typeof TestCoverageResultJSONSchema).toBe('object');
    });

    it('should have type property', () => {
      expect(TestCoverageResultJSONSchema.type).toBe('object');
    });

    it('should mark required properties', () => {
      expect(TestCoverageResultJSONSchema.required).toBeDefined();
      expect(TestCoverageResultJSONSchema.required).toContain('file');
      expect(TestCoverageResultJSONSchema.required).toContain('hasTests');
      expect(TestCoverageResultJSONSchema.required).toContain('coverageEstimate');
    });
  });

  describe('RefactoringSuggestionJSONSchema', () => {
    it('should produce valid JSON schema', () => {
      expect(RefactoringSuggestionJSONSchema).toBeDefined();
      expect(typeof RefactoringSuggestionJSONSchema).toBe('object');
    });

    it('should have type property', () => {
      expect(RefactoringSuggestionJSONSchema.type).toBe('object');
    });

    it('should mark required properties', () => {
      expect(RefactoringSuggestionJSONSchema.required).toBeDefined();
      expect(RefactoringSuggestionJSONSchema.required).toContain('file');
      expect(RefactoringSuggestionJSONSchema.required).toContain('suggestions');
      expect(RefactoringSuggestionJSONSchema.required).toContain('summary');
    });
  });

  describe('ReviewReportJSONSchema', () => {
    it('should produce valid JSON schema', () => {
      expect(ReviewReportJSONSchema).toBeDefined();
      expect(typeof ReviewReportJSONSchema).toBe('object');
    });

    it('should have type property', () => {
      expect(ReviewReportJSONSchema.type).toBe('object');
    });

    it('should mark required properties', () => {
      expect(ReviewReportJSONSchema.required).toBeDefined();
      expect(ReviewReportJSONSchema.required).toContain('pullRequest');
      expect(ReviewReportJSONSchema.required).toContain('fileReviews');
      expect(ReviewReportJSONSchema.required).toContain('summary');
      expect(ReviewReportJSONSchema.required).toContain('recommendations');
      expect(ReviewReportJSONSchema.required).toContain('metadata');
    });

    it('should have nested properties', () => {
      const props = ReviewReportJSONSchema.properties as Record<string, unknown>;
      expect(props.pullRequest).toBeDefined();
      expect(props.fileReviews).toBeDefined();
      expect(props.summary).toBeDefined();
      expect(props.recommendations).toBeDefined();
      expect(props.metadata).toBeDefined();
    });
  });
});
