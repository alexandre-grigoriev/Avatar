/**
* @class French lip-sync processor
* @author Based on English version by Mika Suominen, adapted for French
*/

class LipsyncFr {

  /**
  * @constructor
  */
  constructor() {

    // French words to Oculus visemes, adapted for French phonetics
    this.rules = {
      'A': [
        "[AI]N=aa nn", "[AI]M=aa nn", "[AU]=O", "[AY]=E", "[A]^+:#=aa",
        "[AN]=aa nn", "[AM]=aa nn", "[A]=aa"
      ],

      'B': [
        "[B]=PP"
      ],

      'C': [
        "[CH]=SS", "[C]E=SS", "[C]I=SS", "[C]Y=SS", "[CÇ]=SS",
        "[C]=kk"
      ],

      'D': [
        "[D]=DD"
      ],

      'E': [
        "[EAU]=O", "[EU]=E", "[EI]=E", "[EY]=E", "[ER] =E", "[ET] =E",
        "[ES] =E", "[EN]=aa nn", "[EM]=aa nn", "[É]=E", "[È]=E",
        "[Ê]=E", "[Ë]=E", "[E]=E"
      ],

      'F': [
        "[F]=FF"
      ],

      'G': [
        "[GN]=nn", "[G]E=SS", "[G]I=SS", "[G]Y=SS", "[G]=kk"
      ],

      'H': [
        "[H]="
      ],

      'I': [
        "[IN]=aa nn", "[IM]=aa nn", "[ILL]=I", "[I]=I"
      ],

      'J': [
        "[J]=SS"
      ],

      'K': [
        "[K]=kk"
      ],

      'L': [
        "[L]=nn"
      ],

      'M': [
        "[M]=PP"
      ],

      'N': [
        "[N]=nn"
      ],

      'O': [
        "[OIN]=FF aa nn", "[OI]=FF aa", "[OU]=U", "[ON]=O nn", "[OM]=O nn",
        "[O]=O"
      ],

      'P': [
        "[PH]=FF", "[P]=PP"
      ],

      'Q': [
        "[QU]=kk", "[Q]=kk"
      ],

      'R': [
        "[R]=RR"
      ],

      'S': [
        "[S]=SS"
      ],

      'T': [
        "[TH]=DD", "[TI]ON=SS I O nn", "[T]=DD"
      ],

      'U': [
        "[UN]=aa nn", "[UM]=aa nn", "[U]=I U"
      ],

      'V': [
        "[V]=FF"
      ],

      'W': [
        "[W]=FF"
      ],

      'X': [
        "[X]=kk SS"
      ],

      'Y': [
        "[Y]=I"
      ],

      'Z': [
        "[Z]=SS"
      ],

      'À': [
        "[À]=aa"
      ],

      'Á': [
        "[Á]=aa"
      ],

      'Â': [
        "[Â]=aa"
      ],

      'Ã': [
        "[Ã]=aa"
      ],

      'Ä': [
        "[Ä]=aa"
      ],

      'Ç': [
        "[Ç]=SS"
      ],

      'È': [
        "[È]=E"
      ],

      'É': [
        "[É]=E"
      ],

      'Ê': [
        "[Ê]=E"
      ],

      'Ë': [
        "[Ë]=E"
      ],

      'Ì': [
        "[Ì]=I"
      ],

      'Í': [
        "[Í]=I"
      ],

      'Î': [
        "[Î]=I"
      ],

      'Ï': [
        "[Ï]=I"
      ],

      'Ñ': [
        "[Ñ]=nn"
      ],

      'Ò': [
        "[Ò]=O"
      ],

      'Ó': [
        "[Ó]=O"
      ],

      'Ô': [
        "[Ô]=O"
      ],

      'Õ': [
        "[Õ]=O"
      ],

      'Ö': [
        "[Ö]=O"
      ],

      'Ù': [
        "[Ù]=I U"
      ],

      'Ú': [
        "[Ú]=I U"
      ],

      'Û': [
        "[Û]=I U"
      ],

      'Ü': [
        "[Ü]=I U"
      ],

      'Ý': [
        "[Ý]=I"
      ],

      'Ÿ': [
        "[Ÿ]=I"
      ]
    };

    const ops = {
      '#': '[AEIOUYÀÁÂÃÄÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝ]+', // French vowels including accented
      '.': '[BDVGJLMNRWZ]', // One voiced consonant
      '%': '(?:ER|E|ES|ED|ING|ELY|TION|SION)', // Common French endings
      '&': '(?:[SCGZXJ]|CH|SH)', // Sibilants
      '@': '(?:[TSRDLZNJ]|TH|CH|SH)', // Alveolar sounds
      '^': '[BCDFGHJKLMNPQRSTVWXZÇ]', // French consonants
      '+': '[EIYÉÈÊË]', // Front vowels
      ':': '[BCDFGHJKLMNPQRSTVWXZÇ]*', // Zero or more consonants
      ' ': '\\b' // Word boundary
    };

    // Convert rules to regex
    Object.keys(this.rules).forEach( key => {
      this.rules[key] = this.rules[key].map( rule => {
        const posL = rule.indexOf('[');
        const posR = rule.indexOf(']');
        const posE = rule.indexOf('=');
        const strLeft = rule.substring(0,posL);
        const strLetters = rule.substring(posL+1,posR);
        const strRight = rule.substring(posR+1,posE);
        const strVisemes = rule.substring(posE+1);

        const o = { regex: '', move: 0, visemes: [] };

        let exp = '';
        exp += [...strLeft].map( x => ops[x] || x ).join('');
        const ctxLetters = [...strLetters];
        ctxLetters[0] = ctxLetters[0].toLowerCase();
        exp += ctxLetters.join('');
        o.move = ctxLetters.length;
        exp += [...strRight].map( x => ops[x] || x ).join('');
        o.regex = new RegExp(exp);

        if ( strVisemes.length ) {
          strVisemes.split(' ').forEach( viseme => {
            o.visemes.push(viseme);
          });
        }

        return o;
      });
    });

    // Viseme durations in relative unit (1=average)
    this.visemeDurations = {
      'aa': 0.95, 'E': 0.90, 'I': 0.92, 'O': 0.96, 'U': 0.95, 'PP': 1.08,
      'SS': 1.23, 'TH': 1, 'DD': 1.05, 'FF': 1.00, 'kk': 1.21, 'nn': 0.88,
      'RR': 0.88, 'sil': 1
    };

    // Pauses in relative units (1=average)
    this.specialDurations = { ' ': 1, ',': 3, '-':0.5, "'":0.5, '.': 4, '!': 4, '?': 4, ':': 2, ';': 2 };

    // French number words
    this.digits = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
    this.ones = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf'];
    this.teens = ['dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
    this.tens = ['','dix','vingt','trente','quarante','cinquante','soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'];
    this.tensSpecial = {
      70: 'soixante-dix',
      80: 'quatre-vingt',
      90: 'quatre-vingt-dix'
    };

    // French symbols
    this.symbols = {
      '%': 'pour cent', '€': 'euros', '&': 'et', '+': 'plus',
      '$': 'dollars', '£': 'livres', '=': 'égal', '@': 'arobase',
      '#': 'dièse', '*': 'astérisque', '/': 'slash', '\\': 'antislash'
    };
    this.symbolsReg = /[%€&\+\$£=@#*\/\\]/g;
  }

  /**
   * Convert number to French words
   * @param {string|number} num Number to convert
   * @return {string} Number in French words
   */
  convertNumberToWords(num) {
    const n = parseInt(num);
    
    if (isNaN(n)) return num;
    if (n === 0) return 'zéro';
    
    // Handle negative numbers
    if (n < 0) return 'moins ' + this.convertNumberToWords(-n);
    
    // For large numbers, read digit by digit if over 999999
    if (n > 999999) {
      return this.convertDigitByDigit(num);
    }
    
    return this.convertToFrenchWords(n);
  }

  convertDigitByDigit(num) {
    return String(num).split('').map(digit => this.digits[parseInt(digit)]).join(' ');
  }

  convertToFrenchWords(n) {
    if (n < 10) return this.ones[n];
    if (n < 20) return this.teens[n - 10];
    if (n < 100) return this.convertTens(n);
    if (n < 1000) return this.convertHundreds(n);
    if (n < 1000000) return this.convertThousands(n);
    return this.convertMillions(n);
  }

  convertTens(n) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    
    if (ten === 7) {
      return unit === 0 ? 'soixante-dix' : 'soixante-' + this.teens[unit];
    }
    if (ten === 8) {
      return unit === 0 ? 'quatre-vingt' : 'quatre-vingt-' + this.ones[unit];
    }
    if (ten === 9) {
      return unit === 0 ? 'quatre-vingt-dix' : 'quatre-vingt-' + this.teens[unit];
    }
    
    if (unit === 0) return this.tens[ten];
    if (unit === 1 && ten === 2) return 'vingt et un';
    if (unit === 1 && (ten === 3 || ten === 4 || ten === 5 || ten === 6)) {
      return this.tens[ten] + ' et un';
    }
    
    return this.tens[ten] + '-' + this.ones[unit];
  }

  convertHundreds(n) {
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    
    let result = '';
    if (hundred === 1) {
      result = 'cent';
    } else {
      result = this.ones[hundred] + ' cent';
    }
    
    if (remainder > 0) {
      result += ' ' + this.convertToFrenchWords(remainder);
    } else if (hundred > 1) {
      result += 's'; // cents
    }
    
    return result;
  }

  convertThousands(n) {
    const thousand = Math.floor(n / 1000);
    const remainder = n % 1000;
    
    let result = '';
    if (thousand === 1) {
      result = 'mille';
    } else {
      result = this.convertToFrenchWords(thousand) + ' mille';
    }
    
    if (remainder > 0) {
      result += ' ' + this.convertToFrenchWords(remainder);
    }
    
    return result;
  }

  convertMillions(n) {
    const million = Math.floor(n / 1000000);
    const remainder = n % 1000000;
    
    let result = '';
    if (million === 1) {
      result = 'un million';
    } else {
      result = this.convertToFrenchWords(million) + ' millions';
    }
    
    if (remainder > 0) {
      result += ' ' + this.convertToFrenchWords(remainder);
    }
    
    return result;
  }

  /**
  * Preprocess text:
  * - convert symbols to words
  * - convert numbers to words
  * - handle French accents properly
  * - filter out characters that should be left unspoken
  * @param {string} s Text
  * @return {string} Pre-processed text.
  */
  preProcessText(s) {
    return s
      .replace(/[#_*\":;]/g,'') // Remove unwanted characters
      .replace(this.symbolsReg, (symbol) => {
        return ' ' + this.symbols[symbol] + ' ';
      })
      .replace(/(\d)\.(\d)/g, '$1 virgule $2') // French decimal separator
      .replace(/(\d),(\d)/g, '$1 virgule $2') // French decimal separator (comma)
      .replace(/\d+/g, (match) => this.convertNumberToWords(match)) // Numbers to words
      .replace(/(\D)\1\1+/g, "$1$1") // Max 2 repeating chars
      .replace(/\s+/g, ' ') // Only one space
      .replace(/'/g, "'") // Normalize apostrophes
      .trim();
  }

  /**
  * Convert word to Oculus LipSync Visemes and durations
  * @param {string} w Text
  * @return {Object} Oculus LipSync Visemes and durations.
  */
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
          let matches = test.match(rule.regex);
          
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
        
        if (!matched) {
          o.i++;
        }
      } else {
        o.i++;
        t += this.specialDurations[c] || 0;
      }
    }

    return o;
  }
}

export { LipsyncFr };