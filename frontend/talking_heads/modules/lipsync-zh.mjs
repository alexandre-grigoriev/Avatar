/**
* @class Chinese (Mandarin) lip-sync processor
* @description CJK characters each represent one syllable, so we produce one
* vowel viseme per character. Pinyin initials/finals are handled if romanized.
*/

class LipsyncZh {

  constructor() {
    this.visemeDurations = {
      'aa': 0.95, 'E': 0.90, 'I': 0.92, 'O': 0.96, 'U': 0.95,
      'PP': 1.08, 'SS': 1.23, 'TH': 1.00, 'DD': 1.05, 'FF': 1.00,
      'kk': 1.21, 'nn': 0.88, 'RR': 0.88, 'CH': 1.00, 'sil': 1.00
    };
    this.specialDurations = { ' ': 1, '，': 2, '。': 3, '！': 2, '？': 2, ',': 2, '.': 3 };

    // Pinyin finals → vowel viseme
    this.finals = {
      'a':'aa','ai':'aa','ao':'aa','an':'aa','ang':'aa',
      'e':'E', 'ei':'E', 'en':'E', 'eng':'E','er':'E',
      'i':'I', 'ia':'aa','iao':'aa','ie':'E','in':'I','ing':'I','iong':'O','iu':'U','ian':'aa','iang':'aa',
      'o':'O', 'ou':'O','ong':'O',
      'u':'U', 'ua':'aa','uai':'aa','uan':'aa','uang':'aa','ui':'I','un':'U','uo':'O',
      'v':'U', 've':'E','van':'aa','vn':'U',
    };

    // Pinyin initials → consonant viseme
    this.initials = {
      'b':'PP','p':'PP','m':'PP','f':'FF',
      'd':'DD','t':'DD','n':'nn','l':'nn',
      'g':'kk','k':'kk','h':'kk',
      'j':'I', 'q':'CH','x':'SS',
      'r':'RR','z':'SS','c':'SS','s':'SS',
      'y':'I', 'w':'U',
    };
    this.initials2 = { 'zh':'CH','ch':'CH','sh':'CH' };

    // Vowel cycle for CJK characters (one per syllable)
    this._cjkCycle = ['aa','I','E','O','U','aa','E','I','O','U'];
    this._cjkIdx = 0;
  }

  _isCJK(ch) {
    const cp = ch.codePointAt(0);
    return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF)
        || (cp >= 0xF900 && cp <= 0xFAFF);
  }

  _push(o, v, t) {
    const d = this.visemeDurations[v] || 1;
    o.visemes.push(v); o.times.push(t); o.durations.push(d);
    return t + d;
  }

  preProcessText(s) {
    return s.replace(/[#_*\":;]/g, '').trim();
  }

  wordsToVisemes(w) {
    const o = { words: w, visemes: [], times: [], durations: [], i: 0 };
    let t = 0;
    let i = 0;
    const lower = w.toLowerCase();
    while (i < w.length) {
      // CJK → one syllable viseme
      if (this._isCJK(w[i])) {
        const v = this._cjkCycle[this._cjkIdx++ % this._cjkCycle.length];
        t = this._push(o, v, t);
        i++; continue;
      }
      // 2-char pinyin initial (zh, ch, sh)
      const two = lower.slice(i, i + 2);
      if (this.initials2[two]) {
        t = this._push(o, this.initials2[two], t);
        i += 2; continue;
      }
      // 1-char pinyin initial
      if (this.initials[lower[i]]) {
        t = this._push(o, this.initials[lower[i]], t);
        i++; continue;
      }
      // Pinyin finals (up to 4 chars)
      let matched = false;
      for (let len = 4; len >= 1; len--) {
        const sub = lower.slice(i, i + len);
        if (this.finals[sub]) {
          t = this._push(o, this.finals[sub], t);
          i += len; matched = true; break;
        }
      }
      if (!matched) { t += this.specialDurations[w[i]] || 0; i++; }
    }
    o.i = w.length;
    return o;
  }
}

export { LipsyncZh };
