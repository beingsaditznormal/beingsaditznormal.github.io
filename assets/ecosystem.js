/* Cultural ecosystem — filterable graph + list.
 *
 * Data comes from _data/ecosystem.yml, which Jekyll inlines as JSON in
 * <script id="eco-data">. You never need to touch this file to add resources.
 *
 * Graph model (bipartite):
 *   resource nodes  — one per entry; colour = media family, fill = status
 *   hub nodes       — one per #tag, plus one per author shared by 2+ entries
 *   edges           — resource ↔ each of its hubs
 * A hub is drawn only when at least two visible resources share it
 * (or when it is the active #tag filter), so the graph shows connections,
 * not a fringe of one-off leaves.
 */
(function () {
  'use strict';

  var dataEl = document.getElementById('eco-data');
  var raw = [];
  try { raw = JSON.parse(dataEl ? dataEl.textContent : '[]') || []; } catch (e) { raw = []; }

  // ------------------------------------------------------------ vocabulary
  var TYPE_LABEL = {
    book: 'Book', film: 'Film', series: 'Series', video: 'Video', podcast: 'Podcast',
    article: 'Article', newsletter: 'Newsletter', paper: 'Paper', course: 'Course'
  };
  var TYPE_ORDER = Object.keys(TYPE_LABEL);
  var FAMILY = {
    book: 'read', article: 'read', newsletter: 'read', paper: 'read',
    film: 'watch', series: 'watch', video: 'watch',
    podcast: 'listen', course: 'listen'
  };
  var STATUS_ORDER = ['now', 'done', 'next'];
  var STATUS_LABEL = { now: 'consuming now', done: 'consumed', next: 'up next' };

  // ------------------------------------------------------------ model
  var items = raw.filter(function (d) { return d && d.title; }).map(function (d, i) {
    var tags = Array.isArray(d.tags) ? d.tags.map(function (t) { return String(t).trim().toLowerCase(); }).filter(Boolean) : [];
    var item = {
      id: 'r' + i, kind: 'res',
      title: String(d.title),
      author: d.author ? String(d.author) : '',
      type: d.type ? String(d.type) : 'other',
      status: STATUS_LABEL[d.status] ? d.status : 'done',
      when: d.when ? String(d.when) : '',
      paused: !!d.paused,
      comment: d.comment ? String(d.comment) : '',
      links: Array.isArray(d.links) ? d.links.filter(function (l) { return l && /^https?:\/\//i.test(String(l.url || '')); }) : [],
      tags: tags.filter(function (t, j) { return tags.indexOf(t) === j; }),
      hubs: []
    };
    item.family = FAMILY[item.type] || 'read';
    item.text = (item.title + ' ' + item.author + ' ' + item.tags.join(' ')).toLowerCase();
    return item;
  });

  var hubs = {};
  function hub(id, kind, label) {
    if (!hubs[id]) hubs[id] = { id: id, kind: kind, label: label, members: [] };
    return hubs[id];
  }
  var authorCount = {};
  items.forEach(function (d) { if (d.author) authorCount[d.author] = (authorCount[d.author] || 0) + 1; });
  items.forEach(function (d) {
    d.tags.forEach(function (t) { var h = hub('t:' + t, 'tag', t); h.members.push(d); d.hubs.push(h); });
    if (d.author && authorCount[d.author] > 1) {
      var h = hub('a:' + d.author, 'author', d.author); h.members.push(d); d.hubs.push(h);
    }
  });
  var hubList = Object.keys(hubs).map(function (k) { return hubs[k]; });

  var presentTypes = TYPE_ORDER.filter(function (t) { return items.some(function (d) { return d.type === t; }); });
  items.forEach(function (d) { if (presentTypes.indexOf(d.type) < 0) presentTypes.push(d.type); });

  // ------------------------------------------------------------ filter state
  var state = { types: presentTypes.slice(), statuses: STATUS_ORDER.slice(), tag: '', q: '' };

  function matchFields(type, status, tags, text) {
    return state.types.indexOf(type) >= 0 &&
      state.statuses.indexOf(status) >= 0 &&
      (!state.tag || tags.indexOf(state.tag) >= 0) &&
      (!state.q || text.indexOf(state.q) >= 0);
  }
  function matches(d) { return matchFields(d.type, d.status, d.tags, d.text); }

  // ------------------------------------------------------------ controls
  var controls = document.getElementById('eco-controls');
  var resultEl = document.getElementById('eco-result');
  var typeChips = [], statusChips = [], tagSelect, searchInput;

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    if (text != null) n.textContent = text;
    return n;
  }

  function chipGroup(label, values, current, render, onToggle) {
    var group = el('div', { class: 'eco-chipgroup', role: 'group', 'aria-label': label });
    var chips = values.map(function (v) {
      var b = el('button', { type: 'button', class: 'chip', 'data-value': v, 'aria-pressed': 'true' });
      render(b, v);
      b.addEventListener('click', function () { onToggle(v); });
      group.appendChild(b);
      return b;
    });
    controls.appendChild(group);
    return chips;
  }

  function toggle(list, all, v) {
    var i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1); else list.push(v);
    if (!list.length) all.forEach(function (x) { list.push(x); }); // never filter everything out
  }

  if (controls) {
    typeChips = chipGroup('Type', presentTypes, state.types, function (b, v) {
      b.appendChild(el('i', { class: 'sw fam-' + (FAMILY[v] || 'read') }));
      b.appendChild(document.createTextNode((TYPE_LABEL[v] || v).toLowerCase()));
    }, function (v) { toggle(state.types, presentTypes, v); update(); });

    statusChips = chipGroup('Status', STATUS_ORDER, state.statuses, function (b, v) {
      b.appendChild(el('i', { class: 'gl gl-' + v }));
      b.appendChild(document.createTextNode(STATUS_LABEL[v]));
    }, function (v) { toggle(state.statuses, STATUS_ORDER, v); update(); });

    var row = el('div', { class: 'eco-chipgroup eco-inputs' });
    tagSelect = el('select', { 'aria-label': 'Theme' });
    tagSelect.appendChild(el('option', { value: '' }, 'all themes'));
    hubList.filter(function (h) { return h.kind === 'tag'; })
      .sort(function (a, b) { return b.members.length - a.members.length || a.label.localeCompare(b.label); })
      .forEach(function (h) { tagSelect.appendChild(el('option', { value: h.label }, '#' + h.label + ' (' + h.members.length + ')')); });
    tagSelect.addEventListener('change', function () { setTag(tagSelect.value); });

    searchInput = el('input', { type: 'search', placeholder: 'search title, author, theme…', 'aria-label': 'Search' });
    searchInput.addEventListener('input', function () { state.q = searchInput.value.trim().toLowerCase(); update(); });

    var reset = el('button', { type: 'button', class: 'chip chip-reset' }, 'reset');
    reset.addEventListener('click', function () {
      state.types = presentTypes.slice(); state.statuses = STATUS_ORDER.slice(); state.tag = ''; state.q = '';
      searchInput.value = ''; closeDetail(); update();
    });
    row.appendChild(tagSelect); row.appendChild(searchInput); row.appendChild(reset);
    controls.appendChild(row);
  }

  function setTag(t) {
    state.tag = state.tag === t ? '' : t;
    update();
  }

  function syncControls() {
    typeChips.forEach(function (b) { b.setAttribute('aria-pressed', String(state.types.indexOf(b.dataset.value) >= 0)); });
    statusChips.forEach(function (b) { b.setAttribute('aria-pressed', String(state.statuses.indexOf(b.dataset.value) >= 0)); });
    if (tagSelect) tagSelect.value = state.tag;
    if (searchInput && searchInput.value.trim().toLowerCase() !== state.q) searchInput.value = state.q;
    var n = items.filter(matches).length;
    if (resultEl) resultEl.textContent = n === items.length ? items.length + ' resources' : n + ' of ' + items.length + ' resources';
  }

  // ------------------------------------------------------------ list view
  var listItems = Array.prototype.slice.call(document.querySelectorAll('.eco-list li[data-type]'));

  function updateList() {
    listItems.forEach(function (li) {
      var tags = li.dataset.tags ? li.dataset.tags.split('|') : [];
      li.hidden = !matchFields(li.dataset.type, li.dataset.status, tags, (li.dataset.text || '') + ' ' + tags.join(' '));
    });
    document.querySelectorAll('.eco-group').forEach(function (g) { g.hidden = !g.querySelector('li:not([hidden])'); });
    document.querySelectorAll('.eco-section').forEach(function (s) {
      var n = s.querySelectorAll('li:not([hidden])').length;
      s.hidden = n === 0;
      var c = s.querySelector('[data-count]'); if (c) c.textContent = n;
    });
    document.querySelectorAll('.eco-tag').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tag === state.tag); });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.eco-tag');
    if (t) setTag(t.dataset.tag);
  });

  // ------------------------------------------------------------ tabs
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  var graphOk = !!window.d3 && items.length > 0;
  var current = 'graph';

  function showTab(name, focus) {
    if (!graphOk) name = 'list';
    current = name;
    tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (name === 'graph') graph.show();
    // remember the view in the URL, but keep #now/#done/#next section links intact
    var onSection = STATUS_ORDER.indexOf(location.hash.slice(1)) >= 0;
    if (history.replaceState && location.hash !== '#' + name && (name === 'graph' || !onSection)) {
      history.replaceState(null, '', '#' + name);
    }
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { showTab(t.dataset.tab); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        showTab(next.dataset.tab, true);
      }
    });
  });
  if (!graphOk) tabs.forEach(function (t) { if (t.dataset.tab === 'graph') t.hidden = true; });

  // ------------------------------------------------------------ graph view
  var graph = graphOk ? buildGraph() : { show: function () {}, update: function () {} };

  function buildGraph() {
    var d3 = window.d3;
    var wrap = document.getElementById('eco-graph');
    var tip = document.getElementById('eco-tip');
    var detail = document.getElementById('eco-detail');
    var empty = document.getElementById('eco-empty');
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var svg = d3.select(wrap).insert('svg', ':first-child')
      .attr('class', 'eco-svg')
      .attr('role', 'img')
      .attr('aria-label', 'Graph of resources connected by shared themes and authors. The list view has the same content as text.');
    var root = svg.append('g');
    var gLinks = root.append('g').attr('class', 'links');
    var gNodes = root.append('g').attr('class', 'nodes');
    var gLabels = root.append('g').attr('class', 'labels').attr('aria-hidden', 'true'); // above every node, so titles are never covered

    var W = 0, H = 0, nodes = [], links = [], nodeSel = gNodes.selectAll('g'), linkSel = gLinks.selectAll('line'), labelSel = gLabels.selectAll('text');
    var selected = null, needFit = true, dirty = true;

    var zoom = d3.zoom().scaleExtent([0.3, 4]).on('zoom', function (e) {
      root.attr('transform', e.transform);
      svg.classed('zoomed', e.transform.k > 1.6);
      hideTip();
    });
    svg.call(zoom).on('dblclick.zoom', null);
    svg.on('click', function (e) { if (e.target === svg.node()) closeDetail(); });

    function hubR(h) { return 3 + 2 * Math.sqrt(h.deg || 1); }

    var sim = d3.forceSimulation()
      .alphaDecay(0.035)
      .force('link', d3.forceLink().distance(function (l) { return l.target.kind === 'author' ? 34 : 58; }).strength(0.55))
      .force('charge', d3.forceManyBody().strength(function (n) { return n.kind === 'res' ? -110 : -160; }))
      .force('collide', d3.forceCollide(function (n) { return n.kind === 'res' ? 15 : hubR(n) + 9; }))
      .force('x', d3.forceX().strength(0.07))
      .force('y', d3.forceY().strength(0.09))
      .on('tick', ticked)
      .on('end', function () { if (needFit) { needFit = false; fit(true); } })
      .stop();

    function measure() {
      var w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return false;
      if (w !== W || h !== H) {
        W = w; H = h;
        svg.attr('viewBox', [0, 0, W, H]);
        sim.force('x').x(W / 2).strength(0.07 * Math.max(1, H / W));
        sim.force('y').y(H / 2).strength(0.07 * Math.max(1, W / H));
      }
      return true;
    }

    function render() {
      if (!measure()) { dirty = true; return; }
      dirty = false;
      var vis = items.filter(matches);
      var visIds = {};
      vis.forEach(function (d) { visIds[d.id] = true; });
      var shownHubs = hubList.filter(function (h) {
        h.deg = h.members.filter(function (m) { return visIds[m.id]; }).length;
        return h.deg >= 2 || (h.kind === 'tag' && h.label === state.tag && h.deg >= 1);
      });
      var hubIds = {};
      shownHubs.forEach(function (h) { hubIds[h.id] = true; });

      nodes = shownHubs.concat(vis);
      nodes.forEach(function (n) {
        if (n.x == null) { n.x = W / 2 + (Math.random() - 0.5) * W * 0.6; n.y = H / 2 + (Math.random() - 0.5) * H * 0.6; }
      });
      links = [];
      vis.forEach(function (d) {
        d.hubs.forEach(function (h) { if (hubIds[h.id]) links.push({ id: d.id + '>' + h.id, source: d, target: h }); });
      });

      linkSel = gLinks.selectAll('line').data(links, function (l) { return l.id; })
        .join('line').attr('class', function (l) { return 'link link-' + l.target.kind; });

      nodeSel = gNodes.selectAll('g.node').data(nodes, function (n) { return n.id; })
        .join(function (enter) { return enter.append('g').each(buildNode); });
      nodeSel.filter(function (n) { return n.kind === 'tag'; }).select('.mark').attr('r', hubR);
      nodeSel.classed('is-active-tag', function (n) { return n.kind === 'tag' && n.label === state.tag; });

      labelSel = gLabels.selectAll('text').data(nodes, function (n) { return n.id; })
        .join(function (enter) {
          return enter.append('text')
            .attr('class', function (n) { return 'label label-' + n.kind + (n.kind === 'res' ? ' st-' + n.status : ''); })
            .text(function (n) { return n.kind === 'res' ? truncate(n.title, 34) : n.kind === 'tag' ? '#' + n.label : n.label; });
        })
        .attr('x', function (n) { return n.kind === 'res' ? 13 : 0; })
        .attr('y', function (n) { return n.kind === 'tag' ? hubR(n) + 12 : n.kind === 'author' ? 20 : 0; })
        .attr('dy', function (n) { return n.kind === 'res' ? '0.35em' : null; })
        .attr('text-anchor', function (n) { return n.kind === 'res' ? null : 'middle'; })
        .classed('is-active-tag', function (n) { return n.kind === 'tag' && n.label === state.tag; });

      if (selected && !visIds[selected.id]) closeDetail();
      empty.hidden = vis.length > 0;

      sim.nodes(nodes);
      sim.force('link').links(links);
      needFit = true;
      if (reduceMotion) { sim.alpha(1); for (var i = 0; i < 300; i++) sim.tick(); ticked(); needFit = false; fit(false); }
      else sim.alpha(0.9).restart();
      restyle();
    }

    function buildNode(n) {
      var g = d3.select(this);
      if (n.kind === 'res') {
        g.attr('class', 'node node-res fam-' + n.family + ' st-' + n.status)
          .attr('tabindex', 0).attr('role', 'button')
          .attr('aria-label', n.title + (n.author ? ' — ' + n.author : '') + ', ' + (TYPE_LABEL[n.type] || n.type) + ', ' + STATUS_LABEL[n.status]);
        if (n.status === 'now') g.append('circle').attr('class', 'halo').attr('r', 8);
        g.append('circle').attr('class', 'hit').attr('r', 16);
        g.append('circle').attr('class', 'mark').attr('r', 8);
        g.on('click', function (e) { e.stopPropagation(); openDetail(n); })
          .on('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(n); } })
          .on('focus', function () { highlight(n); })
          .on('blur', function () { highlight(selected); });
      } else if (n.kind === 'tag') {
        g.attr('class', 'node node-tag').attr('role', 'button').attr('tabindex', 0)
          .attr('aria-label', 'Filter by theme ' + n.label);
        g.append('circle').attr('class', 'hit').attr('r', 14);
        g.append('circle').attr('class', 'mark');
        g.on('click', function (e) { e.stopPropagation(); setTag(n.label); })
          .on('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTag(n.label); } });
      } else {
        g.attr('class', 'node node-author').attr('role', 'button').attr('tabindex', 0)
          .attr('aria-label', 'Search for ' + n.label);
        g.append('circle').attr('class', 'hit').attr('r', 14);
        g.append('rect').attr('class', 'mark').attr('x', -5.5).attr('y', -5.5).attr('width', 11).attr('height', 11).attr('transform', 'rotate(45)');
        var byAuthor = function () { state.q = n.label.toLowerCase(); update(); };
        g.on('click', function (e) { e.stopPropagation(); byAuthor(); })
          .on('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); byAuthor(); } });
      }
      g.on('pointerenter', function (e) { highlight(n); if (n.kind === 'res' && e.pointerType !== 'touch') showTip(n, e); })
        .on('pointermove', function (e) { if (n.kind === 'res' && e.pointerType !== 'touch') moveTip(e); })
        .on('pointerleave', function () { highlight(selected); hideTip(); });
      g.call(d3.drag()
        .on('start', function (e) { if (!e.active) sim.alphaTarget(0.25).restart(); n.fx = n.x; n.fy = n.y; hideTip(); })
        .on('drag', function (e) { n.fx = e.x; n.fy = e.y; })
        .on('end', function (e) { if (!e.active) sim.alphaTarget(0); n.fx = null; n.fy = null; }));
    }

    function ticked() {
      linkSel.attr('x1', function (l) { return l.source.x; }).attr('y1', function (l) { return l.source.y; })
        .attr('x2', function (l) { return l.target.x; }).attr('y2', function (l) { return l.target.y; });
      nodeSel.attr('transform', function (n) { return 'translate(' + n.x + ',' + n.y + ')'; });
      labelSel.attr('transform', function (n) { return 'translate(' + n.x + ',' + n.y + ')'; });
    }

    function fit(animate) {
      if (!nodes.length || !W) return;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      nodes.forEach(function (n) {
        x0 = Math.min(x0, n.x - 20); y0 = Math.min(y0, n.y - 20);
        x1 = Math.max(x1, n.x + (n.kind === 'res' ? 70 : 40)); y1 = Math.max(y1, n.y + 28);
      });
      var k = Math.max(0.3, Math.min(1.5, 0.92 * Math.min(W / (x1 - x0), H / (y1 - y0))));
      var t = d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k);
      (animate && !reduceMotion ? svg.transition().duration(600) : svg).call(zoom.transform, t);
    }

    // ---- highlight: a resource and its hubs (or a hub and its resources)
    function highlight(n) {
      if (!n) { [nodeSel, labelSel, linkSel].forEach(function (s) { s.classed('dim', false).classed('lit', false); }); return; }
      var near = {}; near[n.id] = true;
      links.forEach(function (l) {
        if (l.source === n) near[l.target.id] = true;
        if (l.target === n) near[l.source.id] = true;
      });
      [nodeSel, labelSel].forEach(function (s) {
        s.classed('dim', function (d) { return !near[d.id]; }).classed('lit', function (d) { return !!near[d.id]; });
      });
      linkSel.classed('dim', function (l) { return l.source !== n && l.target !== n; })
        .classed('lit', function (l) { return l.source === n || l.target === n; });
    }
    function restyle() {
      nodeSel.classed('is-selected', function (d) { return d === selected; });
      labelSel.classed('is-selected', function (d) { return d === selected; });
      highlight(selected);
    }

    // ---- tooltip
    function showTip(n, e) {
      tip.textContent = '';
      tip.appendChild(el('strong', null, n.title));
      if (n.author) tip.appendChild(el('span', null, n.author));
      tip.appendChild(el('small', null, [(TYPE_LABEL[n.type] || n.type).toLowerCase(), STATUS_LABEL[n.status] + (n.paused ? ' (paused)' : ''), n.when].filter(Boolean).join(' · ')));
      tip.hidden = false;
      moveTip(e);
    }
    function moveTip(e) {
      var r = wrap.getBoundingClientRect();
      var x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      var w = tip.offsetWidth, h = tip.offsetHeight;
      if (x + w > W - 8) x = e.clientX - r.left - w - 14;
      if (y + h > H - 8) y = e.clientY - r.top - h - 14;
      tip.style.transform = 'translate(' + Math.max(8, x) + 'px,' + Math.max(8, y) + 'px)';
    }
    function hideTip() { tip.hidden = true; }

    // ---- detail card
    function openDetail(n) {
      selected = n;
      hideTip();
      detail.textContent = '';
      var close = el('button', { type: 'button', class: 'eco-close', 'aria-label': 'Close' }, '×');
      close.addEventListener('click', closeDetail);
      detail.appendChild(close);
      detail.appendChild(el('p', { class: 'eco-detail-kicker fam-' + n.family }, [(TYPE_LABEL[n.type] || n.type).toLowerCase(), STATUS_LABEL[n.status] + (n.paused ? ' (paused)' : ''), n.when].filter(Boolean).join(' · ')));
      detail.appendChild(el('h3', null, n.title));
      if (n.author) detail.appendChild(el('p', { class: 'eco-author' }, n.author));
      if (n.comment) detail.appendChild(el('p', { class: 'eco-comment' }, n.comment));
      if (n.links.length) {
        var p = el('p', { class: 'eco-meta' });
        n.links.forEach(function (l, i) {
          if (i) p.appendChild(document.createTextNode(' · '));
          p.appendChild(el('a', { href: String(l.url), rel: 'noopener' }, String(l.label || l.url)));
        });
        detail.appendChild(p);
      }
      if (n.tags.length) {
        var tg = el('p', { class: 'eco-tags' });
        n.tags.forEach(function (t) {
          tg.appendChild(el('button', { type: 'button', class: 'eco-tag' + (t === state.tag ? ' is-active' : ''), 'data-tag': t }, '#' + t));
        });
        detail.appendChild(tg);
      }
      detail.hidden = false;
      restyle();
    }
    function close() { selected = null; detail.hidden = true; if (nodeSel) restyle(); }

    document.getElementById('eco-fit').addEventListener('click', function () { fit(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && selected) closeDetail(); });

    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (current !== 'graph') return;
        var w = W, h = H;
        if (measure() && (w !== W || h !== H)) { if (dirty) render(); else { needFit = true; sim.alpha(0.3).restart(); } }
      }).observe(wrap);
    }

    return {
      show: function () { if (dirty || !W) render(); },
      update: function () { if (current === 'graph') render(); else dirty = true; },
      close: close
    };
  }

  function closeDetail() { if (graph.close) graph.close(); }

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ------------------------------------------------------------ wiring
  function update() {
    syncControls();
    updateList();
    graph.update();
  }

  var h = (location.hash || '').slice(1);
  syncControls();
  updateList();
  showTab(h === 'list' || STATUS_ORDER.indexOf(h) >= 0 ? 'list' : 'graph');
})();
