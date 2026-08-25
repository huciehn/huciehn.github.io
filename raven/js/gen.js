/* =========================================================
 * gen.js — 同范式原创题生成器（内置备用模式 / 平行卷）
 *
 * 说明：瑞文原版 60 题为版权材料，本项目不内置原题图片。
 * 本生成器产出结构同型（A 组系列补全、B 组 2×2 类比、
 * C/D/E 组 3×3 矩阵；难度递增；6–8 选项）的原创矩阵推理题，
 * 作为 assets/ 缺失时的备用测试与重测平行卷。
 * 固定种子保证同一套题稳定可复现。
 * 依赖 config.js。Node 下可 require 做唯一性校验。
 * ========================================================= */

var RavenGen = (function () {

  /* ---------- 随机数（mulberry32，可复现） ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- 图元 ---------- */
  var SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star', 'cross'];
  var FILLS = ['none', '#9aa0a6', '#2b2f36'];   // 无填充 / 半填充灰 / 实心黑
  var SIZES = [0.17, 0.25, 0.34];               // 相对半边长比例

  function polyPoints(n, cx, cy, r, rotDeg) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = Math.PI * 2 * i / n - Math.PI / 2 + (rotDeg || 0) * Math.PI / 180;
      pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }

  /* 单个形状（中心 cx,cy；s 为格子边长） */
  function shapeEl(type, cx, cy, s, sizeIdx, fillIdx, rotDeg) {
    var r = SIZES[sizeIdx] * s;
    var fill = FILLS[fillIdx];
    var common = 'fill="' + fill + '" stroke="#2b2f36" stroke-width="' + Math.max(1.4, s * 0.02) + '"';
    switch (type) {
      case 'circle':  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(1) + '" ' + common + '/>';
      case 'square':  return '<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" transform="rotate(' + (rotDeg || 0) + ' ' + cx + ' ' + cy + ')" ' + common + '/>';
      case 'triangle':return '<polygon points="' + polyPoints(3, cx, cy, r * 1.15, rotDeg) + '" ' + common + '/>';
      case 'diamond': return '<polygon points="' + polyPoints(4, cx, cy, r * 1.15, (rotDeg || 0) + 45) + '" ' + common + '/>';
      case 'hexagon': return '<polygon points="' + polyPoints(6, cx, cy, r, rotDeg) + '" ' + common + '/>';
      case 'star':    return '<polygon points="' + starPoints(cx, cy, r * 1.25, r * 0.55, 5, rotDeg) + '" ' + common + '/>';
      case 'cross': {
        var w = r * 0.42, L = r * 1.05, g = 'transform="rotate(' + (rotDeg || 0) + ' ' + cx + ' ' + cy + ')"';
        return '<g ' + g + '><rect x="' + (cx - w) + '" y="' + (cy - L) + '" width="' + 2 * w + '" height="' + 2 * L + '" ' + common + '/>' +
               '<rect x="' + (cx - L) + '" y="' + (cy - w) + '" width="' + 2 * L + '" height="' + 2 * w + '" ' + common + '/></g>';
      }
    }
    return '';
  }

  function starPoints(cx, cy, R, r, n, rotDeg) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var rad = (i % 2 === 0) ? R : r;
      var a = Math.PI * i / n - Math.PI / 2 + (rotDeg || 0) * Math.PI / 180;
      pts.push((cx + rad * Math.cos(a)).toFixed(1) + ',' + (cy + rad * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }

  /* 数量布局（归一化坐标） */
  var DOT_LAYOUTS = {
    1: [[.5, .5]],
    2: [[.33, .5], [.67, .5]],
    3: [[.3, .68], [.7, .68], [.5, .32]],
    4: [[.31, .31], [.69, .31], [.31, .69], [.69, .69]],
    5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
    6: [[.27, .3], [.5, .3], [.73, .3], [.27, .7], [.5, .7], [.73, .7]]
  };
  var QUAD = [[.29, .29], [.71, .29], [.29, .71], [.71, .71]];       // 异或位
  var SLOTS8 = [[.16, .16], [.5, .16], [.84, .16], [.84, .5],
                [.84, .84], [.5, .84], [.16, .84], [.16, .5]];        // 移动位

  /* ---------- 格子规格与渲染 ----------
   * spec 字段：kind('one'|'dots'|'bits'|'slot')、shape、fill、size、rot、count、mask、slot
   */
  function normSpec(sp) {
    var o = {};
    var keys = Object.keys(sp).sort();
    for (var i = 0; i < keys.length; i++) o[keys[i]] = sp[keys[i]];
    return o;
  }
  function ser(sp) { return JSON.stringify(normSpec(sp)); }

  function renderCell(sp, ox, oy, s) {
    var inner = '';
    var k = sp.kind || 'one';
    if (k === 'one') {
      inner += shapeEl(SHAPES[sp.shape % SHAPES.length], ox + s / 2, oy + s / 2, s,
                       sp.size % 3, sp.fill % 3, sp.rot || 0);
    } else if (k === 'dots') {
      var lay = DOT_LAYOUTS[Math.max(1, Math.min(6, sp.count))];
      var dr = s * 0.085, dcx = ox + s / 2, dcy = oy + s / 2;
      for (var i = 0; i < lay.length; i++) {
        inner += '<circle cx="' + (ox + lay[i][0] * s).toFixed(1) + '" cy="' + (oy + lay[i][1] * s).toFixed(1) +
                 '" r="' + dr.toFixed(1) + '" fill="' + FILLS[sp.fill % 3] + '" stroke="#2b2f36" stroke-width="' + Math.max(1.2, s * 0.018) + '"/>';
      }
    } else if (k === 'bits') {
      for (var b = 0; b < 4; b++) {
        if (sp.mask & (1 << b)) {
          inner += '<circle cx="' + (ox + QUAD[b][0] * s).toFixed(1) + '" cy="' + (oy + QUAD[b][1] * s).toFixed(1) +
                   '" r="' + (s * 0.11).toFixed(1) + '" fill="' + FILLS[sp.fill % 3] + '" stroke="#2b2f36" stroke-width="' + Math.max(1.2, s * 0.018) + '"/>';
        }
      }
      // 底部浅框提示象限结构
      inner += '<rect x="' + (ox + s * 0.12) + '" y="' + (oy + s * 0.12) + '" width="' + s * 0.76 + '" height="' + s * 0.76 +
               '" fill="none" stroke="#c8ccd2" stroke-width="' + Math.max(1, s * 0.012) + '"/>';
    } else if (k === 'slot') {
      inner += '<rect x="' + (ox + s * 0.12) + '" y="' + (oy + s * 0.12) + '" width="' + s * 0.76 + '" height="' + s * 0.76 +
               '" fill="none" stroke="#c8ccd2" stroke-width="' + Math.max(1, s * 0.012) + '"/>';
      var p = SLOTS8[sp.slot % 8];
      inner += '<circle cx="' + (ox + p[0] * s).toFixed(1) + '" cy="' + (oy + p[1] * s).toFixed(1) +
               '" r="' + (s * 0.13).toFixed(1) + '" fill="' + FILLS[sp.fill % 3] + '" stroke="#2b2f36" stroke-width="' + Math.max(1.2, s * 0.018) + '"/>';
    }
    return '<g>' + inner + '</g>';
  }

  function svgWrap(w, h, body) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
           '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#ffffff"/>' + body + '</svg>';
  }

  /* 干扰项：对正确规格扰动单一字段。
   * 唯一性判定用 keyFn（默认渲染层 SVG 字符串），
   * 避免规格不同但视觉相同（如圆形的旋转）造成的重复选项。 */
  function perturb(correct, nNeed, rng, keyFn) {
    keyFn = keyFn || renderOption;
    var seen = {}; seen[keyFn(correct)] = true;
    var out = [];
    var fields = [];
    if (correct.kind === 'one') fields = ['shape', 'fill', 'size', 'rot'];
    if (correct.kind === 'dots') fields = ['count', 'fill'];
    if (correct.kind === 'bits') fields = ['mask', 'fill'];
    if (correct.kind === 'slot') fields = ['slot', 'fill'];
    var guard = 0;
    while (out.length < nNeed && guard++ < 600) {
      var sp = normSpec(JSON.parse(ser(correct)));
      var f = fields[Math.floor(rng() * fields.length)];
      if (f === 'shape')     sp.shape = (sp.shape + 1 + Math.floor(rng() * (SHAPES.length - 1))) % SHAPES.length;
      if (f === 'fill')      sp.fill = (sp.fill + 1 + Math.floor(rng() * 2)) % 3;
      if (f === 'size' && correct.size !== undefined) sp.size = (sp.size + 1 + Math.floor(rng() * 2)) % 3;
      if (f === 'rot')       sp.rot = ((sp.rot || 0) + 20 + Math.floor(rng() * 5) * 15) % 360;
      if (f === 'count')     sp.count = 1 + Math.floor(rng() * 6);
      if (f === 'mask')      sp.mask = 1 + Math.floor(rng() * 15);
      if (f === 'slot')      sp.slot = Math.floor(rng() * 8);
      var key = keyFn(sp);
      if (!seen[key]) { seen[key] = true; out.push(sp); }
    }
    return out;
  }

  /* ---------- 规则模板 ---------- */
  function one(shape, fill, size, rot) { return { kind: 'one', shape: shape, fill: fill, size: size, rot: rot }; }

  /* A 组：一行 5 帧，第 5 帧缺 */
  function seriesRulesA(rng) {
    return [
      { name: '数量递增', gen: function (i) { return { kind: 'dots', count: 1 + i, fill: 2 }; } },
      { name: '大小递增', gen: function (i) { return one(0, 0, Math.min(2, i), 0); } },
      { name: '旋转步进', gen: function (i) { return one(1, 0, 1, 30 * i); } },
      { name: '形状循环', gen: function (i) { return one([0, 1, 2][i % 3], 0, 1, 0); } },
      { name: '填充渐深', gen: function (i) { return one(1, i % 3, 1, 0); } },
      { name: '顺时针移动', gen: function (i) { return { kind: 'slot', slot: i % 8, fill: 2 }; } },
      { name: '数量递减', gen: function (i) { return { kind: 'dots', count: 6 - i, fill: 0 }; } },
      { name: '逆时针移动', gen: function (i) { return { kind: 'slot', slot: (8 - i % 8) % 8, fill: 2 }; } },
      { name: '大小递减', gen: function (i) { return one(3, 2, Math.max(0, 2 - i), 0); } },
      { name: '旋转步进', gen: function (i) { return one(2, 0, 1, -40 * i); } },
      { name: '双规则：数量+填充', gen: function (i) { return { kind: 'dots', count: 2 + i, fill: i % 3 }; } },
      { name: '双规则：旋转+大小', gen: function (i) { return one(1, 0, i % 3, 45 * i); } }
    ];
  }

  /* B 组：2×2 类比，下行 = 上行经变换 T */
  var BT = [
    { name: '旋转90°', fn: function (s) { s.rot = (s.rot || 0) + 90; return s; } },
    { name: '填充变化', fn: function (s) { s.fill = (s.fill + 1) % 3; return s; } },
    { name: '放大一级', fn: function (s) { s.size = Math.min(2, s.size + 1); return s; } },
    { name: '缩小一级', fn: function (s) { s.size = Math.max(0, s.size - 1); return s; } },
    { name: '换成下一形状', fn: function (s) { s.shape = (s.shape + 1) % 5; return s; } },
    { name: '旋转45°', fn: function (s) { s.rot = (s.rot || 0) + 45; return s; } },
    { name: '实心化', fn: function (s) { s.fill = 2; return s; } },
    { name: '换为菱形并加深', fn: function (s) { s.shape = 3; s.fill = Math.min(2, s.fill + 1); return s; } },
    { name: '旋转135°', fn: function (s) { s.rot = (s.rot || 0) + 135; return s; } },
    { name: '换为星形', fn: function (s) { s.shape = 5; s.fill = 2; return s; } },
    { name: '换为十字', fn: function (s) { s.shape = 6; s.rot = (s.rot || 0); return s; } },
    { name: '旋转180°', fn: function (s) { s.rot = (s.rot || 0) + 180; return s; } }
  ];

  /* C/D/E 组：3×3 网格规则 */
  function gridRules(kind, rng) {
    var R = [];
    var lat = function (r, c, sh) { return (c + r * sh) % 3; };
    if (kind === 'C') {
      R.push(
        { name: '行列累加数量', gen: function (r, c) { return { kind: 'dots', count: 1 + r + c, fill: 2 }; } },
        { name: '行列尺寸累加', gen: function (r, c) { return one(0, 0, Math.min(2, r + c), 0); } },
        { name: '对角旋转', gen: function (r, c) { return one(1, 0, 1, 30 * (r + c)); } },
        { name: '填充拉丁方', gen: function (r, c) { return one(0, (c + r) % 3, 1, 0); } },
        { name: '行定形状·列定填充', gen: function (r, c) { return one(r % 5, c % 3, 1, 0); } },
        { name: '象限异或', gen: function (r, c) { var a = [5, 3, 12][r], b = [3, 12, 5][r]; var m = c === 0 ? a : (c === 1 ? b : a ^ b); return { kind: 'bits', mask: m, fill: 2 }; } },
        { name: '沿阅读序移动', gen: function (r, c) { return { kind: 'slot', slot: (r * 3 + c) * 1, fill: 2 }; } },
        { name: '反向旋转', gen: function (r, c) { return one(2, 0, 1, -30 * (r + c)); } },
        { name: '按列递减数量', gen: function (r, c) { return { kind: 'dots', count: Math.max(1, 3 - c + r), fill: 0 }; } },
        { name: '列定尺寸·行定填充', gen: function (r, c) { return one(1, r % 3, c, 0); } },
        { name: '形状拉丁方', gen: function (r, c) { return one((c + r) % 3, 0, 1, 0); } },
        { name: '对角旋转45°', gen: function (r, c) { return one(4, 0, 1, 45 * (r + c)); } }
      );
    }
    if (kind === 'D') {
      R.push(
        { name: '形状拉丁排列', gen: function (r, c) { return one((c + r) % 3, 0, 1, 0); } },
        { name: '填充拉丁排列', gen: function (r, c) { return one(1, (c + 2 * r) % 3, 1, 0); } },
        { name: '形状拉丁+行定尺寸', gen: function (r, c) { return one((c + r) % 3, 0, r % 3, 0); } },
        { name: '位置拉丁排列', gen: function (r, c) { return { kind: 'slot', slot: (3 + c + r * 2) % 8, fill: 2 }; } },
        { name: '象限逐行异或', gen: function (r, c) { var a = [9, 6, 15][r], b = [6, 9, 5][r]; var m = c === 0 ? a : (c === 1 ? b : a ^ b); return { kind: 'bits', mask: m, fill: 0 }; } },
        { name: '数量拉丁排列', gen: function (r, c) { return { kind: 'dots', count: [1, 2, 3][(c + r) % 3], fill: 2 }; } },
        { name: '角度拉丁排列', gen: function (r, c) { return one(1, 0, 1, [0, 90, 180][(c + r) % 3]); } },
        { name: '双重拉丁：形状+填充', gen: function (r, c) { return one((c + r) % 3, (c + 2 * r) % 3, 1, 0); } },
        { name: '求并集', gen: function (r, c) { var P = [[5, 10], [3, 12], [6, 9]][r]; var m = c === 0 ? P[0] : (c === 1 ? P[1] : P[0] | P[1]); return { kind: 'bits', mask: m, fill: 2 }; } },
        { name: '求差集', gen: function (r, c) { var P = [[15, 6], [13, 9], [7, 3]][r]; var m = c === 0 ? P[0] : (c === 1 ? P[1] : P[0] & ~P[1] & 15); return { kind: 'bits', mask: m, fill: 0 }; } },
        { name: '斜向移动', gen: function (r, c) { return { kind: 'slot', slot: (c * 3 + r * 3) % 8, fill: 2 }; } },
        { name: '三重拉丁：形状+填充+尺寸', gen: function (r, c) { return one((c + r) % 3, (2 * c + r) % 3, (c + 2 * r) % 3, 0); } }
      );
    }
    if (kind === 'E') {
      R.push(
        { name: '数量×旋转复合', gen: function (r, c) { return one(1, (c + r) % 3, 1, 45 * (r + c)); } },
        { name: '异或+填充随行变', gen: function (r, c) { var a = [10, 5, 15][r], b = [5, 10, 6][r]; var m = c === 0 ? a : (c === 1 ? b : a ^ b); return { kind: 'bits', mask: m, fill: r % 3 }; } },
        { name: '三特征并行', gen: function (r, c) { return one((c + 2 * r) % 5, (c + r) % 3, (2 * c + r) % 3, 0); } },
        { name: '移动步长为2', gen: function (r, c) { return { kind: 'slot', slot: (r * 3 + c) * 2 % 8, fill: 2 }; } },
        { name: '条件规则：圆形才加深', gen: function (r, c) { var sh = (c + r) % 3; var fl = sh === 0 ? 2 : (c + r) % 2; return one(sh === 0 ? 0 : sh + 3, fl, 1, 0); } },
        { name: '数量矩阵+反向填充', gen: function (r, c) { return { kind: 'dots', count: Math.max(1, Math.min(6, 2 + c + (2 - r))), fill: (2 - r + 3) % 3 }; } },
        { name: '旋转叠加镜像步进', gen: function (r, c) { return one(3, 0, 1, 45 * (r + c) + 15 * r); } },
        { name: '异或链（含零剔除）', gen: function (r, c) { var a = [7, 11, 13][r], b = [11, 13, 7][r]; var m = c === 0 ? a : (c === 1 ? b : (a ^ b) || 15); return { kind: 'bits', mask: m, fill: 0 }; } },
        { name: '尺寸序列+位置序列', gen: function (r, c) { return { kind: 'slot', slot: (r + c * 2) % 8, fill: (c + r) % 3 }; } },
        { name: '形状循环×角度循环', gen: function (r, c) { return one([0, 1, 2][(c + r) % 3], 0, 1, 60 * (c + 2 * r)); } },
        { name: '四元组合', gen: function (r, c) { return one((2 * c + r) % 5, (c + 2 * r) % 3, (r + c) % 3, 0); } },
        { name: '嵌套推理：和恒为定值', gen: function (r, c) { return { kind: 'dots', count: 4 - ((c + r) % 4) + 1, fill: (c + r) % 3 }; } }
      );
    }
    return R;
  }

  /* ---------- 组装 ---------- */
  function makeOptions(correct, count, rng) {
    var pool = perturb(correct, count - 1, rng);
    if (pool.length < count - 1) throw new Error('干扰项不足：无法生成 ' + count + ' 个视觉互异的选项');
    var all = [correct].concat(pool);
    // 标记正确项后洗牌，再回找位置
    all[0]._correct = true;
    for (var i = all.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = all[i]; all[i] = all[j]; all[j] = t;
    }
    var ans = 0;
    for (var k = 0; k < all.length; k++) {
      if (all[k]._correct) { ans = k; delete all[k]._correct; }
    }
    return { options: all, answer: ans };
  }

  function renderStemSeries(specs) {
    var s = 120, gap = 14, W = 5 * s + 6 * gap, H = s + 2 * gap, body = '';
    for (var i = 0; i < 5; i++) {
      var x = gap + i * (s + gap);
      body += '<rect x="' + x + '" y="' + gap + '" width="' + s + '" height="' + s + '" fill="#fff" stroke="#8a8f98" stroke-width="2"/>';
      if (i < 4) body += renderCell(specs[i], x, gap, s);
      else body += '<text x="' + (x + s / 2) + '" y="' + (gap + s / 2 + 14) + '" text-anchor="middle" font-size="44" fill="#8a8f98" font-family="sans-serif">?</text>';
    }
    return svgWrap(W, H, body);
  }

  function renderStemGrid(specs, cols) {
    var rowsN = specs.length / cols, s = 130, gap = 12;
    var W = cols * s + (cols + 1) * gap, H = rowsN * s + (rowsN + 1) * gap, body = '';
    for (var i = 0; i < specs.length; i++) {
      var r = Math.floor(i / cols), c = i % cols;
      var x = gap + c * (s + gap), y = gap + r * (s + gap);
      body += '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" fill="#fff" stroke="#8a8f98" stroke-width="2"/>';
      if (specs[i]) body += renderCell(specs[i], x, y, s);
      else body += '<text x="' + (x + s / 2) + '" y="' + (y + s / 2 + 14) + '" text-anchor="middle" font-size="46" fill="#8a8f98" font-family="sans-serif">?</text>';
    }
    return svgWrap(W, H, body);
  }

  function renderOption(sp) {
    var s = 110;
    return svgWrap(s, s, renderCell(sp, 0, 0, s));
  }

  /* 生成整卷 60 题（seed 固定则题目完全一致） */
  function buildAll(seed) {
    var rng = mulberry32(seed || 20260824);
    var items = [];
    var sets = [
      { id: 'A', format: 'series', rules: seriesRulesA(rng), optCount: 6 },
      { id: 'B', format: 'analogy', rules: BT, optCount: 6 },
      { id: 'C', format: 'grid3', rules: gridRules('C', rng), optCount: 8 },
      { id: 'D', format: 'grid3', rules: gridRules('D', rng), optCount: 8 },
      { id: 'E', format: 'grid3', rules: gridRules('E', rng), optCount: 8 }
    ];
    sets.forEach(function (set) {
      for (var q = 0; q < 12; q++) {
        var rule = set.rules[q % set.rules.length];
        var specs, correct, stem, opts;
        if (set.format === 'series') {
          specs = [0, 1, 2, 3, 4].map(function (i) { return rule.gen(i); });
          correct = specs[4];
          stem = renderStemSeries(specs);
        } else if (set.format === 'analogy') {
          var bases = [one(1, 0, 0, 0), one(0, 1, 1, 0), one(2, 0, 1, 0), one(4, 0, 1, 30),
                       one(3, 1, 0, 0), one(0, 2, 1, 45), one(5, 0, 0, 0), one(1, 1, 2, 0),
                       one(6, 0, 1, 0), one(2, 2, 0, 0), one(0, 0, 1, 90), one(4, 1, 1, 0)];
          var tl = one.apply(null, [bases[q].shape, bases[q].fill, bases[q].size, bases[q].rot]);
          var tr = one((bases[q].shape + 2) % 5, (bases[q].fill + 2) % 3, bases[q].size, (bases[q].rot || 0) + 120);
          var bl = JSON.parse(JSON.stringify(tl)); bl = rule.fn(bl);
          correct = rule.fn(JSON.parse(JSON.stringify(tr)));
          specs = [tl, tr, bl, null];
          stem = renderStemGrid(specs, 2);
        } else {
          specs = [];
          for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) specs.push(rule.gen(r, c));
          correct = specs[8]; specs[8] = null;
          stem = renderStemGrid(specs, 3);
        }
        opts = makeOptions(correct, set.optCount, rng);
        items.push({
          id: set.id + (q + 1), setId: set.id, idx: q + 1,
          optionsCount: set.optCount, answer: opts.answer,
          stemSVG: stem, options: opts.options.map(renderOption),
          ruleName: rule.name
        });
      }
    });
    return items;
  }

  /* 示例题（指导语页交互演示） */
  function demo() {
    var specs = [{ kind: 'dots', count: 1, fill: 2 }, { kind: 'dots', count: 2, fill: 2 }, { kind: 'dots', count: 3, fill: 2 }];
    var correct = { kind: 'dots', count: 4, fill: 2 };
    var wrong = [{ kind: 'dots', count: 2, fill: 2 }, { kind: 'dots', count: 5, fill: 0 }, { kind: 'dots', count: 4, fill: 0 }];
    var all = [wrong[0], correct, wrong[1], wrong[2]];
    return {
      stemSVG: renderStemGrid([{ kind: 'dots', count: 1, fill: 2 }, { kind: 'dots', count: 2, fill: 2 }, { kind: 'dots', count: 3, fill: 2 }, null], 2),
      options: all.map(renderOption),
      answer: 1
    };
  }

  return { buildAll: buildAll, demo: demo, _ser: ser };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RavenGen;
}
