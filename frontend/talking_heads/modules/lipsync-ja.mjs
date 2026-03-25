/**
* @class Japanese lip-sync processor
* @description Maps Japanese kana (hiragana + katakana) to Oculus visemes.
*/

class LipsyncJa {

  constructor() {
    this.visemeDurations = {
      'aa': 0.95, 'E': 0.90, 'I': 0.92, 'O': 0.96, 'U': 0.95,
      'PP': 1.08, 'SS': 1.23, 'TH': 1.00, 'DD': 1.05, 'FF': 1.00,
      'kk': 1.21, 'nn': 0.88, 'RR': 0.88, 'CH': 1.00, 'sil': 1.00
    };
    this.specialDurations = { ' ': 1, '。': 3, '、': 2, '！': 2, '？': 2 };

    // Hiragana/Katakana mora → viseme sequence
    this.kanaMap = {
      'あ':['aa'],'ア':['aa'], 'い':['I'], 'イ':['I'],
      'う':['U'], 'ウ':['U'],  'え':['E'], 'エ':['E'],
      'お':['O'], 'オ':['O'],
      'か':['kk','aa'],'カ':['kk','aa'], 'き':['kk','I'], 'キ':['kk','I'],
      'く':['kk','U'], 'ク':['kk','U'],  'け':['kk','E'],'ケ':['kk','E'],
      'こ':['kk','O'], 'コ':['kk','O'],
      'さ':['SS','aa'],'サ':['SS','aa'], 'し':['CH','I'],'シ':['CH','I'],
      'す':['SS','U'], 'ス':['SS','U'],  'せ':['SS','E'],'セ':['SS','E'],
      'そ':['SS','O'], 'ソ':['SS','O'],
      'た':['DD','aa'],'タ':['DD','aa'], 'ち':['CH','I'],'チ':['CH','I'],
      'つ':['DD','U'], 'ツ':['DD','U'],  'て':['DD','E'],'テ':['DD','E'],
      'と':['DD','O'], 'ト':['DD','O'],
      'な':['nn','aa'],'ナ':['nn','aa'], 'に':['nn','I'],'ニ':['nn','I'],
      'ぬ':['nn','U'], 'ヌ':['nn','U'],  'ね':['nn','E'],'ネ':['nn','E'],
      'の':['nn','O'], 'ノ':['nn','O'],
      'は':['FF','aa'],'ハ':['FF','aa'], 'ひ':['FF','I'],'ヒ':['FF','I'],
      'ふ':['FF','U'], 'フ':['FF','U'],  'へ':['FF','E'],'ヘ':['FF','E'],
      'ほ':['FF','O'], 'ホ':['FF','O'],
      'ま':['PP','aa'],'マ':['PP','aa'], 'み':['PP','I'],'ミ':['PP','I'],
      'む':['PP','U'], 'ム':['PP','U'],  'め':['PP','E'],'メ':['PP','E'],
      'も':['PP','O'], 'モ':['PP','O'],
      'や':['I','aa'], 'ヤ':['I','aa'],  'ゆ':['I','U'], 'ユ':['I','U'],
      'よ':['I','O'],  'ヨ':['I','O'],
      'ら':['RR','aa'],'ラ':['RR','aa'], 'り':['RR','I'],'リ':['RR','I'],
      'る':['RR','U'], 'ル':['RR','U'],  'れ':['RR','E'],'レ':['RR','E'],
      'ろ':['RR','O'], 'ロ':['RR','O'],
      'わ':['U','aa'], 'ワ':['U','aa'],  'を':['O'],     'ヲ':['O'],
      'ん':['nn'],     'ン':['nn'],
      'が':['kk','aa'],'ガ':['kk','aa'], 'ぎ':['kk','I'],'ギ':['kk','I'],
      'ぐ':['kk','U'], 'グ':['kk','U'],  'げ':['kk','E'],'ゲ':['kk','E'],
      'ご':['kk','O'], 'ゴ':['kk','O'],
      'ざ':['SS','aa'],'ザ':['SS','aa'], 'じ':['CH','I'],'ジ':['CH','I'],
      'ず':['SS','U'], 'ズ':['SS','U'],  'ぜ':['SS','E'],'ゼ':['SS','E'],
      'ぞ':['SS','O'], 'ゾ':['SS','O'],
      'だ':['DD','aa'],'ダ':['DD','aa'], 'ぢ':['CH','I'],'ヂ':['CH','I'],
      'づ':['DD','U'], 'ヅ':['DD','U'],  'で':['DD','E'],'デ':['DD','E'],
      'ど':['DD','O'], 'ド':['DD','O'],
      'ば':['PP','aa'],'バ':['PP','aa'], 'び':['PP','I'],'ビ':['PP','I'],
      'ぶ':['PP','U'], 'ブ':['PP','U'],  'べ':['PP','E'],'ベ':['PP','E'],
      'ぼ':['PP','O'], 'ボ':['PP','O'],
      'ぱ':['PP','aa'],'パ':['PP','aa'], 'ぴ':['PP','I'],'ピ':['PP','I'],
      'ぷ':['PP','U'], 'プ':['PP','U'],  'ぺ':['PP','E'],'ペ':['PP','E'],
      'ぽ':['PP','O'], 'ポ':['PP','O'],
      // Compound kana
      'きゃ':['kk','I','aa'],'キャ':['kk','I','aa'],
      'きゅ':['kk','I','U'], 'キュ':['kk','I','U'],
      'きょ':['kk','I','O'], 'キョ':['kk','I','O'],
      'しゃ':['CH','aa'],    'シャ':['CH','aa'],
      'しゅ':['CH','U'],     'シュ':['CH','U'],
      'しょ':['CH','O'],     'ショ':['CH','O'],
      'ちゃ':['CH','aa'],    'チャ':['CH','aa'],
      'ちゅ':['CH','U'],     'チュ':['CH','U'],
      'ちょ':['CH','O'],     'チョ':['CH','O'],
      'にゃ':['nn','I','aa'],'ニャ':['nn','I','aa'],
      'にゅ':['nn','I','U'], 'ニュ':['nn','I','U'],
      'にょ':['nn','I','O'], 'ニョ':['nn','I','O'],
      'ひゃ':['FF','I','aa'],'ヒャ':['FF','I','aa'],
      'ひゅ':['FF','I','U'], 'ヒュ':['FF','I','U'],
      'ひょ':['FF','I','O'], 'ヒョ':['FF','I','O'],
      'みゃ':['PP','I','aa'],'ミャ':['PP','I','aa'],
      'みゅ':['PP','I','U'], 'ミュ':['PP','I','U'],
      'みょ':['PP','I','O'], 'ミョ':['PP','I','O'],
      'りゃ':['RR','I','aa'],'リャ':['RR','I','aa'],
      'りゅ':['RR','I','U'], 'リュ':['RR','I','U'],
      'りょ':['RR','I','O'], 'リョ':['RR','I','O'],
      'ぎゃ':['kk','I','aa'],'ギャ':['kk','I','aa'],
      'ぎゅ':['kk','I','U'], 'ギュ':['kk','I','U'],
      'ぎょ':['kk','I','O'], 'ギョ':['kk','I','O'],
      'じゃ':['CH','aa'],    'ジャ':['CH','aa'],
      'じゅ':['CH','U'],     'ジュ':['CH','U'],
      'じょ':['CH','O'],     'ジョ':['CH','O'],
      'びゃ':['PP','I','aa'],'ビャ':['PP','I','aa'],
      'びゅ':['PP','I','U'], 'ビュ':['PP','I','U'],
      'びょ':['PP','I','O'], 'ビョ':['PP','I','O'],
      // Small/modifier kana
      'ぁ':['aa'],'ァ':['aa'], 'ぃ':['I'],'ィ':['I'],
      'ぅ':['U'], 'ゥ':['U'],  'ぇ':['E'],'ェ':['E'],
      'ぉ':['O'], 'ォ':['O'],
      'っ':[], 'ッ':[], 'ー':[],
    };
  }

  preProcessText(s) {
    return s.replace(/[#_*\":;]/g, '').trim();
  }

  wordsToVisemes(w) {
    const o = { words: w, visemes: [], times: [], durations: [], i: 0 };
    let t = 0;
    let i = 0;
    while (i < w.length) {
      // Try 2-char compound kana first
      const two = w.slice(i, i + 2);
      if (two.length === 2 && this.kanaMap[two]) {
        for (const v of this.kanaMap[two]) {
          const d = this.visemeDurations[v] || 1;
          o.visemes.push(v); o.times.push(t); o.durations.push(d); t += d;
        }
        i += 2; continue;
      }
      const one = w[i];
      const mapped = this.kanaMap[one];
      if (mapped) {
        for (const v of mapped) {
          const d = this.visemeDurations[v] || 1;
          o.visemes.push(v); o.times.push(t); o.durations.push(d); t += d;
        }
      } else {
        t += this.specialDurations[one] || 0;
      }
      i++;
    }
    o.i = w.length;
    return o;
  }
}

export { LipsyncJa };
