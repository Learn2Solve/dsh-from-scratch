/* DeepSeek Harness from Scratch - shared runtime.
   Vanilla JS, no dependencies. Loaded by every page as a classic script. */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Book structure. Single source of truth for index, TOC and prev/next.
  // ------------------------------------------------------------------
  var CHAPTERS = [
    { id: 'ch01', n: '01', title: '最小的 agent loop',
      desc: '从一个 while 循环开始：模型请求、工具调用、终止条件。先把 harness 的心脏跑起来，再谈架构。',
      build: 'miniLoop()' },
    { id: 'ch02', n: '02', title: 'Context 与 Service',
      desc: 'Cordis 内核的第一块：用 Proxy 做服务反射，用 inject 让加载顺序从依赖里自己长出来。',
      build: 'Context / Service' },
    { id: 'ch03', n: '03', title: 'Fiber 与 effect',
      desc: '插件的生命周期状态机。注册即副作用：每次注册都返回 disposer，卸载时反序回收。',
      build: 'Fiber / ctx.effect()' },
    { id: 'ch04', n: '04', title: '事件的五种模式',
      desc: 'emit / parallel / serial / bail / waterfall。瀑布是扩展点的本体：不调 next() 就短路整条链。',
      build: 'ctx.on() / waterfall' },
    { id: 'ch05', n: '05', title: '会话日志与表面投影',
      desc: '全书的核心机制。只追加的事件日志，加上 surfaceOp 折叠出的模型视图，让压缩不再是破坏性操作。',
      build: 'SessionLog / deriveMessages()' },
    { id: 'ch06', n: '06', title: '工具流水线与能力接缝',
      desc: 'Service Definition / Provider / Consumer 三件套。换一个 provider，bash、PTY、LSP 一起换世界。',
      build: 'ctx.tools / capability seam' },
    { id: 'ch07', n: '07', title: 'YAML 组合：profile、bundle、patch、preset',
      desc: '把整个产品降维成一棵可打补丁的配置树，并让每个会话挂载自己的插件子树。',
      build: 'Loader / patch layers' },
    { id: 'ch08', n: '08', title: 'Code Mode',
      desc: '不再一次调一个工具，而是让模型写一段 TypeScript 程序。五次往返压缩成一次。',
      build: 'run_code / 生成 SDK' },
    { id: 'ch09', n: '09', title: '自我改造：让 agent 修改自己的运行时',
      desc: '终章。模型现场写一个插件，挂进正在运行的进程，然后立刻调用它注册的新工具。',
      build: 'cordis_define / cordis_run' }
  ];

  // Appendix pages sit after the numbered chapters in the reading order but
  // carry no chapter number.
  var APPENDIX = [
    { id: 'compare', n: '附录', title: '横向对照：Pi、omp、Claude Code、Codex、OpenCode',
      desc: '同一件事，六个 harness 各自怎么做。逐机制对照，不谈品牌好坏，只看结构差在哪里。其中三个同源。',
      build: '一张可筛选的对照矩阵' }
  ];

  var DSH = window.DSH = {};
  DSH.chapters = CHAPTERS;
  DSH.appendix = APPENDIX;
  var NAV = CHAPTERS.concat(APPENDIX);

  // ------------------------------------------------------------------
  // tiny helpers
  // ------------------------------------------------------------------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  DSH.el = el;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  DSH.esc = esc;

  function slug(s) {
    return String(s).trim().toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '') || 'sec';
  }

  // ------------------------------------------------------------------
  // syntax highlighting (js / ts / yaml / json / text)
  // ------------------------------------------------------------------
  var JS_KW = /\b(await|async|break|case|catch|class|const|continue|declare|default|delete|do|else|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|of|readonly|return|set|static|super|switch|this|throw|try|type|typeof|var|void|while|yield|true|false|null|undefined)\b/;

  function hlJS(src) {
    var re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|(`(?:\\[\s\S]|[^\\`])*`|'(?:\\[\s\S]|[^\\'])*'|"(?:\\[\s\S]|[^\\"])*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
    var out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      last = re.lastIndex;
      if (m[1]) out += '<span class="t-com">' + esc(m[1]) + '</span>';
      else if (m[2]) out += '<span class="t-str">' + esc(m[2]) + '</span>';
      else if (m[3]) out += '<span class="t-num">' + esc(m[3]) + '</span>';
      else {
        var w = m[4];
        if (JS_KW.test(w)) out += '<span class="t-key">' + esc(w) + '</span>';
        else if (/^[A-Z]/.test(w)) out += '<span class="t-typ">' + esc(w) + '</span>';
        else if (src[re.lastIndex] === '(') out += '<span class="t-fn">' + esc(w) + '</span>';
        else out += esc(w);
      }
    }
    return out + esc(src.slice(last));
  }

  function hlYAML(src) {
    return src.split('\n').map(function (line) {
      var c = line.indexOf('#');
      var code = c >= 0 ? line.slice(0, c) : line;
      var com = c >= 0 ? '<span class="t-com">' + esc(line.slice(c)) + '</span>' : '';
      code = esc(code)
        .replace(/^(\s*-?\s*)([\w.$-]+)(:)/, '$1<span class="t-key">$2</span><span class="t-pun">$3</span>')
        .replace(/(!!js|!!str|!!int)/g, '<span class="t-typ">$1</span>')
        .replace(/(&#39;[^&]*?&#39;)/g, '<span class="t-str">$1</span>');
      return code + com;
    }).join('\n');
  }

  DSH.hl = function (src, lang) {
    if (lang === 'yaml' || lang === 'yml') return hlYAML(src);
    if (lang === 'text' || lang === 'txt' || lang === 'out') return esc(src);
    return hlJS(src);
  };

  function highlightAll(root) {
    (root || document).querySelectorAll('pre > code').forEach(function (c) {
      if (c.dataset.hl) return;
      c.dataset.hl = '1';
      c.innerHTML = DSH.hl(c.textContent.replace(/^\n/, '').replace(/\s+$/, ''), c.dataset.lang || 'js');
    });
  }
  DSH.highlightAll = highlightAll;

  // ------------------------------------------------------------------
  // output console bound to a .out element
  // ------------------------------------------------------------------
  DSH.out = function (target) {
    var node = typeof target === 'string' ? document.getElementById(target) : target;
    function push(text, cls) {
      var line = el('span', { class: 'l' + (cls ? ' ' + cls : '') });
      line.innerHTML = typeof text === 'string' ? text : esc(JSON.stringify(text));
      node.appendChild(line);
      node.scrollTop = node.scrollHeight;
      return line;
    }
    return {
      node: node,
      log: function (t) { return push(esc(t == null ? '' : t)); },
      raw: function (h) { return push(h); },
      dim: function (t) { return push(esc(t), 'dim'); },
      acc: function (t) { return push(esc(t), 'acc'); },
      ok: function (t) { return push(esc(t), 'ok'); },
      bad: function (t) { return push(esc(t), 'bad'); },
      warn: function (t) { return push(esc(t), 'warn'); },
      head: function (t) { return push(esc(t), 'hd'); },
      rule: function () { return push('<span style="opacity:.35">' + '-'.repeat(46) + '</span>'); },
      json: function (v) { return push(esc(JSON.stringify(v, null, 2))); },
      clear: function () { node.innerHTML = ''; }
    };
  };

  // ------------------------------------------------------------------
  // demo wiring: buttons with data-act inside .demo-head
  // ------------------------------------------------------------------
  DSH.demo = function (id, spec) {
    var root = document.getElementById(id);
    if (!root) { console.warn('DSH.demo: missing #' + id); return; }
    var outNode = root.querySelector('.out');
    var o = outNode ? DSH.out(outNode) : null;
    var api = { root: root, out: o, $: function (sel) { return root.querySelector(sel); },
                $$: function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); } };

    root.querySelectorAll('[data-act]').forEach(function (btn) {
      var act = btn.dataset.act;
      btn.addEventListener('click', function () {
        var fn = spec[act];
        if (!fn) return;
        if (act === 'run' && o) o.clear();
        var r;
        try { r = fn(o, api); }
        catch (err) { if (o) o.bad('运行时错误: ' + (err && err.message ? err.message : err)); else throw err; }
        if (r && typeof r.then === 'function') {
          btn.disabled = true;
          r.catch(function (err) { if (o) o.bad('运行时错误: ' + (err.message || err)); })
           .then(function () { btn.disabled = false; });
        }
      });
    });
    if (spec.init) spec.init(o, api);
    return api;
  };

  // ------------------------------------------------------------------
  // live source rendering: the code shown on the page IS the code that runs
  // ------------------------------------------------------------------

  /**
   * Dedents a function's own source so it can be printed as a standalone
   * listing. Guarantees listing and behaviour cannot drift apart.
   * @param {Function} fn function whose source to render
   * @returns {string} dedented source text
   */
  DSH.source = function (fn) {
    var src = fn.toString().replace(/\r/g, '');
    var lines = src.split('\n');
    var indents = lines.slice(1).filter(function (l) { return l.trim(); })
      .map(function (l) { return l.match(/^ */)[0].length; });
    var pad = indents.length ? Math.min.apply(null, indents) : 0;
    return lines.map(function (l, i) { return i === 0 ? l : l.slice(pad); }).join('\n');
  };

  /**
   * Renders one or more functions into a `<pre><code>` target as a listing.
   * @param {string} targetId id of the code element to fill
   * @param {Function|Function[]} fns function(s) to print in order
   */
  DSH.showSource = function (targetId, fns) {
    var node = document.getElementById(targetId);
    if (!node) { console.warn('DSH.showSource: missing #' + targetId); return; }
    var text = (Array.isArray(fns) ? fns : [fns]).map(DSH.source).join('\n\n');
    node.dataset.hl = '1';
    node.innerHTML = DSH.hl(text, node.dataset.lang || 'js');
  };

  // ------------------------------------------------------------------
  // predict-then-run: make the reader commit to an answer before the demo
  // reveals it. Wrong guesses are where the mechanism actually gets learned.
  // ------------------------------------------------------------------

  /**
   * Renders a multiple-choice prediction into a container.
   * @param {string} id container element id
   * @param {{q: string, options: Array<{label: string, ok?: boolean, why?: string}>, explain?: string}} spec question spec
   */
  DSH.predict = function (id, spec) {
    var box = document.getElementById(id);
    if (!box) { console.warn('DSH.predict: missing #' + id); return; }
    box.className = 'predict';
    box.innerHTML = '';
    var q = el('div', { class: 'q', html: '<span class="lbl">先猜再跑</span>' + esc(spec.q) });
    box.appendChild(q);
    var opts = el('div', { class: 'opts' });
    var verdict = el('div', { class: 'verdict' });
    spec.options.forEach(function (o) {
      var b = el('button', { class: 'opt', type: 'button', text: o.label });
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(opts.children, function (c, i) {
          c.disabled = true;
          if (spec.options[i].ok) c.classList.add('right');
        });
        if (!o.ok) b.classList.add('wrong');
        var lead = o.ok ? '猜对了。' : '不是这个。';
        verdict.innerHTML = '<strong>' + lead + '</strong> ' +
          esc(o.why || '') + (o.why && spec.explain ? ' ' : '') + esc(spec.explain || '');
      });
      opts.appendChild(b);
    });
    box.appendChild(opts);
    box.appendChild(verdict);
  };

  // ------------------------------------------------------------------
  // deterministic mock model: a scripted sequence of assistant turns
  // ------------------------------------------------------------------
  DSH.mockLLM = function (script) {
    var i = 0;
    return {
      reset: function () { i = 0; },
      get index() { return i; },
      /** Returns the next scripted assistant message, or a terminal fallback. */
      next: function (ctx) {
        var step = script[i++];
        if (typeof step === 'function') step = step(ctx);
        return step || { text: '(脚本已结束)', toolCalls: [] };
      },
      done: function () { return i >= script.length; }
    };
  };

  /** Sleep helper so demos can animate without blocking the page. */
  DSH.wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ------------------------------------------------------------------
  // page chrome
  // ------------------------------------------------------------------
  function currentId() {
    var f = location.pathname.split('/').pop() || 'index.html';
    return f.replace(/\.html$/, '');
  }

  function buildTopbar(cur) {
    var bar = el('div', { id: 'dsh-topbar' });
    var home = cur === 'index' ? '#' : 'index.html';
    bar.appendChild(el('a', { class: 'brand', href: home,
      html: 'DeepSeek Harness <span>from Scratch</span>' }));
    bar.appendChild(el('div', { class: 'spacer' }));
    if (cur !== 'index') {
      var idx = NAV.findIndex(function (c) { return c.id === cur; });
      if (idx >= 0) bar.appendChild(el('span', { class: 'pill acc',
        text: idx < CHAPTERS.length
          ? '第 ' + NAV[idx].n + ' 章 / 共 ' + CHAPTERS.length
          : NAV[idx].n }));
    }
    var t = el('button', { class: 'tb-btn', id: 'dsh-theme', text: '暗色' });
    t.addEventListener('click', function () {
      var d = document.documentElement.getAttribute('data-theme') === 'dark';
      setTheme(d ? 'light' : 'dark');
    });
    bar.appendChild(t);
    bar.appendChild(el('a', { class: 'tb-btn', href: 'index.html', text: '目录' }));
    document.body.insertBefore(bar, document.body.firstChild);
    document.body.insertBefore(el('div', { id: 'dsh-progress' }), document.body.firstChild);
  }

  function setTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('dsh-theme', mode); } catch (e) { /* private mode: theme is per-page only */ }
    var b = document.getElementById('dsh-theme');
    if (b) b.textContent = mode === 'dark' ? '亮色' : '暗色';
  }

  function buildTOC(main) {
    var box = document.getElementById('dsh-toc');
    if (!box) return;
    var heads = main.querySelectorAll('h2, h3');
    if (!heads.length) { box.style.display = 'none'; return; }
    box.appendChild(el('h4', { text: '本章目录' }));
    var links = [];
    heads.forEach(function (h) {
      if (!h.id) h.id = slug(h.textContent);
      var label = h.textContent.replace(/^\s*[\d.]+\s*/, '');
      var a = el('a', { href: '#' + h.id, text: label,
        class: h.tagName === 'H3' ? 'lvl3' : '' });
      box.appendChild(a);
      links.push({ a: a, h: h });
    });
    function sync() {
      var best = null, top = 90;
      links.forEach(function (l) {
        var r = l.h.getBoundingClientRect();
        if (r.top <= top) best = l;
      });
      links.forEach(function (l) { l.a.classList.toggle('active', l === best); });
    }
    window.addEventListener('scroll', sync, { passive: true });
    sync();
  }

  function buildChapNav(main, cur) {
    var idx = NAV.findIndex(function (c) { return c.id === cur; });
    if (idx < 0) return;
    var nav = el('nav', { class: 'chapnav' });
    var prev = idx > 0 ? NAV[idx - 1] : null;
    var next = idx < NAV.length - 1 ? NAV[idx + 1] : null;
    function dir(entry, isNext) {
      var chapter = CHAPTERS.indexOf(entry) >= 0;
      if (chapter) return (isNext ? '下一章 · ' : '上一章 · ') + entry.n;
      return isNext ? '附录' : '返回附录';
    }
    if (prev) nav.appendChild(el('a', { href: prev.id + '.html', html:
      '<span class="dir">' + dir(prev, false) + '</span><span class="t">' + esc(prev.title) + '</span>' }));
    else nav.appendChild(el('a', { href: 'index.html', html:
      '<span class="dir">返回</span><span class="t">目录与导言</span>' }));
    if (next) nav.appendChild(el('a', { class: 'next', href: next.id + '.html', html:
      '<span class="dir">' + dir(next, true) + '</span><span class="t">' + esc(next.title) + '</span>' }));
    else nav.appendChild(el('a', { class: 'next', href: 'index.html', html:
      '<span class="dir">全书完</span><span class="t">回到目录</span>' }));
    main.appendChild(nav);
  }

  function progress() {
    var bar = document.getElementById('dsh-progress');
    if (!bar) return;
    function sync() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    }
    window.addEventListener('scroll', sync, { passive: true });
    sync();
  }

  DSH.mount = function () {
    var cur = currentId();
    var saved = null;
    try { saved = localStorage.getItem('dsh-theme'); } catch (e) { /* storage blocked: fall back to light */ }
    setTheme(saved === 'dark' ? 'dark' : 'light');
    buildTopbar(cur);
    setTheme(saved === 'dark' ? 'dark' : 'light');
    var main = document.querySelector('main');
    if (main) { buildTOC(main); buildChapNav(main, cur); }
    highlightAll(document);
    progress();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { DSH.mount(); });
  } else { DSH.mount(); }
})();
