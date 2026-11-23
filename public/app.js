(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    permit: 'M7 3h8l4 4v14H7zM15 3v4h4M10 13l2 2 4-4',
    tax: 'M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5S9.8 10 12 10s4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    vote: 'M4 10h16v10H4zM8 10l-1-4h10l-1 4M9 15l2 2 4-4',
    rental: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
    leaf: 'M5 19c0-9 5-14 14-14 0 9-5 14-14 14zM5 19l8-8',
    map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
    doc: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3'
  };

  const $ = (s, r = document) => r.querySelector(s);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', ICONS[name] || ICONS.doc);
    svg.append(p);
    return svg;
  }

  const safeUrl = (u) => (/^(https?:|mailto:|tel:|#|\/)/i.test(u || '') ? u : '');
  const telHref = (p) => 'tel:+1' + String(p).replace(/\D/g, '').slice(0, 10);
  const isExternal = (u) => /^https?:/i.test(u);

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  const fmtDate = (d, opts) => new Intl.DateTimeFormat('en-US', opts).format(d);

  function link(href, text, attrs) {
    const u = safeUrl(href);
    if (!u) return text;
    const ext = isExternal(u);
    return h('a', { href: u, ...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {}), ...attrs },
      text, ext ? h('span', { class: 'sr-only' }, ' (opens in a new tab)') : null);
  }

  let C = null;

  async function loadContent() {
    for (const url of ['/api/content', '/data/content.json']) {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (r.ok) return await r.json();
      } catch (e) { /* try next source */ }
    }
    throw new Error('Content unavailable');
  }

  /* ---------- Shell ---------- */
  function renderAlerts() {
    const box = $('#alerts');
    box.replaceChildren();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let dismissed = [];
    try { dismissed = JSON.parse(sessionStorage.getItem('dismissedAlerts') || '[]'); } catch (e) { /* ignore */ }
    const list = (C.alerts || []).filter((a) => {
      if (a.active === false) return false;
      const exp = parseDate(a.expires);
      return !(exp && exp < today);
    });
    if (!list.length) return;
    const region = h('section', { 'aria-label': 'Township notices' });
    list.forEach((a, i) => {
      const id = a.id || a.title || String(i);
      if (dismissed.includes(id)) return;
      const level = ['warning', 'emergency'].includes(a.level) ? a.level : 'info';
      const label = { info: 'Notice', warning: 'Important', emergency: 'Emergency' }[level];
      const el = h('div', { class: 'alert level-' + level, ...(level === 'emergency' ? { role: 'alert' } : {}) },
        h('div', { class: 'wrap' },
          h('div', { class: 'alert-body' },
            h('strong', { class: 'label' }, label + ': '), h('strong', null, a.title),
            a.body ? h('p', null, a.body) : null,
            a.link ? h('p', null, link(a.link, a.linkText || 'Learn more')) : null),
          h('button', { class: 'btn-plain', type: 'button', 'aria-label': 'Dismiss notice: ' + a.title, onclick: () => {
            dismissed.push(id);
            try { sessionStorage.setItem('dismissedAlerts', JSON.stringify(dismissed)); } catch (e) { /* ignore */ }
            el.remove();
            $('#main').focus();
          } }, 'Dismiss')));
      region.append(el);
    });
    if (region.children.length) box.append(region);
  }

  function closeMenus(except) {
    document.querySelectorAll('.nav-btn[aria-expanded="true"]').forEach((b) => {
      if (b !== except) {
        b.setAttribute('aria-expanded', 'false');
        $('#' + b.getAttribute('aria-controls')).classList.remove('open');
      }
    });
  }

  function renderHeader() {
    const s = C.site;
    const nav = h('nav', { class: 'nav', id: 'site-nav', 'aria-label': 'Main' });
    const ul = h('ul');
    (C.nav || []).forEach((item, i) => {
      const li = h('li');
      if (item.children && item.children.length) {
        const id = 'sub-' + i;
        const btn = h('button', { class: 'nav-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': id }, item.label, h('span', { class: 'caret', 'aria-hidden': 'true' }));
        const sub = h('ul', { class: 'submenu', id });
        item.children.forEach((c) => sub.append(h('li', null, h('a', { href: safeUrl(c.href) || '#/' }, c.label))));
        btn.addEventListener('click', () => {
          const open = btn.getAttribute('aria-expanded') === 'true';
          closeMenus(btn);
          btn.setAttribute('aria-expanded', String(!open));
          sub.classList.toggle('open', !open);
        });
        li.append(btn, sub);
      } else {
        li.append(h('a', { href: safeUrl(item.href) || '#/' }, item.label));
      }
      ul.append(li);
    });
    nav.append(h('div', { class: 'wrap' }, ul));

    const toggle = h('button', { class: 'menu-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'site-nav', onclick: (e) => {
      const open = nav.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(open));
    } }, 'Menu');

    $('#header').replaceChildren(
      h('div', { class: 'wrap header-top' },
        h('a', { class: 'brand', href: '#/' },
          h('img', { src: '/assets/seal.webp', alt: s.sealAlt || (s.name + ' seal'), width: 84, height: 84 }),
          h('span', null, h('span', { class: 'brand-name' }, s.name), h('span', { class: 'brand-sub' }, s.tagline))),
        toggle),
      nav);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelector('.nav-btn[aria-expanded="true"]');
      if (open) { closeMenus(); open.focus(); }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.nav')) closeMenus(); });
    nav.addEventListener('focusout', (e) => { if (e.relatedTarget && !nav.contains(e.relatedTarget)) closeMenus(); });
  }

  function renderFooter() {
    const s = C.site, f = C.footer || {}, a = C.accessibility || {};
    const dev = f.developerName
      ? h('span', null, ' Website developed by ', f.developerUrl ? link(f.developerUrl, f.developerName) : f.developerName, '.')
      : null;
    $('#footer').replaceChildren(h('div', { class: 'wrap' },
      h('div', { class: 'cols' },
        h('div', null, h('h2', null, s.hallName || s.name),
          h('p', null, s.hallAddress, s.mapUrl ? [h('br'), link(s.mapUrl, 'Get directions')] : null),
          s.hoursNote ? h('p', null, s.hoursNote) : null),
        h('div', null, h('h2', null, 'Contact'),
          h('p', null, s.phone ? [(s.phoneLabel ? s.phoneLabel + ': ' : ''), h('a', { href: telHref(s.phone) }, s.phone), h('br')] : null,
            s.email ? h('a', { href: 'mailto:' + s.email }, s.email) : null, h('br'), s.mailing)),
        h('div', null, h('h2', null, 'Accessibility'),
          h('p', null, 'We aim to meet WCAG 2.2 AA. Report a barrier to ', a.contactName ? a.contactName + (a.contactTitle ? ', ' + a.contactTitle : '') : 'the township', '.'),
          h('p', null, h('a', { href: '#/accessibility' }, 'Accessibility statement')))),
      h('p', { class: 'legal' }, '© ' + new Date().getFullYear() + ' ' + s.name + '. All Rights Reserved.', dev)));
  }

  /* ---------- Pages ---------- */
  function upcomingEvents() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (C.events || [])
      .map((e) => ({ ...e, d: parseDate(e.date) }))
      .filter((e) => e.d && e.d >= today)
      .sort((a, b) => a.d - b.d);
  }

  function pageHome() {
    const s = C.site;
    const hero = h('section', { class: 'hero' + (s.heroImage ? ' has-img' : ''), 'aria-labelledby': 'page-title' },
      s.heroImage ? h('img', { class: 'hero-img', src: safeUrl(s.heroImage), alt: s.heroAlt || '' }) : null,
      h('div', { class: 'wrap' },
        h('h1', { id: 'page-title', tabindex: '-1' }, s.heroTitle || s.name),
        h('p', null, s.heroText),
        h('div', { class: 'hero-actions' },
          h('a', { class: 'btn solid', href: '#/meetings' }, 'Meeting schedule'),
          h('a', { class: 'btn', href: '#/officials' }, 'Contact officials'))));

    const tiles = h('section', { class: 'block', 'aria-labelledby': 'tiles-h' },
      h('div', { class: 'wrap' }, h('h2', { id: 'tiles-h' }, 'Quick links'),
        h('ul', { class: 'grid tiles' }, (C.tiles || []).map((t) =>
          h('li', { class: 'tile' }, h('a', { href: safeUrl(t.href) || '#/', ...(isExternal(t.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
            icon(t.icon), h('span', { class: 't-title' }, t.title, isExternal(t.href) ? h('span', { class: 'sr-only' }, ' (opens in a new tab)') : null),
            h('span', { class: 't-desc' }, t.desc)))))));

    const events = upcomingEvents().slice(0, 6);
    const calendar = h('section', { class: 'block alt', 'aria-labelledby': 'cal-h' },
      h('div', { class: 'wrap grid two-col' },
        h('div', { class: 'card' }, h('h2', { id: 'cal-h' }, 'Upcoming events'),
          events.length
            ? h('ul', { class: 'list-plain' }, events.map((e) => h('li', null,
              h('span', { class: 'date-chip' }, fmtDate(e.d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })),
              h('br'), h('strong', null, e.title),
              e.time || e.location ? h('div', { class: 'muted' }, [e.time, e.location].filter(Boolean).join(' · ')) : null,
              e.desc ? h('div', null, e.desc) : null)))
            : h('p', { class: 'muted' }, 'No events are scheduled right now. Check back soon.')),
        h('div', { class: 'card' }, h('h2', null, 'Regular meetings'),
          h('ul', { class: 'list-plain' }, (C.meetings || []).slice(0, 3).map((m) => h('li', null, h('strong', null, m.name), h('div', null, m.schedule)))),
          h('p', null, h('a', { href: '#/meetings' }, 'See all meeting times')))));

    const news = (C.announcements || []).length ? h('section', { class: 'block', 'aria-labelledby': 'news-h' },
      h('div', { class: 'wrap' }, h('h2', { id: 'news-h' }, 'Township announcements'),
        h('div', { class: 'grid two-col' }, C.announcements.map((a) => {
          const d = parseDate(a.date);
          return h('article', { class: 'card' }, h('h3', null, a.title),
            d ? h('p', { class: 'muted' }, fmtDate(d, { month: 'long', day: 'numeric', year: 'numeric' })) : null,
            h('p', null, a.body), a.link ? h('p', null, link(a.link, a.linkText || 'Read more')) : null);
        })))) : null;

    const hall = h('section', { class: 'block alt', 'aria-labelledby': 'visit-h' },
      h('div', { class: 'wrap grid two-col' },
        h('div', { class: 'card' }, h('h2', { id: 'visit-h' }, 'Township hall'),
          h('p', null, h('strong', null, s.hallName), h('br'), s.hallAddress, s.hallDirections ? [h('br'), s.hallDirections] : null),
          s.hoursNote ? h('p', null, s.hoursNote) : null, s.mapUrl ? h('p', null, link(s.mapUrl, 'Get directions')) : null),
        h('div', { class: 'card' }, h('h2', null, 'Hall & park rentals'),
          h('p', null, s.rentalsNote),
          s.parkNote ? h('p', null, s.parkNote) : null,
          s.rentalsEmail ? h('p', null, h('a', { href: 'mailto:' + s.rentalsEmail }, s.rentalsEmail)) : null)));

    return { title: s.name + ' | Arenac County, Michigan', nodes: [hero, tiles, calendar, news, hall], noH1: true };
  }

  function pageOfficials() {
    const rows = (C.officials || []).map((o) => h('tr', null,
      h('th', { scope: 'row' }, o.title), h('td', null, o.name),
      h('td', null, o.phone ? h('a', { href: telHref(o.phone) }, o.phone) : '—'),
      h('td', null, o.email ? h('a', { href: 'mailto:' + o.email }, o.email) : '—'),
      h('td', null, o.address || '—')));
    return { title: 'Officials', nodes: [h('div', { class: 'wrap' }, h('div', { class: 'officials-wrap' },
      h('table', { class: 'officials' }, h('caption', null, 'Township officials and contact information'),
        h('thead', null, h('tr', null, ['Position', 'Name', 'Phone', 'Email', 'Mailing address'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, rows))))] };
  }

  function pageMeetings() {
    return { title: 'Meetings', nodes: [h('div', { class: 'wrap grid two-col' }, (C.meetings || []).map((m) =>
      h('article', { class: 'card' }, h('h2', null, m.name), h('p', null, m.schedule), m.location ? h('p', { class: 'muted' }, m.location) : null)))] };
  }

  function pageAccessibility() {
    const a = C.accessibility || {};
    return { title: 'Accessibility Statement', nodes: [h('div', { class: 'wrap' }, h('div', { class: 'card' },
      h('p', null, a.statement),
      h('h2', null, 'Report an accessibility barrier'),
      h('dl', { class: 'contact' },
        h('dt', null, 'Contact'), h('dd', null, [a.contactName, a.contactTitle].filter(Boolean).join(', ')),
        a.contactPhone ? [h('dt', null, 'Phone'), h('dd', null, h('a', { href: telHref(a.contactPhone) }, a.contactPhone))] : null,
        a.contactEmail ? [h('dt', null, 'Email'), h('dd', null, h('a', { href: 'mailto:' + a.contactEmail }, a.contactEmail))] : null),
      a.lastReviewed && parseDate(a.lastReviewed) ? h('p', { class: 'muted' }, 'Last reviewed: ' + fmtDate(parseDate(a.lastReviewed), { month: 'long', day: 'numeric', year: 'numeric' })) : null))] };
  }

  function pageComingSoon(name) {
    const s = C.site;
    return { title: name, nodes: [h('div', { class: 'wrap' }, h('div', { class: 'card' },
      h('p', null, 'This page is being built. For help now, call ', h('a', { href: telHref(s.phone) }, s.phone), ' or email ', h('a', { href: 'mailto:' + s.email }, s.email), '.'),
      h('p', null, h('a', { class: 'btn dark', href: '#/' }, 'Back to home'))))] };
  }

  const ROUTES = { '/': pageHome, '/officials': pageOfficials, '/meetings': pageMeetings, '/accessibility': pageAccessibility };

  function labelFor(path) {
    for (const n of C.nav || []) {
      for (const c of n.children || [n]) if (c.href === '#' + path) return c.label;
    }
    return path.replace(/^\//, '').replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) || 'Page';
  }

  let first = true;
  function route() {
    const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
    const page = (ROUTES[path] || (() => pageComingSoon(labelFor(path))))();
    const main = $('#main');
    const nodes = page.nodes.filter(Boolean);
    if (!page.noH1) nodes.unshift(h('div', { class: 'wrap page-title' }, h('h1', { id: 'page-title', tabindex: '-1' }, page.title)));
    main.replaceChildren(...nodes);
    document.title = (path === '/' ? page.title : page.title + ' | ' + C.site.name);
    document.querySelectorAll('.nav a').forEach((a) => {
      if (a.getAttribute('href') === '#' + path) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    closeMenus();
    const nav = $('#site-nav'); const tog = $('.menu-toggle');
    if (nav) nav.classList.remove('open');
    if (tog) tog.setAttribute('aria-expanded', 'false');
    window.scrollTo(0, 0);
    if (!first) {
      $('#page-title').focus();
      $('#route-status').textContent = 'Navigated to ' + page.title;
    }
    first = false;
  }

  loadContent().then((data) => {
    C = data;
    renderAlerts(); renderHeader(); renderFooter(); route();
    window.addEventListener('hashchange', route);
  }).catch(() => {
    $('#main').replaceChildren(h('div', { class: 'wrap page-title' },
      h('h1', null, 'Moffatt Township'),
      h('p', null, 'The site could not load. Please call 989-836-2452 or write to PO Box 58, Alger, MI 48610.')));
  });
})();
