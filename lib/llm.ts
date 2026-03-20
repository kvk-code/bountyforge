/**
 * LLM Integration Library for BountyForge
 * 
 * Handles PDF-to-Markdown conversion and evaluation scoring.
 * Supports Claude API (primary) and OpenAI API (fallback).
 */

import Anthropic from '@anthropic-ai/sdk';

// Evaluation criteria weights (must sum to 100)
const EVALUATION_WEIGHTS = {
  formatting: 25,
  completeness: 25,
  structure: 25,
  readability: 25,
};

export interface LLMConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  model?: string;
}

export interface EvaluationScore {
  formatting: number;      // 0-25: Headers, lists, tables, code blocks preserved
  completeness: number;    // 0-25: All content from PDF present
  structure: number;       // 0-25: Document hierarchy maintained
  readability: number;     // 0-25: Clean markdown, no artifacts
  total: number;           // 0-100: Sum of all scores
  feedback: string;        // Brief evaluation feedback
}

export interface ConversionResult {
  markdown: string;
  metadata: {
    pageCount: number;
    title?: string;
    processingTime: number;
  };
}

/**
 * LLM Client for PDF conversion and evaluation
 */
export class LLMClient {
  private anthropic: Anthropic | null = null;
  private model: string;

  constructor(config: LLMConfig = {}) {
    const anthropicKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    
    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
    }
    
    this.model = config.model || 'claude-sonnet-4-20250514';
  }

  /**
   * Check if LLM is configured
   */
  isConfigured(): boolean {
    return this.anthropic !== null;
  }

  /**
   * Convert PDF content to Markdown
   * Takes PDF as base64 or extracted text
   */
  async convertPDFToMarkdown(
    pdfContent: string | Buffer,
    options: {
      isBase64?: boolean;
      extractedText?: string;
      preserveImages?: boolean;
    } = {}
  ): Promise<ConversionResult> {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY');
    }

    const startTime = Date.now();

    // Build the prompt based on input type
    let content: Anthropic.MessageCreateParams['messages'][0]['content'];
    
    if (options.extractedText) {
      // Text was pre-extracted from PDF
      content = [
        {
          type: 'text' as const,
          text: `You are a PDF-to-Markdown converter. Convert the following extracted PDF text to clean, well-formatted Markdown.

INSTRUCTIONS:
1. Preserve all headings and hierarchy
2. Format lists properly (bullet points, numbered lists)
3. Format tables using Markdown table syntax
4. Preserve code blocks with proper syntax highlighting hints
5. Maintain document structure and flow
6. Remove artifacts like page numbers, headers/footers
7. Clean up any OCR errors if apparent

EXTRACTED PDF TEXT:
${options.extractedText}

OUTPUT: Return ONLY the converted Markdown, no explanations.`
        }
      ];
    } else if (Buffer.isBuffer(pdfContent) || options.isBase64) {
      // PDF as binary - use vision capability
      const base64Data = Buffer.isBuffer(pdfContent) 
        ? pdfContent.toString('base64')
        : pdfContent;
      
      content = [
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as any,
            data: base64Data,
          },
        },
        {
          type: 'text' as const,
          text: `Convert this PDF document to clean, well-formatted Markdown.

INSTRUCTIONS:
1. Preserve all headings and hierarchy
2. Format lists properly (bullet points, numbered lists)
3. Format tables using Markdown table syntax
4. Preserve code blocks with proper syntax highlighting hints
5. Maintain document structure and flow
6. Remove artifacts like page numbers, headers/footers
${options.preserveImages ? '7. Note image locations with ![Image](placeholder)' : ''}

OUTPUT: Return ONLY the converted Markdown, no explanations.`
        }
      ];
    } else {
      throw new Error('Invalid input: provide extractedText, base64 string, or Buffer');
    }

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 16000,
      messages: [{ role: 'user', content }],
    });

    const markdown = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return {
      markdown,
      metadata: {
        pageCount: 1, // Will be set by PDF parser
        processingTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Evaluate a markdown conversion against the original PDF
   */
  async evaluateConversion(
    originalPdfText: string,
    convertedMarkdown: string
  ): Promise<EvaluationScore> {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY');
    }

    const prompt = `You are evaluating a PDF-to-Markdown conversion quality. Score each criterion from 0-25.

ORIGINAL PDF TEXT:
---
${originalPdfText.slice(0, 10000)}${originalPdfText.length > 10000 ? '\n...[truncated]' : ''}
---

CONVERTED MARKDOWN:
---
${convertedMarkdown.slice(0, 10000)}${convertedMarkdown.length > 10000 ? '\n...[truncated]' : ''}
---

SCORING CRITERIA (0-25 each):

1. FORMATTING (0-25): Headers, lists, tables, code blocks preserved correctly
   - 25: Perfect formatting, all elements converted correctly
   - 20: Minor formatting issues
   - 15: Some elements not formatted properly
   - 10: Significant formatting problems
   - 0-5: Major formatting failures

2. COMPLETENESS (0-25): All content from PDF is present in markdown
   - 25: 100% of content preserved
   - 20: 95%+ content preserved
   - 15: 80%+ content preserved
   - 10: 60%+ content preserved
   - 0-5: Significant content missing

3. STRUCTURE (0-25): Document hierarchy and organization maintained
   - 25: Perfect structure preservation
   - 20: Minor hierarchy issues
   - 15: Some structure lost
   - 10: Significant reorganization
   - 0-5: Structure badly damaged

4. READABILITY (0-25): Clean markdown, no artifacts, proper line breaks
   - 25: Perfectly clean and readable
   - 20: Minor readability issues
   - 15: Some artifacts or awkward formatting
   - 10: Noticeable readability problems
   - 0-5: Hard to read

Return ONLY a JSON object with this exact structure:
{
  "formatting": <number 0-25>,
  "completeness": <number 0-25>,
  "structure": <number 0-25>,
  "readability": <number 0-25>,
  "total": <sum of all scores 0-100>,
  "feedback": "<brief 1-2 sentence evaluation>"
}`;

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse evaluation response as JSON');
    }

    const evaluation = JSON.parse(jsonMatch[0]) as EvaluationScore;
    
    // Validate scores
    const scores = ['formatting', 'completeness', 'structure', 'readability'] as const;
    for (const key of scores) {
      if (typeof evaluation[key] !== 'number' || evaluation[key] < 0 || evaluation[key] > 25) {
        throw new Error(`Invalid ${key} score: ${evaluation[key]}`);
      }
    }

    // Recalculate total to ensure accuracy
    evaluation.total = evaluation.formatting + evaluation.completeness + 
                       evaluation.structure + evaluation.readability;

    return evaluation;
  }

  /**
   * Compare multiple conversions and rank them
   */
  async rankConversions(
    originalPdfText: string,
    conversions: { workerId: string; markdown: string }[]
  ): Promise<{ workerId: string; score: EvaluationScore }[]> {
    const results = await Promise.all(
      conversions.map(async (conv) => ({
        workerId: conv.workerId,
        score: await this.evaluateConversion(originalPdfText, conv.markdown),
      }))
    );

    // Sort by total score descending
    return results.sort((a, b) => b.score.total - a.score.total);
  }

  /**
   * Simple text completion for general use
   */
  async complete(prompt: string, maxTokens: number = 1000): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY');
    }

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }
}

/**
 * Create a configured LLM client
 */
export function createLLMClient(config?: LLMConfig): LLMClient {
  return new LLMClient(config);
}

/**
 * Normalize a score from any range to 0-100
 */
export function normalizeScore(score: number, maxScore: number): number {
  return Math.round((score / maxScore) * 100);
}

/**
 * Convert evaluation score to on-chain format (uint256, 0-100)
 */
export function toOnChainScore(evaluation: EvaluationScore): number {
  return Math.round(evaluation.total);
}

// Default export for convenience
export default LLMClient;
