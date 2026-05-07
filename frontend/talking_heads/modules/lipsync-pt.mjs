/**
* @class Portuguese lip-sync processor
* @author Based on Spanish version, adapted for Portuguese phonetics
*/

class LipsyncPt {

  constructor() {

    // Portuguese grapheme-to-viseme rules (Oculus viseme set)
    // Portuguese phonetics key points:
    //   - Nasal vowels: ã, õ, ã, em/en, im/in, om/on, um/un
    //   - LH = palatal lateral (like Spanish LL → I viseme)
    //   - NH = palatal nasal (like Spanish Ñ → nn I)
    //   - RR / initial R = guttural (approximated as RR)
    //   - S between vowels = Z sound (voiced)
    //   - X can be SS, kk SS, or Z
    //   - CH = SS (like ship)
    //   - J, G before e/i = ZH (approximated as SS)
    //   - QU before e/i = kk (U silent)
    //   - H is always silent
    //   - Cedilla Ç = SS

    this.rules = {
      'A': [
        "[Ã]=aa nn",
        "[A]=aa"
      ],

      'B': [
        "[B]=PP"
      ],

      'C': [
        "[CH]=SS",
        "[C]E=SS", "[C]I=SS",
        "[ÇÃO]=SS aa nn",
        "[Ç]=SS",
        "[CC]=kk",
        "[C]=kk"
      ],

      'D': [
        "[D]=DD"
      ],

      'E': [
        "[EM]=E nn",
        "[EN]=E nn",
        "[E]=E"
      ],

      'F': [
        "[F]=FF"
      ],

      'G': [
        "[GUE]=kk", "[GUI]=kk",
        "[G]E=SS", "[G]I=SS",
        "[G]=kk"
      ],

      'H': [
        "[H]="
      ],

      'I': [
        "[IM]=I nn",
        "[IN]=I nn",
        "[I]=I"
      ],

      'J': [
        "[J]=SS"
      ],

      'K': [
        "[K]=kk"
      ],

      'L': [
        "[LH]=I",
        "[L]=nn"
      ],

      'M': [
        "[M]=PP"
      ],

      'N': [
        "[NH]=nn I",
        "[N]=nn"
      ],

      'O': [
        "[Õ]=O nn",
        "[OM]=O nn",
        "[ON]=O nn",
        "[O]=O"
      ],

      'P': [
        "[P]=PP"
      ],

      'Q': [
        "[QUE]=kk", "[QUI]=kk",
        "[QU]=kk U",
        "[Q]=kk"
      ],

      'R': [
        "[RR]=RR",
        "[R]=RR"
      ],

      'S': [
        "[SS]=SS",
        "[S]=SS"
      ],

      'T': [
        "[T]=DD"
      ],

      'U': [
        "[UM]=U nn",
        "[UN]=U nn",
        "[U]=U"
      ],

      'V': [
        "[V]=FF"
      ],

      'W': [
        "[W]=U"
      ],

      'X': [
        "[X]=SS"
      ],

      'Y': [
        "[Y]=I"
      ],

      'Z': [
        "[Z]=SS"
      ],

      // Accented vowels
      'Á': [ "[Á]=aa" ],
      'À': [ "[À]=aa" ],
      'Â': [ "[Â]=aa" ],
      'Ã': [ "[Ã]=aa nn" ],
      'É': [ "[É]=E"  ],
      'Ê': [ "[Ê]=E"  ],
      'Í': [ "[Í]=I"  ],
      'Ó': [ "[Ó]=O"  ],
      'Ô': [ "[Ô]=O"  ],
      'Õ': [ "[Õ]=O nn" ],
      'Ú': [ "[Ú]=U"  ],
      'Ü': [ "[Ü]=U"  ],
      'Ç': [ "[Ç]=SS" ]
    };

    const ops = {
      '#': '[AEIOUYÁÀÂÃÉÊÍÓÔÕÚÜ]+',
      '.': '[BDVGJLMNRWZ]',
      '^': '[BCDFGHJKLMNPQRSTVWXZÇ]',
      '+': '[EIÉ Í]',
      ':': '[BCDFGHJKLMNPQRSTVWXZÇ]*',
      ' ': '\\b'
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

    // Portuguese number words
    this.digits = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove'];
    this.ones   = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove',
                   'dez','onze','doze','treze','catorze','quinze','dezasseis','dezassete','dezoito','dezanove'];
    this.tens   = ['','dez','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
    this.hundreds = ['','cento','duzentos','trezentos','quatrocentos','quinhentos',
                     'seiscentos','setecentos','oitocentos','novecentos'];

    // Portuguese symbols
    this.symbols = {
      '%': 'por cento', '€': 'euros', '&': 'e', '+': 'mais',
      '$': 'dólares', '£': 'libras', '=': 'igual', '@': 'arroba',
      '#': 'cardinal', '*': 'asterisco', '/': 'barra', '\\': 'barra invertida'
    };
    this.symbolsReg = /[%€&\+\$£=@#*\/\\]/g;
  }

  convertNumberToWords(num) {
    const n = parseInt(num);
    if (isNaN(n)) return num;
    if (n === 0) return 'zero';
    if (n < 0)   return 'menos ' + this.convertNumberToWords(-n);
    if (n > 999999) return String(num).split('').map(d => this.digits[parseInt(d)]).join(' ');
    return this.toPortuguese(n);
  }

  toPortuguese(n) {
    if (n < 20)    return this.ones[n];
    if (n < 100) {
      const t = Math.floor(n / 10), u = n % 10;
      return u === 0 ? this.tens[t] : this.tens[t] + ' e ' + this.ones[u];
    }
    if (n === 100) return 'cem';
    if (n < 1000) {
      const h = Math.floor(n / 100), r = n % 100;
      return r === 0 ? this.hundreds[h] : this.hundreds[h] + ' e ' + this.toPortuguese(r);
    }
    if (n < 2000) {
      const r = n % 1000;
      return r === 0 ? 'mil' : 'mil e ' + this.toPortuguese(r);
    }
    if (n < 1000000) {
      const t = Math.floor(n / 1000), r = n % 1000;
      return r === 0 ? this.toPortuguese(t) + ' mil' : this.toPortuguese(t) + ' mil e ' + this.toPortuguese(r);
    }
    const m = Math.floor(n / 1000000), r = n % 1000000;
    const mWord = m === 1 ? 'um milhão' : this.toPortuguese(m) + ' milhões';
    return r === 0 ? mWord : mWord + ' e ' + this.toPortuguese(r);
  }

  preProcessText(s) {
    return s
      .replace(/[#_*\":;]/g, '')
      .replace(this.symbolsReg, symbol => ' ' + this.symbols[symbol] + ' ')
      .replace(/(\d)[.,](\d)/g, '$1 vírgula $2')
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

export { LipsyncPt };
