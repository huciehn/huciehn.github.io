/* =========================================================
 * app.js — 测试流程与报告
 * 依赖：config.js / norms.js / gen.js
 * ========================================================= */

(function () {
  var cfg = RAVEN_CONFIG;

  /* ---------- 全局状态 ---------- */
  var S = {
    mode: 'image',            // image | gen
    ageKey: '20',
    items: [],                // 统一题目列表
    answers: [],              // 1 起的选项号，未答为 null
    cur: 0,
    t0: 0,
    timerId: null,
    assetMap: {},             // id -> url（图像模式）
    assetCount: 0,
    seed: 20260824,
    finished: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var IDS = [];               // A1..E12 顺序
  cfg.SET_ORDER.forEach(function (st) {
    for (var i = 1; i <= 12; i++) IDS.push(st + i);
  });

  /* ---------- 题图探测 ---------- */
  var EXTS = ['svg', 'jpg', 'jpeg', 'png', 'webp'];
  function probeUrl(url, timeout) {
    return new Promise(function (res) {
      var done = false;
      var im = new Image();
      im.onload = function () { if (!done) { done = true; res(true); } };
      im.onerror = function () { if (!done) { done = true; res(false); } };
      setTimeout(function () { if (!done) { done = true; res(false); } }, timeout || 1500);
      im.src = url;
    });
  }
  async function probeAssets(onProgress) {
    var map = {}, found = 0;
    for (var i = 0; i < IDS.length; i++) {
      var id = IDS[i], url = null;
      for (var e = 0; e < EXTS.length && !url; e++) {
        var cand = '/raven/assets/' + id + '.' + EXTS[e];
        if (await probeUrl(cand)) url = cand;
      }
      if (url) { map[id] = url; found++; }
      if (onProgress && (i % 10 === 9 || i === IDS.length - 1)) onProgress(i + 1);
    }
    return { map: map, found: found };
  }

  /* ---------- 工具 ---------- */
  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- 屏幕切换 ---------- */
  function show(name) {
    ['welcome', 'test', 'result'].forEach(function (n) {
      $('screen-' + n).style.display = (n === name) ? '' : 'none';
    });
    window.scrollTo(0, 0);
  }

  /* ---------- 欢迎页 ---------- */
  async function initWelcome() {
    renderAgeSelect();
    renderHistory();
    var status = $('asset-status');
    status.textContent = '正在探测 assets/ 目录中的题图……';
    var r = await probeAssets(function (n) {
      status.textContent = '正在探测题图……' + n + '/60';
    });
    S.assetMap = r.map; S.assetCount = r.found;
    updateModeUI();
  }

  function updateModeUI() {
    var status = $('asset-status');
    if (S.assetCount >= 55) {
      status.innerHTML = '<span class="ok">已检测到 ' + S.assetCount + '/60 张题图，可使用图像模式。</span>';
    } else if (S.assetCount > 0) {
      status.innerHTML = '<span class="warn">仅检测到 ' + S.assetCount + '/60 张题图。请按 README 补齐命名（A1.jpg … E12.jpg），或改用内置平行卷模式。</span>';
    } else {
      status.innerHTML = '<span class="warn">assets/ 未检测到题图。将 60 张题图按 A1.jpg…E12.jpg 放入 assets/ 后重启本页即可使用图像模式；当前可用内置平行卷。</span>';
    }
    var imgOk = S.assetCount >= 55;
    document.querySelectorAll('input[name=mode]').forEach(function (el) {
      el.disabled = (el.value === 'image') && !imgOk;
    });
    var checked = document.querySelector('input[name=mode]:checked');
    /* 未开始测验时按可用性保持勾选一致：探测完成前默认平行卷，完成后自动恢复图像卷；已开始则不改用户选择 */
    if (S.items.length === 0 && (!checked || checked.disabled || checked.value !== (imgOk ? 'image' : 'gen'))) {
      document.querySelector('input[name=mode][value=' + (imgOk ? 'image' : 'gen') + ']').checked = true;
    }
  }

  function renderAgeSelect() {
    var sel = $('age-select');
    sel.innerHTML = '';
    cfg.AGE_OPTIONS.forEach(function (op) {
      var o = document.createElement('option');
      o.value = op[0]; o.textContent = op[1];
      if (op[0] === S.ageKey) o.selected = true;
      sel.appendChild(o);
    });
  }

  /* ---------- 历史记录 ---------- */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem('raven_history_v1') || '[]'); }
    catch (e) { return []; }
  }
  function saveHistory(list) {
    // 存储不可用（隐私模式/WebView）时静默跳过：只影响历史记录，不能中断交卷出报告
    try { localStorage.setItem('raven_history_v1', JSON.stringify(list.slice(-20))); } catch (e) {}
  }
  function renderHistory() {
    var box = $('history-box'), list = loadHistory();
    if (!list.length) { box.innerHTML = '<p class="muted">暂无历史记录。</p>'; return; }
    var html = '<table><thead><tr><th>时间</th><th>模式</th><th>年龄组</th><th>总分</th><th>百分等级</th><th>等级</th><th></th></tr></thead><tbody>';
    list.forEach(function (h, i) {
      html += '<tr><td>' + esc(h.time) + '</td><td>' + (h.mode === 'image' ? '图像卷' : '平行卷') +
              '</td><td>' + esc(h.ageLabel) + '</td><td>' + h.total + '/60</td><td>' + h.pr +
              '%</td><td>' + esc(h.level + '·' + h.label) + '</td><td><button class="link" data-del="' + i + '">删除</button></td></tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        var l = loadHistory(); l.splice(parseInt(b.dataset.del, 10), 1); saveHistory(l); renderHistory();
      };
    });
  }

  /* ---------- 开始测验 ---------- */
  function startTest() {
    S.mode = document.querySelector('input[name=mode]:checked').value;
    S.ageKey = $('age-select').value;
    S.seed = $('seed-random').checked ? (Date.now() % 1000000007) : 20260824;
    buildItems();
    S.answers = S.items.map(function () { return null; });
    S.cur = 0; S.finished = false;
    S.t0 = Date.now();
    clearInterval(S.timerId);
    S.timerId = setInterval(function () {
      $('timer').textContent = fmtTime(Math.floor((Date.now() - S.t0) / 1000));
    }, 500);
    $('timer').textContent = '00:00';
    show('test');
    renderItem();
  }

  function buildItems() {
    S.items = [];
    if (S.mode === 'image') {
      IDS.forEach(function (id) {
        var st = id.charAt(0), no = parseInt(id.slice(1), 10);
        S.items.push({
          id: id, setId: st, idx: no, optCount: cfg.OPTION_COUNTS[st],
          answer: cfg.ANSWERS[st][no - 1],
          stemHTML: '<img class="item-img" draggable="false" src="' + S.assetMap[id] + '" alt="' + id + '">',
          optionsHTML: null
        });
      });
    } else {
      var gen = RavenGen.buildAll(S.seed);
      gen.forEach(function (g) {
        S.items.push({
          id: g.id, setId: g.setId, idx: g.idx, optCount: g.optionsCount,
          answer: g.answer + 1,
          stemHTML: '<div class="stem">' + g.stemSVG + '</div>',
          optionsHTML: g.options
        });
      });
    }
  }

  /* ---------- 答题页 ---------- */
  function renderItem() {
    var it = S.items[S.cur];
    $('pos-label').textContent = '第 ' + (S.cur + 1) + ' / 60 题 · ' + it.setId + ' 组 ' + it.idx;
    $('progress-bar').style.width = ((S.cur) / 60 * 100) + '%';
    $('stem-box').innerHTML = it.stemHTML;

    var ob = $('options-box');
    ob.innerHTML = '';
    ob.className = S.mode === 'image' ? 'options-nums' : 'options-cards';

    if (S.mode === 'image') {
      for (var n = 1; n <= it.optCount; n++) {
        var b = document.createElement('button');
        b.className = 'num-opt' + (S.answers[S.cur] === n ? ' selected' : '');
        b.textContent = n;
        b.onclick = (function (nn) { return function () { pick(nn); }; })(n);
        ob.appendChild(b);
      }
    } else {
      it.optionsHTML.forEach(function (svg, k) {
        var d = document.createElement('button');
        d.className = 'card-opt' + (S.answers[S.cur] === k + 1 ? ' selected' : '');
        d.innerHTML = '<span class="badge">' + (k + 1) + '</span>' + svg;
        d.onclick = (function (kk) { return function () { pick(kk + 1); }; })(k);
        ob.appendChild(d);
      });
    }

    $('btn-prev').disabled = S.cur === 0;
    $('btn-next').disabled = S.cur === 59;
    $('btn-submit').textContent = S.cur === 59 ? '交卷并查看报告' : '交卷';
  }

  function pick(n) {
    S.answers[S.cur] = n;
    renderItem();
    // 选择后自动前进（末题除外），贴近纸质施测节奏
    if (S.cur < 59) setTimeout(function () { if (!S.finished) { S.cur++; renderItem(); } }, 180);
  }

  function openSheet() {
    var grid = $('sheet-grid');
    grid.innerHTML = '';
    S.items.forEach(function (it, i) {
      var c = document.createElement('button');
      c.className = 'sheet-cell' + (S.answers[i] ? ' answered' : '') + (i === S.cur ? ' current' : '');
      c.textContent = it.id;
      c.title = it.setId + ' 组 第 ' + it.idx + ' 题';
      c.onclick = function () { S.cur = i; closeSheet(); renderItem(); };
      grid.appendChild(c);
    });
    var un = S.answers.filter(function (a) { return a == null; }).length;
    $('sheet-summary').textContent = un ? ('还有 ' + un + ' 题未作答') : '全部题目均已作答';
    $('sheet-overlay').classList.add('open');
  }
  function closeSheet() { $('sheet-overlay').classList.remove('open'); }

  /* ---------- 计分与报告 ---------- */
  function submit() {
    var un = [];
    S.answers.forEach(function (a, i) { if (a == null) un.push(S.items[i].id); });
    var msg = un.length ? '尚有 ' + un.length + ' 题未作答（' + un.slice(0, 8).join('、') + (un.length > 8 ? '……' : '') + '）。未答题按错误计分。\n确定交卷吗？' : '确定交卷并生成报告吗？';
    if (!confirm(msg)) return;
    finish();
  }

  function finish() {
    clearInterval(S.timerId);
    S.finished = true;
    var perSet = {}, total = 0;
    cfg.SET_ORDER.forEach(function (st) { perSet[st] = 0; });
    S.items.forEach(function (it, i) {
      if (S.answers[i] === it.answer) { total++; perSet[it.setId]++; }
    });
    var ev = RavenNorms.evaluate(total, S.ageKey);
    var secs = Math.floor((Date.now() - S.t0) / 1000);
    var ageLabel = (cfg.AGE_OPTIONS.find(function (o) { return o[0] === S.ageKey; }) || ['', S.ageKey])[1];

    renderReport(ev, perSet, secs, ageLabel);

    var hist = loadHistory();
    hist.push({
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
      mode: S.mode, ageLabel: ageLabel, total: total,
      pr: ev.prDisplay, level: ev.level, label: ev.label, iq: ev.iq, seconds: secs
    });
    saveHistory(hist);
    show('result');
    window.__lastResult = { ev: ev, perSet: perSet, total: total, seconds: secs, ageLabel: ageLabel, answers: S.answers.slice(), mode: S.mode, seed: S.seed };
  }

  function setSentence(cnt) {
    if (cnt >= 10) return '该维度相对突出，是当前推理表现中的优势成分。';
    if (cnt <= 4) return '该维度正确率偏低，相对同龄组常模属于薄弱环节，可作为训练切入点。';
    return '该维度表现平稳，处于常态范围。';
  }

  function renderReport(ev, perSet, secs, ageLabel) {
    $('report-core').innerHTML =
      card('总分', ev.total + ' / 60') +
      card('百分等级', 'PR ≈ ' + ev.prDisplay + '%') +
      card('智商估计', 'IQ ≈ ' + ev.iq + '（±' + ev.ci + '）') +
      card('智力等级', ev.level + ' · ' + ev.label) +
      card('用时', fmtTime(secs)) +
      card('常模参照组', ageLabel);

    var cmp = '本次测验原始总分为 ' + ev.total + ' 分（满分 60）。对照' + esc(ageLabel) +
      '的中国城市常模，该成绩约位于第 <b>' + ev.prDisplay + '</b> 百分等级，即在同龄人群中大约有 <b>' +
      ev.prDisplay + '%</b> 的人成绩低于此水平，<b>' + (100 - ev.prDisplay) + '%</b> 的人高于此水平。' +
      '依据五级分级标准，判定为<b>' + esc(ev.gradeText) + '（' + ev.level + '）</b>。' +
      '按离差智商正态等价换算（M=100，SD=15），智商估计值约为 <b>IQ ≈ ' + ev.iq + '</b>；考虑测量误差，' +
      '其 90% 置信区间约为 ' + (ev.iq - ev.ci) + ' 至 ' + (ev.iq + ev.ci) + ' 分。';

    var bars = '';
    cfg.SET_ORDER.forEach(function (st) {
      var cnt = perSet[st];
      var pctv = Math.round(cnt / 12 * 100);
      bars += '<div class="set-row"><span class="set-name">' + cfg.SET_INFO[st].name + '</span>' +
        '<span class="set-bar"><span class="set-fill' + (cnt >= 10 ? ' strong' : (cnt <= 4 ? ' weak' : '')) + '" style="width:' + pctv + '%"></span></span>' +
        '<span class="set-score">' + cnt + '/12</span></div>' +
        '<p class="set-note">' + esc(cfg.SET_INFO[st].desc) + '——' + setSentence(cnt) + '</p>';
    });

    $('report-detail').innerHTML =
      '<h3>与常模的比较结论</h3><p class="conclusion">' + cmp + '</p>' +
      '<h3>分测验剖析（A–E）</h3>' + bars +
      '<h3>结果解释的边界</h3>' +
      '<ul class="limits">' +
      '<li>本测验测的是推理类一般智力因素（G 因素），不等于全部智力，更不能代表未来成就。</li>' +
      '<li>结果受测试状态、环境干扰、练习效应影响，波动可达数分；6 个月内重测会因记忆效应失真。</li>' +
      '<li>图像模式的题图为流传版本，选项排列若与内置计分键不一致，请在 config.js 中核对修改后再使用。</li>' +
      '<li>本报告仅供个人参考与教育筛选，不构成临床诊断；涉及入学、选拔或诊断请使用正版施测工具并由专业人员解释。</li>' +
      '</ul>' +
      '<p class="source muted">' + esc(cfg.SOURCE_NOTE) + '</p>';
  }

  function card(label, val) {
    return '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value">' + val + '</div></div>';
  }

  function exportJSON() {
    var r = window.__lastResult;
    if (!r) return;
    var data = JSON.stringify({
      date: new Date().toISOString(), mode: r.mode, seed: r.seed,
      ageGroup: r.ageLabel, total: r.total, percentile: r.ev.prDisplay,
      iqEstimate: r.ev.iq, ci: r.ev.ci, level: r.ev.level,
      perSet: r.perSet, secondsUsed: r.seconds,
      answers: r.answers, answerKey: cfg.ANSWERS, sourceNote: cfg.SOURCE_NOTE
    }, null, 2);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'raven_result_' + Date.now() + '.json';
    a.click();
  }

  /* ---------- 示例题 ---------- */
  function renderDemo() {
    var d = RavenGen.demo();
    $('demo-stem').innerHTML = d.stemSVG;
    var box = $('demo-options');
    box.innerHTML = '';
    d.options.forEach(function (svg, k) {
      var b = document.createElement('button');
      b.className = 'card-opt demo-opt';
      b.innerHTML = '<span class="badge">' + (k + 1) + '</span>' + svg;
      b.onclick = function () {
        var right = k === d.answer;
        box.querySelectorAll('.demo-opt').forEach(function (x) { x.classList.add('locked'); });
        b.classList.add(right ? 'right' : 'wrong');
        $('demo-feedback').innerHTML = right
          ? '<span class="ok">正确！图形数量沿行列递增（1→2→3→4），故缺项为 4 个圆点。</span>'
          : '<span class="warn">不对哦——规律是数量递增（1→2→3→4），应选 4 个圆点的那张。再试一次：</span>';
        if (!right) { b.classList.remove('locked'); }
      };
      box.appendChild(b);
    });
    $('demo-feedback').textContent = '点击一张小图试试。';
  }

  /* ---------- 事件绑定与调试钩子 ---------- */
  /* 适配 Astro ClientRouter：页面可能经 SPA 转场到达，DOMContentLoaded 不会再次触发，
     故同时监听 astro:page-load；以根节点 data-init 保证同一份 DOM 只初始化一次。 */
  function initRavenPage() {
    var root = document.getElementById('raven-root');
    if (!root || root.dataset.init) return;
    root.dataset.init = '1';

    renderDemo();
    initWelcome();

    $('btn-start').onclick = startTest;
    $('btn-prev').onclick = function () { if (S.cur > 0) { S.cur--; renderItem(); } };
    $('btn-next').onclick = function () { if (S.cur < 59) { S.cur++; renderItem(); } };
    $('btn-sheet').onclick = openSheet;
    $('sheet-close').onclick = closeSheet;
    $('btn-submit').onclick = submit;
    $('btn-print').onclick = function () { window.print(); };
    $('btn-export').onclick = exportJSON;
    $('btn-home').onclick = function () { renderHistory(); show('welcome'); };

    document.querySelectorAll('input[name=mode]').forEach(function (el) {
      el.addEventListener('change', updateModeUI);
    });

    // 自动化验证钩子（仅 debug 参数时暴露）
    if (location.search.indexOf('debug=1') >= 0) {
      window.RavenDebug = {
        state: S,
        start: function (mode, ageKey, useRandomSeed) {
          S.mode = mode || 'gen'; S.ageKey = ageKey || '20';
          S.mode = (S.mode === 'image' && S.assetCount < 55) ? 'gen' : S.mode;
          S.seed = useRandomSeed ? 777 : 20260824;
          buildItems(); S.answers = S.items.map(function () { return null; });
          S.cur = 0; S.finished = false; S.t0 = Date.now() - 754000; // 固定演示用时 12:34
          return S.items.length;
        },
        answerAll: function (fn) {
          S.items.forEach(function (it, i) { S.answers[i] = fn(it, i); });
        },
        finishNow: function () { finish(); return window.__lastResult; },
        goto: function (i) { S.cur = i; renderItem(); }
      };
    }
  }
  document.addEventListener('DOMContentLoaded', initRavenPage);
  document.addEventListener('astro:page-load', initRavenPage);

})();
