/* =========================================================
 * norms.js — 计分与常模换算
 * 原始分 → 百分等级（分段线性插值）→ 离差智商估计（正态等价）
 * 依赖 config.js（先加载）
 * ========================================================= */

var RavenNorms = (function (cfg) {

  /* 标准正态分布累积函数 Φ(z)（Zelen & Severo 近似） */
  function phi(z) {
    // Abramowitz-Stegun 26.2.17
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989422804014327 * Math.exp(-z * z / 2);
    var p = d * t * ((((1.330274429 * t - 1.821255978) * t + 1.781477937) * t -
             0.356563782) * t + 0.319381530);
    return z > 0 ? 1 - p : p;
  }

  /* 标准正态分位数 Φ⁻¹(p)，Acklam 算法 */
  function probit(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
    var pl = 0.02425, ph = 1 - pl, q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    if (p <= ph) {
      q = p - 0.5; r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }

  function anchorsFor(ageKey) {
    var row = cfg.NORM_ROWS[ageKey] || cfg.NORM_ROWS['20'];
    var PRS = [95, 90, 75, 50, 25, 10, 5];
    var pts = [];
    for (var i = 0; i < 7; i++) pts.push([row[i], PRS[i]]);   // [原始分, 百分等级]
    pts.sort(function (x, y) { return x[0] - y[0]; });        // 分数升序 → 等级降序
    // 去重防同分导致斜率无穷大
    var clean = [pts[0]];
    for (var j = 1; j < pts.length; j++) {
      if (pts[j][0] !== clean[clean.length - 1][0]) clean.push(pts[j]);
    }
    return clean;
  }

  /* 原始分 → 百分等级（分段线性插值，两端保守外推并截断于 [0.5, 99.5]） */
  function percentile(raw, ageKey) {
    var pts = anchorsFor(ageKey), n = pts.length;
    raw = Math.max(0, Math.min(60, raw));
    var pr;
    if (raw <= pts[0][0]) {
      var s0 = n > 1 ? (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]) : 0;
      pr = pts[0][1] + (raw - pts[0][0]) * s0;               // 低端沿首段斜率外推
    } else if (raw >= pts[n - 1][0]) {
      var s1 = n > 1 ? (pts[n - 1][1] - pts[n - 2][1]) / (pts[n - 1][0] - pts[n - 2][0]) : 0;
      pr = pts[n - 1][1] + (raw - pts[n - 1][0]) * s1;       // 高端沿末段斜率外推
    } else {
      for (var i = 0; i < n - 1; i++) {
        if (raw >= pts[i][0] && raw <= pts[i + 1][0]) {
          var t = (raw - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
          pr = pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
          break;
        }
      }
    }
    return Math.max(0.5, Math.min(99.5, pr));
  }

  /* 百分等级 → 离差智商估计（M=100，SD=15，正态等价换算） */
  function iqFromPR(pr) {
    return Math.round(100 + 15 * probit(pr / 100));
  }

  /* 五级分级 */
  function gradeOf(prExact) {
    for (var i = 0; i < cfg.GRADES.length; i++) {
      if (prExact >= cfg.GRADES[i].min) return cfg.GRADES[i];
    }
    return cfg.GRADES[cfg.GRADES.length - 1];
  }

  /* 汇总：由总分与年龄组得到完整指标 */
  function evaluate(totalRaw, ageKey) {
    var pr = percentile(totalRaw, ageKey);          // 连续值，用于插值与 IQ
    var prDisp = Math.round(pr);                    // 展示用整数
    var grade = gradeOf(pr);
    return {
      total: totalRaw,
      pr: pr,
      prDisplay: prDisp,
      iq: iqFromPR(pr),
      ci: cfg.IQ_CI,
      level: grade.level,
      label: grade.label,
      gradeText: grade.text
    };
  }

  return {
    percentile: percentile,
    probit: probit,
    phi: phi,
    iqFromPR: iqFromPR,
    gradeOf: gradeOf,
    evaluate: evaluate
  };

})(RAVEN_CONFIG);

/* Node 环境下供校验脚本 require */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RavenNorms;
}
