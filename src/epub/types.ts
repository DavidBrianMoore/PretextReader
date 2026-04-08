// EPUB data types

export type ContentBlockType = 'paragraph' | 'heading' | 'image' | 'blockquote' | 'hr' | 'code' | 'anchor';

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  level?: 1 | 2 | 3 | 4 | 5 | 6; // for heading
  runs?: TextRun[];                 // for paragraph, heading, blockquote
  src?: string;                     // for image (blob URL)
  alt?: string;                     // for image
  estimatedHeight?: number;         // cached by VirtualScroller
}

export interface TocEntry {
  id: string;
  label: string;
  href: string;       // chapter href (may include fragment)
  chapterIndex: number;
  depth: number;
  children: TocEntry[];
}

export interface Chapter {
  id: string;
  href: string;
  label: string;
  blocks: ContentBlock[];
}

export interface CSLName {
  family: string;
  given?: string;
  suffix?: string;
}

export interface CSLDate {
  'date-parts'?: [][];
  raw?: string;
  literal?: string;
}

export interface BookMetadata {
  // Core UI fields (often mapped from CSL)
  title: string;
  author: string; // Display string, e.g. "George Orwell"
  
  // Zotero/CSL-Compatible fields
  id?: string;
  type?: 'book' | 'article-journal' | 'webpage' | 'chapter';
  'container-title'?: string;
  publisher?: string;
  'publisher-place'?: string;
  language?: string;
  issued?: CSLDate;
  DOI?: string;
  ISSN?: string;
  ISBN?: string;
  URL?: string;
  abstract?: string;
  page?: string;
  volume?: string;
  issue?: string;
  authors?: CSLName[]; // Rich author data
  
  // UI legacy
  date?: string; // Original raw date
  isbn?: string; // Original raw isbn
  coverSrc?: string; // blob URL or data URL
}


export interface Annotation {
  id: string;
  blockId: string;
  type: 'highlight' | 'note' | 'citation';
  color?: string; // e.g. #ffeb3b
  text: string;  // selected text
  note?: string; // for type: 'note'
  citation?: string; // formatted footnote/citation (Legacy)
  bibliography?: string; // formatted bibliography entry (Legacy)
  
  // Zotero compatibility
  zoteroKey?: string;
  pageIndex?: number; // For PDF annotations
  rects?: [number, number, number, number][]; // [[x1, y1, x2, y2], ...]
  
  startOffset?: number; // relative to block's plain text (for EPUB/Docx)
  endOffset?: number;
  createdAt: number;
}

export interface SavedBook {
  id: string;
  metadata: BookMetadata;
  coverBlob?: Blob;
  chapters: Chapter[];
  toc: TocEntry[];
  annotations?: Annotation[];
  lastReadBlockId?: string;
  lastReadTop?: number;
  lastReadAt?: number;
  
  // Zotero library keys
  zoteroKey?: string;
  attachmentKey?: string;
  
  // Original file info
  sourceBlob?: Blob;
  sourceType?: string;
  sourceName?: string;
}

export interface Book {
  metadata: BookMetadata;
  chapters: Chapter[];
  toc: TocEntry[];
  sourceFile?: File;
}

