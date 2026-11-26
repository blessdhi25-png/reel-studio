// When a horizontal drag must NOT be treated as a page swipe: it started in something that handles
// horizontal input itself (form fields, sliders, [data-no-swipe] regions such as the comments panel,
// canvases, any horizontally scrollable strip) or a modal/drawer is open.
function startsInHorizontalScroller(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 4) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

export function shouldIgnoreSwipe(target) {
  if (typeof document === 'undefined' || !(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [data-no-swipe], canvas')) return true;
  if (document.querySelector('[aria-modal="true"]')) return true;
  return startsInHorizontalScroller(target);
}
