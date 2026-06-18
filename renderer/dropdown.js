// Custom-Dropdowns für alle <select> – natives Select bleibt für .value / change.
(function () {
  let openInstance = null;

  function closeOpen() {
    if (openInstance) {
      openInstance.close();
      openInstance = null;
    }
  }

  function enhanceSelect(select) {
    if (!select || select.dataset.cselectDone) return;
    select.dataset.cselectDone = '1';
    select.classList.add('cselect-native');

    const wrap = document.createElement('div');
    wrap.className = 'cselect';
    if (select.classList.contains('cselect-sm')) wrap.classList.add('cselect-sm');
    if (select.classList.contains('cselect-block')) wrap.classList.add('cselect-block');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cselect-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');

    const labelEl = document.createElement('span');
    labelEl.className = 'cselect-label';

    const chevron = document.createElement('span');
    chevron.className = 'cselect-chevron';
    chevron.textContent = '▾';

    trigger.append(labelEl, chevron);

    const menu = document.createElement('div');
    menu.className = 'cselect-menu';
    menu.setAttribute('role', 'listbox');

    select.parentNode.insertBefore(wrap, select);
    wrap.append(select, trigger, menu);

    const api = {
      select,
      wrap,
      trigger,
      menu,
      open() {
        closeOpen();
        openInstance = api;
        wrap.classList.add('open');
        const tr = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - tr.bottom;
        const spaceAbove = tr.top;
        const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
        menu.classList.toggle('drop-up', openUp);
        menu.style.position = 'fixed';
        menu.style.left = `${tr.left}px`;
        menu.style.width = `${tr.width}px`;
        menu.style.right = 'auto';
        if (openUp) {
          menu.style.top = 'auto';
          menu.style.bottom = `${window.innerHeight - tr.top + 4}px`;
        } else {
          menu.style.top = `${tr.bottom + 4}px`;
          menu.style.bottom = 'auto';
        }
      },
      close() {
        wrap.classList.remove('open');
        menu.style.position = '';
        menu.style.left = '';
        menu.style.top = '';
        menu.style.bottom = '';
        menu.style.width = '';
        if (openInstance === api) openInstance = null;
      },
      syncFromNative() {
        const val = select.value;
        let label = '';
        menu.innerHTML = '';
        for (const opt of select.options) {
          if (opt.disabled) continue;
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'cselect-option';
          item.dataset.value = opt.value;
          item.textContent = opt.textContent;
          if (opt.value === val) {
            item.classList.add('selected');
            label = opt.textContent;
          }
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (select.value !== opt.value) {
              select.value = opt.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            api.syncFromNative();
            api.close();
          });
          menu.appendChild(item);
        }
        labelEl.textContent = label;
        trigger.setAttribute('aria-label', label);
      },
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (wrap.classList.contains('open')) api.close();
      else api.open();
    });

    select._cselect = api;
    api.syncFromNative();
    select.addEventListener('change', () => api.syncFromNative());
  }

  function initCustomSelects(root) {
    (root || document).querySelectorAll('select:not([data-cselect-done])').forEach(enhanceSelect);
  }

  function syncAllCustomSelects() {
    document.querySelectorAll('select[data-cselect-done]').forEach((s) => s._cselect?.syncFromNative());
  }

  document.addEventListener('click', closeOpen);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOpen();
  });

  window.initCustomSelects = initCustomSelects;
  window.syncCustomSelects = syncAllCustomSelects;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initCustomSelects());
  } else {
    initCustomSelects();
  }
})();
