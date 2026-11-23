(() => {
  'use strict';

  const T = (k, l, extra) => ({ k, l, ...extra });
  const SCHEMA = [
    { key: 'site', title: 'Township info & hall', type: 'object', fields: [
      T('name', 'Township name'), T('tagline', 'Tagline (under the name)'), T('sealAlt', 'Seal description (alt text)'),
      T('heroTitle', 'Home page headline'), T('heroText', 'Home page intro', { type: 'textarea' }),
      T('heroImage', 'Hero photo', { type: 'image' }),
      T('heroAlt', 'Hero photo description', { hint: 'Describe the photo for screen-reader users. Leave blank only if the photo is purely decorative.' }),
      T('phoneLabel', 'Main phone label (e.g. Clerk\'s office)'), T('phone', 'Main phone', { type: 'tel' }), T('email', 'Main email', { type: 'email' }),
      T('mailing', 'Mailing address'),
      T('hallName', 'Hall name'), T('hallAddress', 'Hall address'), T('hallDirections', 'Hall directions'), T('mapUrl', 'Map / directions link', { type: 'url' }),
      T('hoursNote', 'Hall hours note', { type: 'textarea' }),
      T('parkName', 'Park name'), T('parkAddress', 'Park address'), T('parkNote', 'Park availability note'),
      T('rentalsEmail', 'Rentals email', { type: 'email' }), T('rentalsNote', 'Rental instructions', { type: 'textarea' })
    ] },
    { key: 'alerts', title: 'Alerts', type: 'list', itemLabel: 'title', blank: { title: '', body: '', level: 'info', active: true, expires: '', link: '', linkText: '' }, fields: [
      T('title', 'Title'), T('body', 'Details', { type: 'textarea' }),
      T('level', 'Level', { type: 'select', options: [['info', 'Notice'], ['warning', 'Important'], ['emergency', 'Emergency']] }),
      T('active', 'Show this alert', { type: 'checkbox' }),
      T('expires', 'Hide after this date', { type: 'date', hint: 'Optional. The alert disappears after this date.' }),
      T('link', 'Link', { type: 'url' }), T('linkText', 'Link text')
    ] },
    { key: 'announcements', title: 'Announcements', type: 'list', itemLabel: 'title', blank: { title: '', date: '', body: '', link: '', linkText: '' }, fields: [
      T('title', 'Title'), T('date', 'Date', { type: 'date' }), T('body', 'Text', { type: 'textarea' }),
      T('link', 'Link or uploaded file', { type: 'file' }), T('linkText', 'Link text')
    ] },
    { key: 'events', title: 'Calendar events', type: 'list', itemLabel: 'title', blank: { title: '', date: '', time: '', location: '', desc: '' }, fields: [
      T('title', 'Event name'), T('date', 'Date', { type: 'date' }), T('time', 'Time (e.g. 6:30 PM)'), T('location', 'Location'), T('desc', 'Description', { type: 'textarea' })
    ] },
    { key: 'meetings', title: 'Meeting schedule', type: 'list', itemLabel: 'name', blank: { name: '', schedule: '', location: '' }, fields: [
      T('name', 'Meeting'), T('schedule', 'When', { type: 'textarea' }), T('location', 'Where')
    ] },
    { key: 'officials', title: 'Officials & contacts', type: 'list', itemLabel: 'title', blank: { title: '', name: '', phone: '', email: '', address: '' }, fields: [
      T('title', 'Position'), T('name', 'Name'), T('phone', 'Phone'), T('email', 'Email', { type: 'email' }), T('address', 'Mailing address')
    ] },
    { key: 'tiles', title: 'Quick-link tiles', type: 'list', itemLabel: 'title', blank: { title: '', desc: '', href: '', icon: 'doc' }, fields: [
      T('title', 'Title'), T('desc', 'Short description'), T('href', 'Link (#/page, or full https:// address)'),
      T('icon', 'Icon', { type: 'select', options: [['permit', 'Permit'], ['tax', 'Tax'], ['trash', 'Rubbish'], ['vote', 'Voting'], ['rental', 'Rental'], ['leaf', 'Cemetery'], ['map', 'Map/Zoning'], ['doc', 'Document']] })
    ] },
    { key: 'accessibility', title: 'Accessibility statement', type: 'object', fields: [
      T('statement', 'Statement text', { type: 'textarea' }),
      T('contactName', 'Who to contact: name'), T('contactTitle', 'Who to contact: title'),
      T('contactPhone', 'Phone', { type: 'tel' }), T('contactEmail', 'Email', { type: 'email' }),
      T('lastReviewed', 'Last reviewed', { type: 'date' })
    ] },
    { key: 'footer', title: 'Footer credit', type: 'object', fields: [
      T('developerName', 'Developer name'), T('developerUrl', 'Developer link (optional)', { type: 'url' })
    ] }
  ];

  const $ = (s, r = document) => r.querySelector(s);
  let C = null;
  let current = SCHEMA[0].key;
  let uid = 0;
  let dirty = false;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) { if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid)); }
    return el;
  }

  let statusTimer;
  function say(msg, kind) {
    const s = $('#status');
    s.textContent = msg;
    s.className = 'status show ' + (kind || '');
    clearTimeout(statusTimer);
    if (kind !== 'error') statusTimer = setTimeout(() => { s.className = 'status'; }, 6000);
  }

  async function upload(file) {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Upload failed');
    return (await r.json()).url;
  }

  function fieldEl(def, obj) {
    const id = 'f' + (++uid);
    const type = def.type || 'text';
    const hint = def.hint ? h('p', { class: 'hint', id: id + '-h' }, def.hint) : null;
    const desc = def.hint ? { 'aria-describedby': id + '-h' } : {};
    const onInput = () => { dirty = true; };
    if (type === 'checkbox') {
      return h('div', { class: 'field check' }, h('label', { for: id },
        h('input', { id, type: 'checkbox', ...(obj[def.k] !== false && obj[def.k] ? { checked: true } : {}), onchange: (e) => { obj[def.k] = e.target.checked; dirty = true; } }), def.l));
    }
    let input;
    if (type === 'textarea') {
      input = h('textarea', { id, ...desc, oninput: (e) => { obj[def.k] = e.target.value; onInput(); } }); input.value = obj[def.k] || '';
    } else if (type === 'select') {
      input = h('select', { id, ...desc, onchange: (e) => { obj[def.k] = e.target.value; onInput(); } },
        def.options.map(([v, l]) => h('option', { value: v, ...(obj[def.k] === v ? { selected: true } : {}) }, l)));
    } else if (type === 'image' || type === 'file') {
      const wrap = h('div', { class: 'field' });
      const text = h('input', { id, type: 'text', ...desc, value: obj[def.k] || '', oninput: (e) => { obj[def.k] = e.target.value; onInput(); } });
      const fid = id + '-up';
      const up = h('input', { id: fid, type: 'file', accept: type === 'image' ? 'image/png,image/jpeg,image/webp' : '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp', onchange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          say('Uploading…');
          const url = await upload(f);
          obj[def.k] = url; text.value = url; dirty = true;
          if (type === 'image') { prev.src = url; prev.hidden = false; }
          say('Uploaded. Remember to save changes.', 'ok');
        } catch (err) { say(err.message, 'error'); }
      } });
      const prev = h('img', { class: 'preview-img', alt: 'Current photo preview', src: obj[def.k] || '', hidden: !(type === 'image' && obj[def.k]) });
      wrap.append(h('label', { for: id }, def.l), hint, text, h('label', { for: fid, class: 'hint' }, 'Or upload a new file'), up, type === 'image' ? prev : null);
      return wrap;
    } else {
      input = h('input', { id, type, ...desc, value: obj[def.k] || '', oninput: (e) => { obj[def.k] = e.target.value; onInput(); } });
    }
    return h('div', { class: 'field' }, h('label', { for: id }, def.l), hint, input);
  }

  function renderSection() {
    const sec = SCHEMA.find((s) => s.key === current);
    const ed = $('#editor');
    ed.replaceChildren(h('h1', { id: 'sec-title', tabindex: '-1' }, sec.title));
    if (sec.type === 'object') {
      C[sec.key] = C[sec.key] || {};
      sec.fields.forEach((f) => ed.append(fieldEl(f, C[sec.key])));
      return;
    }
    C[sec.key] = C[sec.key] || [];
    const arr = C[sec.key];
    const listBox = h('div');
    const redraw = (focusSel) => {
      listBox.replaceChildren();
      if (!arr.length) listBox.append(h('p', { class: 'muted' }, 'Nothing here yet.'));
      arr.forEach((item, i) => {
        const label = (item[sec.itemLabel] || 'Untitled') + '';
        const fs = h('fieldset', { class: 'item' }, h('legend', null, (i + 1) + '. ' + label));
        sec.fields.forEach((f) => fs.append(fieldEl(f, item)));
        const move = (d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; dirty = true; redraw('[data-i="' + j + '"] .' + (d < 0 ? 'up' : 'down')); };
        fs.setAttribute('data-i', i);
        fs.append(h('div', { class: 'item-tools' },
          h('button', { type: 'button', class: 'btn dark small up', 'aria-label': 'Move up: ' + label, disabled: i === 0, onclick: () => move(-1) }, 'Move up'),
          h('button', { type: 'button', class: 'btn dark small down', 'aria-label': 'Move down: ' + label, disabled: i === arr.length - 1, onclick: () => move(1) }, 'Move down'),
          h('button', { type: 'button', class: 'btn small danger', 'aria-label': 'Delete: ' + label, onclick: () => {
            if (!confirm('Delete "' + label + '"? This is not saved until you click Save changes.')) return;
            arr.splice(i, 1); dirty = true; redraw(); say('Deleted. Click Save changes to publish.'); $('#sec-title').focus();
          } }, 'Delete')));
        listBox.append(fs);
      });
      if (focusSel) { const t = listBox.querySelector(focusSel); if (t && !t.disabled) t.focus(); }
    };
    redraw();
    ed.append(listBox, h('button', { type: 'button', class: 'btn dark small', onclick: () => {
      arr.push({ ...sec.blank }); dirty = true; redraw();
      const last = listBox.querySelector('fieldset:last-of-type input, fieldset:last-of-type textarea'); if (last) last.focus();
    } }, 'Add new'));
  }

  function renderNav() {
    const ul = $('#sections');
    ul.replaceChildren(...SCHEMA.map((s) => h('li', null, h('button', { type: 'button', 'aria-current': String(s.key === current), onclick: () => {
      current = s.key; renderNav(); renderSection(); $('#sec-title').focus();
    } }, s.title))));
  }

  async function save() {
    const btn = $('#save');
    btn.disabled = true;
    try {
      say('Saving…');
      const r = await fetch('/api/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(C) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Save failed (' + r.status + ')');
      dirty = false;
      say('Saved. The live site is updated.', 'ok');
    } catch (e) { say(e.message, 'error'); } finally { btn.disabled = false; }
  }

  async function init() {
    try {
      let r = await fetch('/api/content', { cache: 'no-cache' });
      if (!r.ok) r = await fetch('/data/content.json');
      C = await r.json();
    } catch (e) { say('Could not load site content.', 'error'); return; }
    renderNav(); renderSection();
    $('#save').addEventListener('click', save);
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  init();
})();
