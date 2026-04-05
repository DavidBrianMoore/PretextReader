import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { Book, Chapter, BookMetadata, TocEntry, ContentBlock } from '../epub/types';

// Configure PDF.js worker
// Using Vite's ?url suffix to bundle the worker worker locally for maximum stability
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function parsePdf(file: File): Promise<Book> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  // 1. Metadata
  const metadata = await pdf.getMetadata();
  const info = (metadata.info as any) || {};
  
  const bookMetadata: BookMetadata = {
    title: info.Title || file.name.replace(/\.pdf$/i, ''),
    author: info.Author || 'Unknown Author',
    publisher: info.Producer,
  };

  // 2. Chapters (Pages)
  const chapters: Chapter[] = [];
  const toc: TocEntry[] = [];
  let lastPagePendingText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;
    const textContent = await page.getTextContent();
    
    // Sort items by Y descending, then X ascending
    const items = textContent.items as any[];
    items.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 5) return yDiff; 
      return a.transform[4] - b.transform[4];
    });

    const blocks: ContentBlock[] = [];
    const rawLines: Array<{ y: number, startX: number, text: string }> = [];
    
    // 1. Group items into lines
    let currentLine: { y: number, startX: number, text: string } | null = null;
    for (const item of items) {
      const text = item.str || '';
      if (!text.trim()) continue;

      const x = item.transform[4];
      const y = item.transform[5];

      if (!currentLine || Math.abs(y - currentLine.y) > 5) {
        currentLine = { y, startX: x, text: text.trim() };
        rawLines.push(currentLine);
      } else {
        currentLine.text += ' ' + text.trim();
      }
    }

    // 2. Filter marginalia (headers, footers, page numbers)
    const lines = rawLines.filter(line => {
      const isTopRegion = line.y > pageHeight * 0.91;
      const isBottomRegion = line.y < pageHeight * 0.09;
      
      if (isTopRegion || isBottomRegion) {
        // Page numbers: "123", "Page 123", "- 123 -"
        if (line.text.length < 12 && /^\d+|Page \d+|^\- \d+ \-$/i.test(line.text.trim())) return false;
        // Generic short headers/footers
        if (line.text.length < 20) return false;
      }
      return true;
    });

    if (lines.length === 0) {
      if (i === pdf.numPages && lastPagePendingText) {
          blocks.push({ id: `p${i}-f`, type: 'paragraph', runs: [{ text: lastPagePendingText.trim() }] });
          lastPagePendingText = '';
      }
      const chapterId = `page-${i}`;
      chapters.push({ id: chapterId, href: `#${chapterId}`, label: `Page ${i}`, blocks: [...blocks] });
      toc.push({ id: `toc-${i}`, label: `Page ${i}`, href: `#${chapterId}`, chapterIndex: i - 1, depth: 0, children: [] });
      continue;
    }

    // 3. Identify the most common X-start (left margin)
    const lineStartXs = lines.map(l => l.startX);
    const sortedX = [...lineStartXs].sort((a, b) => a - b);
    const minX = sortedX[Math.floor(sortedX.length * 0.1)] || 0;

    // 4. Calculate average line gap to distinguish paragraph breaks
    let totalGap = 0;
    let gapCount = 0;
    for (let k = 1; k < lines.length; k++) {
      const gap = Math.abs(lines[k].y - lines[k-1].y);
      if (gap > 5 && gap < 30) {
        totalGap += gap;
        gapCount++;
      }
    }
    const avgGap = gapCount > 0 ? totalGap / gapCount : 12;

    // 5. Combine lines into paragraphs
    // Join with previous page text if it didn't end in punctuation
    let currentParagraphText = lastPagePendingText;
    lastPagePendingText = '';
    let lastProcessedLine: typeof lines[0] | null = null;

    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      
      if (!currentParagraphText && !lastProcessedLine) {
        currentParagraphText = line.text;
      } else if (!lastProcessedLine) {
          // We have text from the previous page
          // If first line isn't indented, merge it
          const isIndented = line.startX > minX + 15;
          if (!isIndented) {
              currentParagraphText += ' ' + line.text;
          } else {
              blocks.push({ id: `p${i}-init`, type: 'paragraph', runs: [{ text: currentParagraphText.trim() }] });
              currentParagraphText = line.text;
          }
      } else {
        const yGap = Math.abs(line.y - lastProcessedLine.y);
        const isIndented = line.startX > minX + 15;
        const endsWithPunct = /[.!?]$/.test(lastProcessedLine.text.trim());
        const lastLineEndsInHyphen = lastProcessedLine.text.trim().endsWith('-');

        let isNewPara = false;
        if (yGap > avgGap * 1.45) {
          isNewPara = true;
        } else if (isIndented && endsWithPunct && yGap > avgGap * 0.8) {
          isNewPara = true;
        }

        if (lastLineEndsInHyphen) {
          currentParagraphText = currentParagraphText.trim().slice(0, -1) + line.text;
        } else if (isNewPara) {
          blocks.push({
            id: `p${i}-${blocks.length}`,
            type: 'paragraph',
            runs: [{ text: currentParagraphText.trim() }]
          });
          currentParagraphText = line.text;
        } else {
          currentParagraphText += ' ' + line.text;
        }
      }
      lastProcessedLine = line;
    }

    // Final paragraph on page: decide if we flush it or carry over
    if (currentParagraphText) {
       const trimmed = currentParagraphText.trim();
       const endsWithPunct = /[.!?]$/.test(trimmed) || trimmed.endsWith('"') || trimmed.endsWith('”');
       
       if (!endsWithPunct && i < pdf.numPages) {
           lastPagePendingText = trimmed;
       } else {
           blocks.push({
             id: `p${i}-${blocks.length}`,
             type: 'paragraph',
             runs: [{ text: trimmed }]
           });
           lastPagePendingText = '';
       }
    }

    const chapterId = `page-${i}`;
    chapters.push({
      id: chapterId,
      href: `#${chapterId}`,
      label: `Page ${i}`,
      blocks
    });

    // Add to TOC
    toc.push({
      id: `toc-${i}`,
      label: `Page ${i}`,
      href: `#${chapterId}`,
      chapterIndex: i - 1,
      depth: 0,
      children: []
    });
  }

  return {
    metadata: bookMetadata,
    chapters,
    toc
  };
}
