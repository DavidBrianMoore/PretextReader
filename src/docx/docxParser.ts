import mammoth from 'mammoth/mammoth.browser';
import type { Book, Chapter, BookMetadata, TocEntry } from '../epub/types';
import { extractBlocks } from '../epub/extractor';

export async function parseDocx(file: File): Promise<Book> {
  const arrayBuffer = await file.arrayBuffer();
  const imageCache = new Map<string, string>();

  // Convert DOCX to HTML with image handling
  const options = {
    convertImage: mammoth.images.imgElement((image: any) => {
      return image.read("base64").then((imageBuffer: any) => {
        const src = `data:${image.contentType};base64,${imageBuffer}`;
        // Treat as a blob URL by creating one if it's large?
        // Actually, mammoth returns the base64 string, which works directly in extractBlocks.
        return { src };
      });
    })
  };

  const result = await mammoth.convertToHtml({ arrayBuffer }, options);
  const html = result.value; // The generated HTML
  
  // Use DOMParser to parse the HTML and extract blocks
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Reuse the EPUB block extraction logic
  const blocks = extractBlocks(doc, imageCache, 'docx-root');

  const metadata: BookMetadata = {
    title: file.name.replace(/\.docx$/i, ''),
    author: 'Unknown Author'
  };

  const chapter: Chapter = {
    id: 'docx-root',
    href: '#docx-root',
    label: 'Word Document',
    blocks
  };

  const toc: TocEntry = {
    id: 'toc-0',
    label: 'Word Document',
    href: '#docx-root',
    chapterIndex: 0,
    depth: 0,
    children: []
  };

  return {
    metadata,
    chapters: [chapter],
    toc: [toc]
  };
}
