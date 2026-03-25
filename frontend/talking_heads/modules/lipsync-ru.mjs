/**
* @class Russian lip-sync processor
* @description Maps Russian Cyrillic letters to Oculus visemes.
*/

class LipsyncRu {

  constructor() {
    this.visemeDurations = {
      'aa': 0.95, 'E': 0.90, 'I': 0.92, 'O': 0.96, 'U': 0.95,
      'PP': 1.08, 'SS': 1.23, 'TH': 1.00, 'DD': 1.05, 'FF': 1.00,
      'kk': 1.21, 'nn': 0.88, 'RR': 0.88, 'CH': 1.00, 'sil': 1.00
    };
    this.specialDurations = { ' ': 1, ',': 3, '.': 3, '-': 0.5, "'": 0.5 };

    // Cyrillic letter → viseme sequence (lowercase keys)
    this.map = {
      'а':['aa'], 'я':['I','aa'],
      'э':['E'],  'е':['I','E'], 'ё':['I','O'],
      'и':['I'],  'й':['I'],     'ы':['I'],
      'о':['O'],
      'у':['U'],  'ю':['I','U'],
      'б':['PP'], 'п':['PP'],
      'в':['FF'], 'ф':['FF'],
      'м':['PP'],
      'д':['DD'], 'т':['DD'],
      'з':['SS'], 'с':['SS'], 'ц':['SS'],
      'н':['nn'], 'л':['nn'],
      'р':['RR'],
      'г':['kk'], 'к':['kk'], 'х':['kk'],
      'ж':['CH'], 'ш':['CH'], 'щ':['CH'], 'ч':['CH'],
      'ь':[], 'ъ':[],
    };
  }

  preProcessText(s) {
    return s.replace(/[#_*\":;]/g, '').trim();
  }

  wordsToVisemes(w) {
    const o = { words: w, visemes: [], times: [], durations: [], i: 0 };
    let t = 0;
    const lower = w.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      const mapped = this.map[ch];
      if (mapped) {
        for (const v of mapped) {
          const d = this.visemeDurations[v] || 1;
          o.visemes.push(v); o.times.push(t); o.durations.push(d); t += d;
        }
      } else if (/[a-z]/.test(ch)) {
        // Latin loanwords fallback
        let v = null;
        if ('aeiou'.includes(ch)) v = 'aa';
        else if ('bpm'.includes(ch)) v = 'PP';
        else if ('fv'.includes(ch)) v = 'FF';
        else if ('kg'.includes(ch)) v = 'kk';
        else if ('sz'.includes(ch)) v = 'SS';
        else if ('dtnl'.includes(ch)) v = 'DD';
        else if (ch === 'r') v = 'RR';
        if (v) { const d = this.visemeDurations[v] || 1; o.visemes.push(v); o.times.push(t); o.durations.push(d); t += d; }
      } else {
        t += this.specialDurations[ch] || 0;
      }
    }
    o.i = w.length;
    return o;
  }
}

export { LipsyncRu };
