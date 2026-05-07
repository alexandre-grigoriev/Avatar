/**
* @class Spanish lip-sync processor
* @author Based on French version by Mika Suominen, adapted for Spanish phonetics
*/

class LipsyncEs {

  constructor() {

    // Spanish grapheme-to-viseme rules (Oculus viseme set)
    // Spanish phonetics key points:
    //   - All vowels are pure and consistent
    //   - H is always silent
    //   - V and B are identical (bilabial)
    //   - LL and Y are the same sound (palatal)
    //   - RR is a rolled/trilled R
    //   - J and G (before e,i) are a velar fricative (like strong H)
    //   - C before e,i = S; otherwise = K
    //   - Z = S (Latin American standard)
    //   - QU = K (U is silent)
    //   - CH = affricate (SS approximation)
    //   - Ñ = palatal nasal (nn + I)

    this.rules = {
      'A': [
        "[A]=aa"
      ],

      'B': [
        "[B]=PP"
      ],

      'C': [
        "[CH]=SS",
        "[C]E=SS", "[C]I=SS",
        "[CC]=kk SS",
        "[C]=kk"
      ],

      'D': [
        "[D]=DD"
      ],

      'E': [
        "[E]=E"
      ],

      'F': [
        "[F]=FF"
      ],

      'G': [
        "[GUE]=kk", "[GUI]=kk",
        "[G]E=kk", "[G]I=kk",
        "[GÜ]=kk U",
        "[G]=kk"
      ],

      'H': [
        "[H]="
      ],

      'I': [
        "[I]=I"
      ],

      'J': [
        "[J]=kk"
      ],

      'K': [
        "[K]=kk"
      ],

      'L': [
        "[LL]=I",
        "[L]=nn"
      ],

      'M': [
        "[M]=PP"
      ],

      'N': [
        "[Ñ]=nn I",
        "[N]=nn"
      ],

      'O': [
        "[O]=O"
      ],

      'P': [
        "[P]=PP"
      ],

      'Q': [
        "[QU]=kk",
        "[Q]=kk"
      ],

      'R': [
        "[RR]=RR",
        "[R]=RR"
      ],

      'S': [
        "[S]=SS"
      ],

      'T': [
        "[T]=DD"
      ],

      'U': [
        "[U]=U"
      ],

      'V': [
        "[V]=PP"
      ],

      'W': [
        "[W]=U"
      ],

      'X': [
        "[X]=kk SS"
      ],

      'Y': [
        "[Y]#=I",
        "[Y]=I"
      ],

      'Z': [
        "[Z]=SS"
      ],

      // Accented vowels
      'Á': [ "[Á]=aa" ],
      'É': [ "[É]=E"  ],
      'Í': [ "[Í]=I"  ],
      'Ó': [ "[Ó]=O"  ],
      'Ú': [ "[Ú]=U"  ],
      'Ü': [ "[Ü]=U"  ],
      'Ñ': [ "[Ñ]=nn I" ]
    };

    const ops = {
      '#': '[AEIOUYÁÉÍÓÚÜ]+',  // One or more Spanish vowels
      '.': '[BDVGJLMNRWZ]',    // One voiced consonant
      '^': '[BCDFGHJKLMNPQRSTVWXZÑ]', // Spanish consonant
      '+': '[EIÉ Í]',          // Front vowels
      ':': '[BCDFGHJKLMNPQRSTVWXZÑ]*', // Zero or more consonants
      ' ': '\\b'               // Word boundary
    };

    // Convert rules to regex
    Object.keys(this.rules).forEach(key => {
      this.rules[key] = this.rules[key].map(rule => {
        const posL = rule.indexOf('[');
        const posR = rule.indexOf(']');
        const posE = rule.indexOf('=');
        const strLeft   = rule.substring(0, posL);
        const strLetters = rule.substring(posL + 1, posR);
        const strRight  = rule.substring(posR + 1, posE);
        const strVisemes = rule.substring(posE + 1);

        const o = { regex: '', move: 0, visemes: [] };

        let exp = '';
        exp += [...strLeft].map(x => ops[x] || x).join('');
        const ctxLetters = [...strLetters];
        ctxLetters[0] = ctxLetters[0].toLowerCase();
        exp += ctxLetters.join('');
        o.move = ctxLetters.length;
        exp += [...strRight].map(x => ops[x] || x).join('');
        o.regex = new RegExp(exp);

        if (strVisemes.length) {
          strVisemes.split(' ').forEach(viseme => {
            o.visemes.push(viseme);
          });
        }

        return o;
      });
    });

    // Viseme durations (relative, 1 = average)
    this.visemeDurations = {
      'aa': 0.95, 'E': 0.90, 'I': 0.92, 'O': 0.96, 'U': 0.95,
      'PP': 1.08, 'SS': 1.15, 'TH': 1.00, 'DD': 1.00, 'FF': 1.00,
      'kk': 1.15, 'nn': 0.88, 'RR': 0.90, 'sil': 1
    };

    // Pause durations
    this.specialDurations = { ' ': 1, ',': 3, '-': 0.5, "'": 0.5, '.': 4, '!': 4, '?': 4, ':': 2, ';': 2 };

    // Spanish number words
    this.digits = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
    this.ones   = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
                   'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
    this.tens   = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
    this.hundreds = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
                     'seiscientos','setecientos','ochocientos','novecientos'];

    // Spanish symbols
    this.symbols = {
      '%': 'por ciento', '€': 'euros', '&': 'y', '+': 'más',
      '$': 'dólares', '£': 'libras', '=': 'igual', '@': 'arroba',
      '#': 'numeral', '*': 'asterisco', '/': 'barra', '\\': 'barra invertida'
    };
    this.symbolsReg = /[%€&\+\$£=@#*\/\\]/g;
  }

  convertNumberToWords(num) {
    const n = parseInt(num);
    if (isNaN(n)) return num;
    if (n === 0) return 'cero';
    if (n < 0)   return 'menos ' + this.convertNumberToWords(-n);
    if (n > 999999) return String(num).split('').map(d => this.digits[parseInt(d)]).join(' ');
    return this.toSpanish(n);
  }

  toSpanish(n) {
    if (n < 20)    return this.ones[n];
    if (n < 100) {
      const t = Math.floor(n / 10), u = n % 10;
      if (t === 2 && u > 0) return 'veinti' + this.ones[u];
      return u === 0 ? this.tens[t] : this.tens[t] + ' y ' + this.ones[u];
    }
    if (n === 100) return 'cien';
    if (n < 1000) {
      const h = Math.floor(n / 100), r = n % 100;
      return r === 0 ? this.hundreds[h] : this.hundreds[h] + ' ' + this.toSpanish(r);
    }
    if (n < 2000) {
      const r = n % 1000;
      return r === 0 ? 'mil' : 'mil ' + this.toSpanish(r);
    }
    if (n < 1000000) {
      const t = Math.floor(n / 1000), r = n % 1000;
      return r === 0 ? this.toSpanish(t) + ' mil' : this.toSpanish(t) + ' mil ' + this.toSpanish(r);
    }
    const m = Math.floor(n / 1000000), r = n % 1000000;
    const mWord = m === 1 ? 'un millón' : this.toSpanish(m) + ' millones';
    return r === 0 ? mWord : mWord + ' ' + this.toSpanish(r);
  }

  preProcessText(s) {
    return s
      .replace(/[#_*\":;]/g, '')
      .replace(this.symbolsReg, symbol => ' ' + this.symbols[symbol] + ' ')
      .replace(/(\d)[.,](\d)/g, '$1 coma $2')
      .replace(/\d+/g, match => this.convertNumberToWords(match))
      .replace(/(\D)\1\1+/g, '$1$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  wordsToVisemes(w) {
    let o = { words: w.toUpperCase(), visemes: [], times: [], durations: [], i: 0 };
    let t = 0;

    const chars = [...o.words];
    while (o.i < chars.length) {
      const c = chars[o.i];
      const ruleset = this.rules[c];

      if (ruleset) {
        let matched = false;
        for (let i = 0; i < ruleset.length; i++) {
          const rule = ruleset[i];
          const test = o.words.substring(0, o.i) + c.toLowerCase() + o.words.substring(o.i + 1);
          const matches = test.match(rule.regex);

          if (matches) {
            rule.visemes.forEach(viseme => {
              if (o.visemes.length && o.visemes[o.visemes.length - 1] === viseme) {
                const d = 0.7 * (this.visemeDurations[viseme] || 1);
                o.durations[o.durations.length - 1] += d;
                t += d;
              } else {
                const d = this.visemeDurations[viseme] || 1;
                o.visemes.push(viseme);
                o.times.push(t);
                o.durations.push(d);
                t += d;
              }
            });
            o.i += rule.move;
            matched = true;
            break;
          }
        }
        if (!matched) o.i++;
      } else {
        o.i++;
        t += this.specialDurations[c] || 0;
      }
    }

    return o;
  }
}

export { LipsyncEs };
