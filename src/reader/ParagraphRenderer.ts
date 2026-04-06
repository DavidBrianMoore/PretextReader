import type { Annotation } from '../db/LibraryStore';
import type { ContentBlock, TextRun } from '../epub/types';

export function renderParagraph(
  block: ContentBlock,
  el: HTMLElement,
  annotations: Annotation[],
  fontSize: number,
  fontFamily: string
): number {
  el.innerHTML = '';
  el.classList.add('vscroll-block', `block-${block.type}`);
  el.setAttribute('data-block-id', block.id);
  el.style.fontSize = `${fontSize}px`;
  el.style.fontFamily = fontFamily;

  const container = document.createElement('div');
  container.className = 'paragraph-inner';
  el.appendChild(container);

  if (block.type === 'image' && block.src) {
    const img = document.createElement('img');
    img.src = block.src;
    img.alt = block.alt || '';
    img.loading = 'lazy';
    container.appendChild(img);
    return 300; 
  }

  // Map annotations to the runs
  renderRuns(block.runs || [], container, annotations);

  return el.offsetHeight || 100;
}

function renderRuns(runs: TextRun[], container: HTMLElement, annotations: Annotation[]) {
  let blockOffset = 0;
  for (const run of runs) {
    if (!run.text) continue;
    const runText = run.text;
    const runEnd = blockOffset + runText.length;

    // Filter annotations that intersect with this run
    const active = annotations.filter(a => {
       const start = a.startOffset ?? 0;
       const end = a.endOffset ?? 0;
       return (start >= blockOffset && start < runEnd) ||
              (end > blockOffset && end <= runEnd) ||
              (start <= blockOffset && end >= runEnd);
    });

    if (active.length === 0) {
      container.appendChild(createRunNode(run));
    } else {
      // Sort annotations by start offset
      active.sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
      
      let lastPos = blockOffset;
      for (const anno of active) {
        const aStart = anno.startOffset ?? 0;
        const aEnd = anno.endOffset ?? 0;

        // Text before annotation
        if (aStart > lastPos) {
           const beforeText = runText.substring(lastPos - blockOffset, aStart - blockOffset);
           container.appendChild(createRunNode({ ...run, text: beforeText }));
        }

        // The annotation itself
        const intersectStart = Math.max(blockOffset, aStart);
        const intersectEnd = Math.min(runEnd, aEnd);
        const mark = document.createElement('mark');
        mark.className = `anno-${anno.type}`;
        if (anno.color) mark.style.backgroundColor = anno.color;
        mark.dataset.annoId = anno.id;
        mark.dataset.start = String(aStart);
        mark.dataset.end = String(aEnd);
        
        if (anno.note) {
            mark.setAttribute('title', anno.note);
            mark.setAttribute('data-note', anno.note);
            mark.classList.add('anno-note');
        }
        
        const annoText = runText.substring(intersectStart - blockOffset, intersectEnd - blockOffset);
        mark.appendChild(createRunNode({ ...run, text: annoText }));
        container.appendChild(mark);
        
        lastPos = intersectEnd;
      }

      // Text after last annotation
      if (lastPos < runEnd) {
         const afterText = runText.substring(lastPos - blockOffset);
         container.appendChild(createRunNode({ ...run, text: afterText }));
      }
    }

    blockOffset = runEnd;
  }
}

function createRunNode(run: TextRun): HTMLElement | Text {
  let el: HTMLElement | Text;
  
  if (run.italic || run.bold || run.href) {
    const span = document.createElement(run.href ? 'a' : 'span');
    if (run.href) (span as HTMLAnchorElement).href = run.href;
    if (run.italic) span.style.fontStyle = 'italic';
    if (run.bold) span.style.fontWeight = 'bold';
    span.textContent = run.text;
    el = span;
  } else {
    el = document.createTextNode(run.text);
  }

  return el;
}
