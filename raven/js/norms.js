/* =========================================================
 * norms.js — 计分与常模换算（依手册编制）
 * 《瑞文标准推理测验中国城市修订版》手册：
 *  · 查表规则（手册第 13 页）：从被试年龄组纵列中找到「刚刚
 *    小于或等于」被试所得分数的分数，其行首百分等级即标准分。
 *    —— 阶梯式查表，不做插值。
 *  · 智力水平分级（手册表 4）：≥95 一级 / 75–95 二级 /
 *    25–75 三级 / 5–25 四级 / <5 五级。
 *  · 年龄组划界（手册第 12 页）：半岁组 X 岁 3 月 1 天 — 8 月
 *    30 天；整岁组 X 岁 = 前 1 年 9 月 1 天 — 当 X 年 2 月 30 天；
 *    17—19 / 20—29 / … / 60—69 各组以下限为标志；70 岁以上。
 * 依赖 config.js（先加载）
 * ========================================================= */

var RavenNorms = (function (cfg) {

  var PR_STEPS = [95, 90, 75, 50, 25, 10, 5];

  /* 原始分 → 百分等级（手册阶梯查表）。
   * 返回 { band, display }：band ∈ {95,90,75,50,25,10,5,0}，
   * band=0 表示低于常模表 5% 档；display 为报告用文字。 */
  function percentile(raw, ageKey) {
    var row = cfg.NORM_ROWS[ageKey] || cfg.NORM_ROWS['20'];
    raw = Math.max(0, Math.min(60, raw));
    for (var i = 0; i < PR_STEPS.length; i++) {
      if (raw >= row[i]) {
        var b = PR_STEPS[i];
        return { band: b, display: (b === 95 ? '≥95' : String(b)) };
      }
    }
    return { band: 0, display: '<5' };
  }

  /* 百分等级档 → 智力水平五级（手册表 4） */
  function gradeOf(band) {
    for (var i = 0; i < cfg.GRADES.length; i++) {
      if (band >= cfg.GRADES[i].min) return cfg.GRADES[i];
    }
    return cfg.GRADES[cfg.GRADES.length - 1];
  }

  /* 汇总：由总分与年龄组得到完整指标 */
  function evaluate(totalRaw, ageKey) {
    var pr = percentile(totalRaw, ageKey);
    var grade = gradeOf(pr.band);
    return {
      total: totalRaw,
      band: pr.band,
      prDisplay: pr.display,
      level: grade.level,
      label: grade.label,
      gradeText: grade.text
    };
  }

  /* ---------- 实足年龄 → 年龄组（手册第 12 页划界规则） ----------
   * birth 'YYYY-MM-DD'；test Date（缺省今天）。
   * 返回 { key, label, ageText, outOfRange }。
   * 边界备注：手册明文半岁组止于 X 岁 8 月 30 天、17—19 组始于
   * 17 岁 0 月 1 天，16 岁 9 月—16 岁 11 月 30 天在字面上无归属，
   * 本实现保守并入相邻的 16½ 岁组。 */
  function ageGroupFromBirth(birth, test) {
    var out = { key: null, label: '', ageText: '', outOfRange: true };
    if (!birth) return out;
    var p = birth.split('-');
    if (p.length !== 3) return out;
    var by = +p[0], bm = +p[1], bd = +p[2];
    if (!by || !bm || !bd) return out;
    var t = test || new Date();
    var ty = t.getFullYear(), tm = t.getMonth() + 1, td = t.getDate();

    /* 实足年龄（年、月；日仅用于生日未满情形，手册以月划界） */
    var months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
    if (months < 0) return out;
    var y = Math.floor(months / 12), m = months % 12;
    out.ageText = y + ' 岁 ' + m + ' 个月';

    if (y < 5 || (y === 5 && m < 3)) return out;            /* 低于手册适用下限 */

    function half(x)  { return (y === x && m >= 3 && m <= 8) ? String(x) + '.5' : null; }
    function whole(x) { return (((y === x - 1 && m >= 9)) || (y === x && m <= 2)) ? String(x) : null; }

    var key = null;
    if (y >= 70)      key = '70';
    else if (y >= 60) key = '60';
    else if (y >= 50) key = '50';
    else if (y >= 40) key = '40';
    else if (y >= 30) key = '30';
    else if (y >= 20) key = '20';
    else if (y >= 17) key = '17';
    else {
      var k = null, x;
      for (x = 6; x <= 16 && !k; x++) k = whole(x);
      for (x = 5; x <= 16 && !k; x++) k = half(x);
      /* 16 岁 9—11 月：手册字面空档，并入 16½ 岁组 */
      if (!k && y === 16 && m >= 9) k = '16.5';
      key = k;
    }
    if (!key) return out;
    out.key = key;
    out.outOfRange = false;
    for (var i = 0; i < cfg.AGE_OPTIONS.length; i++) {
      if (cfg.AGE_OPTIONS[i][0] === key) out.label = cfg.AGE_OPTIONS[i][1];
    }
    return out;
  }

  return {
    percentile: percentile,
    gradeOf: gradeOf,
    evaluate: evaluate,
    ageGroupFromBirth: ageGroupFromBirth
  };

})(RAVEN_CONFIG);

/* Node 环境下供校验脚本 require */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RavenNorms;
}
