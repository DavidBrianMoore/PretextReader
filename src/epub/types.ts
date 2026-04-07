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

export interface BookMetadata {
  title: string;
  author: string;
  publisher?: string;
  language?: string;
  coverSrc?: string; // blob URL or data URL
}

export interface Book {
  metadata: BookMetadata;
  chapters: Chapter[];
  toc: TocEntry[];
  sourceFile?: File;
}
