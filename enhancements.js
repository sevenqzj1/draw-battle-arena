/* Draw Battle Arena — recursos de desenho adicionais */
(() => {
  'use strict';
  const palette = [
    '#000000','#252525','#525252','#7f7f7f','#a6a6a6','#c9c9c9','#e6e6e6','#ffffff',
    '#7a0019','#a80000','#d71920','#ff3b30','#ff6b6b','#ff9f9f','#ffb6c1','#ffd1dc',
    '#7f2a00','#b34700','#e66a00','#ff8c00','#ffad33','#ffc266','#ffda99','#fff0d6',
    '#6b5200','#998000','#c9a800','#f2d600','#ffe84a','#fff27a','#fff7b8','#fffbdc',
    '#164d1b','#237a2e','#2eaa49','#42d66b','#7be495','#a8efb5','#d0f5d7','#eaffed',
    '#004d40','#00796b','#00a88f','#00c7a5','#48dfc1','#83efdc','#b9f6ed','#e0fffa',
    '#003f73','#005ca8','#087fe3','#19a9ff','#5bc8ff','#8edcff','#bcecff','#e2f7ff',
    '#171f80','#303fc2','#4f63f0','#7d8cff','#a9b2ff','#c9ceff','#e2e5ff','#f2f3ff',
    '#4b176e','#7026a5','#9138d1','#b45cf0','#cc8cff','#e1b8ff','#f0ddff','#fbf3ff',
    '#7d2456','#a83275','#d44798','#ef6eb6','#f49acb','#f8c2df','#ffe0ef','#fff2f8',
    '#593b2a','#80583d','#a87550','#c9936a','#e0b18c','#efd0b5','#f7e3d4','#fff7ef'
  ];
  const uniquePalette = [...new Set(palette)].filter((_, i) => i % 4 !== 3).slice(0, 66);
  const colors = document.getElementById('colors');
  if (!colors) return;

  const search = document.createElement('input');
  search.type = 'search';
  search.id = 'paletteSearch';
  search.placeholder = 'Filtrar cor por código (#RRGGBB)…';
  search.setAttribute('aria-label', 'Filtrar paleta de cores');
  search.autocomplete = 'off';
  search.style.cssText = 'max-width:360px;margin:0 0 10px;padding:9px 11px;font-size:13px';
  colors.parentElement.insertBefore(search, colors);

  function renderPalette(query = '') {
    const q = query.trim().toLowerCase();
    const filtered = uniquePalette.filter(c => !q || c.includes(q));
    colors.innerHTML = filtered.map(c =>
      '<button type="button" class="swatch" data-color="' + c +
      '" style="background:' + c + '" aria-label="Selecionar cor ' + c +
      '" title="' + c + '"></button>'
    ).join('');
    const selected = colors.querySelector('[data-color="' + (document.getElementById('customColor')?.value || '#000000') + '"]');
    if (selected) selected.classList.add('active');
    colors.setAttribute('aria-label', 'Paleta expandida com ' + filtered.length + ' cores');
  }
  renderPalette();
  search.addEventListener('input', () => renderPalette(search.value));

  const style = document.createElement('style');
  style.textContent = `
    #paletteSearch { display:block; width:100%; background:#090d1f; color:var(--text); border:1px solid var(--line); border-radius:10px; }
    #colors { grid-template-columns:repeat(auto-fit,minmax(24px,1fr)); gap:7px; }
    #colors .swatch { width:100%; min-width:0; max-width:38px; height:30px; border-radius:8px; }
    #colors .swatch.active { outline:2px solid var(--cyan); outline-offset:2px; }
    .paint-toolbar .tool-label { user-select:none; }
    @media(max-width:650px) { #colors { grid-template-columns:repeat(8,minmax(20px,1fr)); } }
  `;
  document.head.appendChild(style);

  // A delegação de clique já existente em app.js continua tratando data-color.
  colors.addEventListener('click', e => {
    const swatch = e.target.closest('[data-color]');
    if (!swatch) return;
    colors.querySelectorAll('.swatch').forEach(el => el.classList.toggle('active', el === swatch));
  });

  // Atalhos rápidos para ferramentas e histórico, sem interferir em campos de texto.
  document.addEventListener('keydown', e => {
    const target = e.target;
    const typing = target && (
      target.matches('input, textarea, select') ||
      target.isContentEditable
    );
    if (typing) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      document.getElementById(e.shiftKey ? 'redo' : 'undo')?.click();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      document.getElementById('redo')?.click();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const tools = { b:'brush', p:'pencil', e:'eraser', f:'bucket', l:'line', r:'rect', o:'ellipse' };
    const selectedTool = tools[e.key.toLowerCase()];
    if (selectedTool) {
      document.querySelector('[data-tool="' + selectedTool + '"]')?.click();
    } else if (e.key === '[' || e.key === ']') {
      const range = document.getElementById('brushSize');
      if (!range) return;
      range.value = String(Math.max(Number(range.min), Math.min(Number(range.max), Number(range.value) + (e.key === ']' ? 1 : -1))));
      range.dispatchEvent(new Event('input', { bubbles:true }));
    }
  });
})();