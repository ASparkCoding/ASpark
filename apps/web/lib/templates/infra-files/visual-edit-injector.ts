/**
 * Visual Edit injection script template.
 * Injected into preview iframe when Visual Edit mode is active.
 * Captures element clicks and sends structured data to parent window.
 */
export const VISUAL_EDIT_SCRIPT = `
(function(){
  if(window.__asparkVisualEdit) return;
  window.__asparkVisualEdit = true;

  // Overlay highlight
  var overlay = document.createElement('div');
  overlay.id = 'aspark-ve-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #E04E2A;border-radius:4px;z-index:99999;transition:all 0.15s ease;display:none';
  document.body.appendChild(overlay);

  // Selected element highlight
  var selected = document.createElement('div');
  selected.id = 'aspark-ve-selected';
  selected.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #3b82f6;border-radius:4px;z-index:99998;display:none;background:rgba(59,130,246,0.05)';
  document.body.appendChild(selected);

  document.addEventListener('mousemove', function(e){
    var el = e.target;
    if(!el || el === document.body || el === document.documentElement || el.id?.startsWith('aspark-ve')) {
      overlay.style.display = 'none';
      return;
    }
    var r = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = r.left + 'px';
    overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
  }, true);

  document.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if(!el || el.id?.startsWith('aspark-ve')) return;

    // Build CSS selector path
    var path = [];
    var cur = el;
    while(cur && cur !== document.body){
      var s = cur.tagName.toLowerCase();
      if(cur.id) s += '#' + cur.id;
      else if(cur.className && typeof cur.className === 'string') s += '.' + cur.className.trim().split(/\\s+/)[0];
      path.unshift(s);
      cur = cur.parentElement;
    }

    // Read computed styles
    var cs = window.getComputedStyle(el);
    var styles = {
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      padding: cs.padding,
      margin: cs.margin,
      borderRadius: cs.borderRadius,
      textAlign: cs.textAlign,
      display: cs.display,
      width: cs.width,
      height: cs.height,
    };

    // Highlight selected
    var r = el.getBoundingClientRect();
    selected.style.display = 'block';
    selected.style.left = r.left + 'px';
    selected.style.top = r.top + 'px';
    selected.style.width = r.width + 'px';
    selected.style.height = r.height + 'px';

    window.parent.postMessage({
      type: 'visual-edit-select',
      data: {
        tagName: el.tagName,
        text: (el.textContent || '').slice(0, 100).trim(),
        className: typeof el.className === 'string' ? el.className : '',
        path: path.join(' > '),
        styles: styles,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      }
    }, '*');
  }, true);
})();
`;
