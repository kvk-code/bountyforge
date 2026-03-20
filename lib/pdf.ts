/**
 * PDF Parsing Library for BountyForge
 * 
 * Extracts text content from PDF files for LLM processing.
 */

import * as fs from 'fs';
// @ts-ignore - pdf-parse types may not be available
import pdfParse from 'pdf-parse';

export interface PDFContent {
  text: string;
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    creationDate?: string;
  };
}

export interface ParseOptions {
  maxPages?: number;
  pageRange?: { start: number; end: number };
}

/**
 * Parse PDF from file path
 */
export async function parsePDFFile(
  filePath: string,
  options: ParseOptions = {}
): Promise<PDFContent> {
  const buffer = fs.readFileSync(filePath);
  return parsePDFBuffer(buffer, options);
}

/**
 * Parse PDF from buffer
 */
export async function parsePDFBuffer(
  buffer: Buffer,
  options: ParseOptions = {}
): Promise<PDFContent> {
  const pdfOptions: any = {};
  
  if (options.maxPages) {
    pdfOptions.max = options.maxPages;
  }
  
  if (options.pageRange) {
    pdfOptions.pagerender = (pageData: any) => {
      const pageNum = pageData.pageIndex + 1;
      if (pageNum >= options.pageRange!.start && pageNum <= options.pageRange!.end) {
        return pageData.getTextContent();
      }
      return null;
    };
  }

  const data = await pdfParse(buffer, pdfOptions);

  return {
    text: cleanPDFText(data.text),
    pageCount: data.numpages,
    metadata: {
      title: data.info?.Title,
      author: data.info?.Author,
      subject: data.info?.Subject,
      creator: data.info?.Creator,
      creationDate: data.info?.CreationDate,
    },
  };
}

/**
 * Clean extracted PDF text
 * Removes common artifacts and normalizes whitespace
 */
function cleanPDFText(text: string): string {
  return text
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove excessive whitespace
    .replace(/[ \t]+/g, ' ')
    // Remove page numbers (common patterns)
    .replace(/^\s*\d+\s*$/gm, '')
    .replace(/^\s*Page \d+ of \d+\s*$/gim, '')
    .replace(/^\s*- \d+ -\s*$/gm, '')
    // Remove excessive blank lines
    .replace(/\n{4,}/g, '\n\n\n')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Final trim
    .trim();
}

/**
 * Extract text from specific page range
 */
export async function extractPages(
  buffer: Buffer,
  startPage: number,
  endPage: number
): Promise<string> {
  const content = await parsePDFBuffer(buffer, {
    pageRange: { start: startPage, end: endPage }
  });
  return content.text;
}

/**
 * Get PDF page count without full parsing
 */
export async function getPageCount(buffer: Buffer): Promise<number> {
  const data = await pdfParse(buffer, { max: 1 });
  return data.numpages;
}

/**
 * Check if buffer is a valid PDF
 */
export function isValidPDF(buffer: Buffer): boolean {
  // PDF files start with %PDF-
  const header = buffer.slice(0, 5).toString('ascii');
  return header === '%PDF-';
}

/**
 * Chunk PDF text into manageable pieces for LLM processing
 */
export function chunkText(
  text: string,
  maxChunkSize: number = 8000,
  overlap: number = 500
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;
    
    // Try to break at a paragraph or sentence boundary
    if (end < text.length) {
      const breakPoints = [
        text.lastIndexOf('\n\n', end),
        text.lastIndexOf('\n', end),
        text.lastIndexOf('. ', end),
      ];
      
      for (const bp of breakPoints) {
        if (bp > start + maxChunkSize / 2) {
          end = bp + 1;
          break;
        }
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks;
}

// Export default
export default {
  parsePDFFile,
  parsePDFBuffer,
  extractPages,
  getPageCount,
  isValidPDF,
  chunkText,
};
