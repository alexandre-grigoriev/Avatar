/**
* @class French lip-sync processor
* @author ChatGPT
*/

class LipsyncFr {

  constructor() {
    // Letter to viseme mappings (simplified phoneme approximation)
    this.visemes = {
      'a': 'aa', 'à': 'aa', 'â': 'aa', 'e': 'E', 'é': 'E', 'è': 'E', 'ê': 'E', 'ë': 'E',
      'i': 'I', 'î': 'I', 'ï': 'I', 'o': 'O', 'ô': 'O', 'u': 'U', 'ù': 'U', 'û': 'U', 'ü': 'U', 'y': 'I',
      'b': 'PP', 'c': 'SS', 'ç': 'SS', 'd': 'DD', 'f': 'FF', 'g': 'kk', 'h': 'kk', 'j': 'CH',
      'k': 'kk', 'l': 'nn', 'm': 'PP', 'n': 'nn', 'p': 'PP', 'q': 'kk', 'r': 'RR',
      's': 'SS', 't': 'DD', 'v': 'FF', 'w': 'FF', 'x': 'SS', 'z': 'SS'
    };

    this.durations = {
      'a': 0.9, 'à': 0.9, 'â': 1.2, 'e': 0.8, 'é': 0.9, 'è': 1.1, 'ê': 1.1, 'ë': 1.0,
      'i': 0.9, 'î': 1.1, 'ï': 1.0, 'o': 0.9, 'ô': 1.2, 'u': 0.9, 'ù': 1.1, 'û': 1.1, 'ü': 1.0, 'y': 1.0,
      'b': 1.1, 'c': 1.2, 'ç': 1.2, 'd': 1.0, 'f': 1.0, 'g': 1.2, 'h': 0.2,
      'j': 1.1, 'k': 1.2, 'l': 0.9, 'm': 1.1, 'n': 0.9, 'p': 1.1, 'q': 1.2,
      'r': 0.8, 's': 1.2, 't': 1.0, 'v': 1.0, 'w': 1.2, 'x': 1.2, 'z': 1.2
    };

    this.pauses = { ' ': 1, ',': 3, '-': 0.5, '.': 4 };

    // French number words
    this.units = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
    this.teens = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
    this.tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante-dix", "quatre-vingt", "quatre-vingt-dix"];
  }

  numberToFrenchWords(x) {
    let n = parseFloat(x);
    if (isNaN(n)) return x;
    if (n < 0) return 'moins ' + this.numberToFrenchWords(-n);

    let w = [];

    const convertUnder100 = (n) => {
      if (n < 10) return this.units[n];
      if (n < 17) return this.teens[n - 10];
      if (n < 20) return "dix-" + this.units[n - 10];
      if (n < 70) {
        let ten = Math.floor(n / 10);
        let unit = n % 10;
        return this.tens[ten] + (unit === 1 ? " et un" : unit > 0 ? "-" + this.units[unit] : "");
      }
      if (n < 80) return "soixante-" + convertUnder100(n - 60);
      if (n < 100) return "quatre-vingt" + (n > 80 ? "-" + convertUnder100(n - 80) : "");
      return "";
    };

    if (n >= 1000000) {
      let m = Math.floor(n / 1000000);
      w.push(m > 1 ? this.numberToFrenchWords(m) + " millions" : "un million");
      n %= 1000000;
    }
    if (n >= 1000) {
      let k = Math.floor(n / 1000);
      w.push(k > 1 ? this.numberToFrenchWords(k) + " mille" : "mille");
      n %= 1000;
    }
    if (n >= 100) {
      let h = Math.floor(n / 100);
      w.push(h > 1 ? this.units[h] + " cent" : "cent");
      n %= 100;
    }
    if (n > 0) w.push(convertUnder100(n));
    if (parseInt(x).toString() !== x) {
      let d = x.split('.')[1];
      if (d) {
        w.push("virgule");
        for (let ch of d) {
          w.push(this.units[parseInt(ch)]);
        }
      }
    }

    return w.join(' ');
  }

  preProcessText(s) {
    return s.replace(/[#_*'"“”„«»:;]/g, '')
      .replaceAll('0 %', 'zéro pourcent')
      .replaceAll('1 %', 'un pourcent')
      .replaceAll('%', ' pourcents ')
      .replaceAll('0 €', 'zéro euro')
      .replaceAll('1 €', 'un euro')
      .replaceAll('€', ' euros ')
      .replaceAll('0 $', 'zéro dollar')
      .replaceAll('1 $', 'un dollar')
      .replaceAll('$', ' dollars ')
      .replaceAll('&', ' et ')
      .replaceAll('+', ' plus ')
      .replace(/(\d),(\d)/g, '$1 virgule $2')
      .replace(/\d+/g, this.numberToFrenchWords.bind(this))
      .replace(/(\D)\1\1+/g, "$1$1")
      .replaceAll('  ', ' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
      .trim();
  }

  wordsToVisemes(w) {
    let o = { words: w, visemes: [], times: [], durations: [] };
    let t = 0;
    const chars = [...w];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i].toLowerCase();
      const viseme = this.visemes[c];
      if (viseme) {
        if (o.visemes.length && o.visemes[o.visemes.length - 1] === viseme) {
          const d = 0.7 * (this.durations[c] || 1);
          o.durations[o.durations.length - 1] += d;
          t += d;
        } else {
          const d = this.durations[c] || 1;
          o.visemes.push(viseme);
          o.times.push(t);
          o.durations.push(d);
          t += d;
        }
      } else {
        t += this.pauses[chars[i]] || 0;
      }
    }
    return o;
  }

}

export { LipsyncFr };
