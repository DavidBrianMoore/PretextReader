import JSZip from 'jszip';
import type { Book, Chapter, BookMetadata, TocEntry } from './types';
import { extractBlocks } from './extractor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseXml(str: string): Document {
  return new DOMParser().parseFromString(str, 'application/xml');
}

function parseHtml(str: string): Document {
  return new DOMParser().parseFromString(str, 'text/html');
}

/** Resolve a path relative to a base path (both are zip-relative). */
function resolvePath(base: string, relative: string): string {
  if (relative.startsWith('/')) return relative.slice(1);
  const parts = base.split('/');
  parts.pop(); // remove filename
  for (const seg of relative.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** Strip fragment from href */
function stripFragment(href: string): string {
  return href.split('#')[0];
}

// ─── Container / OPF ──────────────────────────────────────────────────────────

async function getRootfilePath(zip: JSZip): Promise<string> {
  const container = await zip.file('META-INF/container.xml')?.async('string');
  if (!container) throw new Error('No META-INF/container.xml found');
  const doc = parseXml(container);
  const rootfile = doc.querySelector('rootfile');
  if (!rootfile) throw new Error('No rootfile element in container.xml');
  return rootfile.getAttribute('full-path') ?? '';
}

interface OpfData {
  opfDir: string;
  metadata: BookMetadata;
  spineIds: string[];
  manifest: Map<string, { href: string; mediaType: string }>;
  tocId?: string;
}

async function parseOpf(zip: JSZip, opfPath: string): Promise<OpfData> {
  const opfText = await zip.file(opfPath)?.async('string');
  if (!opfText) throw new Error(`Cannot read OPF at ${opfPath}`);
  const doc = parseXml(opfText);
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // Metadata
  const ns = 'http://purl.org/dc/elements/1.1/';
  const title = doc.getElementsByTagNameNS(ns, 'title')[0]?.textContent?.trim() ?? 'Unknown Title';
  const author = doc.getElementsByTagNameNS(ns, 'creator')[0]?.textContent?.trim() ?? 'Unknown Author';
  const publisher = doc.getElementsByTagNameNS(ns, 'publisher')[0]?.textContent?.trim();
  const language = doc.getElementsByTagNameNS(ns, 'language')[0]?.textContent?.trim();

  // Manifest
  const manifest = new Map<string, { href: string; mediaType: string }>();
  doc.querySelectorAll('manifest item').forEach(item => {
    const id = item.getAttribute('id') ?? '';
    const href = item.getAttribute('href') ?? '';
    const mediaType = item.getAttribute('media-type') ?? '';
    if (id) manifest.set(id, { href, mediaType });
  });

  // Cover image
  let coverSrc: string | undefined;
  const coverMeta = doc.querySelector('meta[name="cover"]');
  if (coverMeta) {
    const coverId = coverMeta.getAttribute('content') ?? '';
    const coverItem = manifest.get(coverId);
    if (coverItem) {
      const fullPath = opfDir + coverItem.href;
      const blob = await zip.file(fullPath)?.async('blob');
      if (blob) coverSrc = URL.createObjectURL(blob);
    }
  }

  // Spine
  const spineIds: string[] = [];
  doc.querySelectorAll('spine itemref').forEach(ref => {
    const idref = ref.getAttribute('idref');
    if (idref) spineIds.push(idref);
  });

  // NCX or nav TOC reference
  const tocId = doc.querySelector('spine')?.getAttribute('toc') ?? undefined;

  return {
    opfDir,
    metadata: { title, author, publisher, language, coverSrc },
    spineIds,
    manifest,
    tocId,
  };
}

// ─── TOC Parsing ──────────────────────────────────────────────────────────────

async function parseNcxToc(
  zip: JSZip,
  ncxPath: string,
  spineHrefs: string[],
): Promise<TocEntry[]> {
  const ncxText = await zip.file(ncxPath)?.async('string');
  if (!ncxText) return [];
  const doc = parseXml(ncxText);

  let entryId = 0;
  function parseNavPoint(el: Element, depth: number): TocEntry {
    const label = el.querySelector('navLabel text')?.textContent?.trim() ?? '';
    const href = el.querySelector('content')?.getAttribute('src') ?? '';
    const bareHref = stripFragment(href);
    const chapterIndex = spineHrefs.findIndex(h => h === bareHref || h.endsWith('/' + bareHref));

    const children = Array.from(el.querySelectorAll(':scope > navPoint')).map(child =>
      parseNavPoint(child, depth + 1),
    );

    return { id: `toc-${entryId++}`, label, href, chapterIndex: Math.max(0, chapterIndex), depth, children };
  }

  return Array.from(doc.querySelectorAll('navMap > navPoint')).map(el => parseNavPoint(el, 0));
}

async function parseNavToc(
  zip: JSZip,
  navPath: string,
  spineHrefs: string[],
): Promise<TocEntry[]> {
  const navText = await zip.file(navPath)?.async('string');
  if (!navText) return [];
  const doc = parseHtml(navText);
  const navEl = doc.querySelector('nav[epub\\:type="toc"], nav');
  if (!navEl) return [];

  let entryId = 0;
  function parseOl(ol: Element, depth: number): TocEntry[] {
    return Array.from(ol.querySelectorAll(':scope > li')).map(li => {
      const a = li.querySelector('a');
      const label = a?.textContent?.trim() ?? '';
      const href = a?.getAttribute('href') ?? '';
      const bareHref = stripFragment(href);
      const chapterIndex = spineHrefs.findIndex(h => h === bareHref || h.endsWith('/' + bareHref));
      const childOl = li.querySelector('ol');
      const children = childOl ? parseOl(childOl, depth + 1) : [];
      return { id: `toc-${entryId++}`, label, href, chapterIndex: Math.max(0, chapterIndex), depth, children };
    });
  }

  const ol = navEl.querySelector('ol');
  return ol ? parseOl(ol, 0) : [];
}

// ─── Chapter Loading ───────────────────────────────────────────────────────────

async function loadChapter(
  zip: JSZip,
  opfDir: string,
  id: string,
  href: string,
  label: string,
): Promise<Chapter> {
  const fullPath = opfDir + href;
  const htmlText = await zip.file(fullPath)?.async('string');
  if (!htmlText) {
    return { id, href, label, blocks: [] };
  }

  // Load images as blob URLs
  const imageCache = new Map<string, string>();
  const htmlDoc = parseHtml(htmlText);
  const imgEls = htmlDoc.querySelectorAll('img, image');
  await Promise.all(
    Array.from(imgEls).map(async img => {
      const src = img.getAttribute('src') || img.getAttribute('xlink:href') || '';
      if (!src || imageCache.has(src)) return;
      const imgPath = resolvePath(fullPath, src);
      const blob = await zip.file(imgPath)?.async('blob');
      if (blob) {
        imageCache.set(src, URL.createObjectURL(blob));
      }
    }),
  );

  const blocks = extractBlocks(htmlDoc, imageCache, id);
  return { id, href, label, blocks };
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export async function parseEpub(file: File): Promise<Book> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const opfPath = await getRootfilePath(zip);
  const { opfDir, metadata, spineIds, manifest, tocId } = await parseOpf(zip, opfPath);

  // Build ordered spine hrefs
  const spineItems: Array<{ id: string; href: string }> = spineIds
    .map(id => {
      const item = manifest.get(id);
      return item ? { id, href: item.href } : null;
    })
    .filter(Boolean) as Array<{ id: string; href: string }>;

  const spineHrefs = spineItems.map(i => i.href);

  // Build TOC
  let toc: TocEntry[] = [];

  // Try EPUB3 nav doc first
  for (const [, item] of manifest) {
    if (item.mediaType === 'application/xhtml+xml' && item.href.includes('nav')) {
      const navPath = opfDir + item.href;
      if (zip.file(navPath)) {
        toc = await parseNavToc(zip, navPath, spineHrefs);
        break;
      }
    }
  }

  // Fall back to NCX
  if (toc.length === 0 && tocId) {
    const ncxItem = manifest.get(tocId);
    if (ncxItem) {
      const ncxPath = opfDir + ncxItem.href;
      toc = await parseNcxToc(zip, ncxPath, spineHrefs);
    }
  }

  // Fall back to searching for .ncx
  if (toc.length === 0) {
    for (const [, item] of manifest) {
      if (item.mediaType === 'application/x-dtbncx+xml') {
        const ncxPath = opfDir + item.href;
        toc = await parseNcxToc(zip, ncxPath, spineHrefs);
        break;
      }
    }
  }

  // Load chapters (limit parallelism to avoid memory spikes)
  const chapters: Chapter[] = [];
  for (let i = 0; i < spineItems.length; i++) {
    const item = spineItems[i];
    // Find TOC label for this chapter
    const tocMatch = toc.find(t => t.chapterIndex === i);
    const label = tocMatch?.label ?? `Chapter ${i + 1}`;
    const chapter = await loadChapter(zip, opfDir, item.id, item.href, label);
    chapters.push(chapter);
  }

  return { metadata, chapters, toc, sourceFile: file };
}
