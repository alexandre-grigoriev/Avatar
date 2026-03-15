/**
 * @class Arabic lip-sync processor with comprehensive phonetic support
 * @author Claude
 * @version 1.0
 * @description Handles Modern Standard Arabic (MSA) and basic dialectal variations
 */

class LipsyncAr {
  constructor() {
    // Arabic consonants to viseme mapping (IPA-based)
    this.consonantVisemes = {
      // Bilabial
      'b': 'PP', 'م': 'PP', 'ب': 'PP', 'ف': 'FF', 'و': 'U',
      
      // Dental/Alveolar
      'ت': 'DD', 'د': 'DD', 'ط': 'DD', 'ض': 'DD', 'ذ': 'DD', 'ث': 'SS',
      'ن': 'nn', 'ل': 'nn', 'ر': 'RR', 'س': 'SS', 'ز': 'SS', 'ص': 'SS',
      
      // Post-alveolar
      'ش': 'CH', 'ج': 'CH', 'ى': 'I', 'ي': 'I',
      
      // Palatal
      'ك': 'kk', 'خ': 'kk', 'غ': 'kk', 'ق': 'kk',
      
      // Uvular/Pharyngeal/Glottal
      'ح': 'kk', 'ع': 'aa', 'ه': 'aa', 'ء': 'sil', 'أ': 'aa', 'إ': 'aa',
      'آ': 'aa', 'ؤ': 'U', 'ئ': 'I',
      
      // Emphatic consonants
      'ظ': 'DD', 'ص': 'SS', 'ض': 'DD', 'ط': 'DD'
    };

    // Arabic vowels to viseme mapping
    this.vowelVisemes = {
      // Short vowels (harakat)
      'َ': 'aa',    // fatha
      'ِ': 'I',     // kasra  
      'ُ': 'U',     // damma
      'ْ': 'sil',   // sukun (no vowel)
      
      // Long vowels
      'ا': 'aa',    // alif
      'و': 'U',     // waw
      'ي': 'I',     // ya
      'ى': 'I',     // alif maqsura
      'آ': 'aa',    // alif madda
      
      // Diphthongs
      'ai': 'E',    // ay sound
      'au': 'O'     // aw sound
    };

    // Combined phoneme to viseme mapping
    this.phonemeVisemes = {
      ...this.consonantVisemes,
      ...this.vowelVisemes,
      
      // Common Arabic phonemes (IPA)
      'ʔ': 'sil',   // glottal stop
      'ħ': 'kk',    // voiceless pharyngeal fricative
      'ʕ': 'aa',    // voiced pharyngeal fricative
      'x': 'kk',    // voiceless velar fricative
      'ɣ': 'kk',    // voiced velar fricative
      'q': 'kk',    // voiceless uvular stop
      'ʃ': 'CH',    // voiceless postalveolar fricative
      'ʒ': 'CH',    // voiced postalveolar fricative
      'sˤ': 'SS',   // emphatic s
      'dˤ': 'DD',   // emphatic d
      'tˤ': 'DD',   // emphatic t
      'ðˤ': 'DD'    // emphatic dh
    };

    // Phoneme durations (adjusted for Arabic rhythm)
    this.phonemeDurations = {
      // Short vowels - very brief
      'َ': 0.6, 'ِ': 0.6, 'ُ': 0.6, 'ْ': 0.2,
      
      // Long vowels - extended
      'ا': 1.4, 'و': 1.2, 'ي': 1.2, 'ى': 1.2, 'آ': 1.6,
      
      // Consonants
      'ب': 0.8, 'ت': 0.7, 'ث': 1.0, 'ج': 0.9, 'ح': 1.1, 'خ': 1.2,
      'د': 0.8, 'ذ': 1.0, 'ر': 0.9, 'ز': 1.0, 'س': 1.1, 'ش': 1.2,
      'ص': 1.2, 'ض': 1.1, 'ط': 0.9, 'ظ': 1.1, 'ع': 1.3, 'غ': 1.2,
      'ف': 1.0, 'ق': 1.0, 'ك': 0.9, 'ل': 0.8, 'م': 0.8, 'ن': 0.8, 'ه': 0.7,
      
      // Glottal stop and hamza
      'ء': 0.3, 'أ': 1.0, 'إ': 1.0, 'آ': 1.6, 'ؤ': 1.2, 'ئ': 1.0
    };

    // Arabic punctuation and pause durations
    this.pauseDurations = {
      ' ': 0.8,        // Word boundary
      '،': 2.5,        // Arabic comma
      '؛': 2.8,        // Arabic semicolon
      '؟': 4.5,        // Arabic question mark
      '!': 4.2,        // Exclamation
      '.': 4.0,        // Period
      '...': 3.5,      // Ellipsis
      '؍': 1.5,        // Arabic date separator
      '\n': 3.0,       // Line break
      '\t': 1.0        // Tab
    };

    // Arabic number words
    this.arabicNumbers = {
      units: ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'],
      unitsF: ['صفر', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع'],
      teens: ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'],
      tens: ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'],
      hundreds: ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'],
      scale: ['', 'ألف', 'مليون', 'مليار', 'تريليون']
    };

    // Common Arabic abbreviations and their expansions
    this.abbreviations = {
      'د.': 'دكتور',
      'أ.د.': 'أستاذ دكتور', 
      'م.': 'متر',
      'كم': 'كيلومتر',
      'كغ': 'كيلوغرام',
      'ص.ب': 'صندوق بريد',
      'ت.': 'تلفون',
      'فاكس': 'فاكس',
      'إلخ': 'إلى آخره',
      'أي': 'أي',
      'مثلاً': 'مثلاً',
      'ق.م': 'قبل الميلاد',
      'م.': 'ميلادي',
      'هـ': 'هجري'
    };

    // Arabic diacritical marks (harakat)
    this.diacritics = {
      'َ': 'a',     // fatha
      'ِ': 'i',     // kasra
      'ُ': 'u',     // damma
      'ً': 'an',    // fathatan
      'ٍ': 'in',    // kasratan
      'ٌ': 'un',    // dammatan
      'ْ': '',      // sukun
      'ّ': '',      // shadda (gemination)
      'ٰ': 'aa',    // alif khanjariyya
      'ۡ': '',      // small high dotless head of khah
      'ۢ': '',      // small high meem initial form
      'ۭ': '',      // small high waw
      'ۨ': '',      // small high noon
      'ۦ': '',      // small high yeh
      'ۥ': '',      // small waw
      'ۤ': ''       // small high madda
    };

    // Arabic definite article variants
    this.definitePrefixes = [
      'ال', 'الا', 'الأ', 'الإ', 'الآ', 'الؤ', 'الئ'
    ];

    // Sun and moon letters for definite article assimilation
    this.sunLetters = new Set(['ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ل', 'ن']);
    this.moonLetters = new Set(['ا', 'ب', 'ج', 'ح', 'خ', 'ع', 'غ', 'ف', 'ق', 'ك', 'م', 'ه', 'و', 'ي']);

    // Common Arabic phonetic transformations
    this.phoneticRules = [
      // Definite article assimilation
      { pattern: /ال([تثدذرزسشصضطظلن])/g, replacement: (match, letter) => letter + letter },
      
      // Ta marbuta at end of words
      { pattern: /ة$/g, replacement: 'ت' },
      { pattern: /ة /g, replacement: 'ت ' },
      
      // Alif variations
      { pattern: /آ/g, replacement: 'ءا' },
      { pattern: /أ/g, replacement: 'ء' },
      { pattern: /إ/g, replacement: 'ء' },
      
      // Remove diacritics for basic processing
      { pattern: /[ًٌٍَُِّْٰۭۡۢۨۦۥۤ]/g, replacement: '' },
      
      // Handle common contractions
      { pattern: /ما /g, replacement: 'ما ' },
      { pattern: /لا /g, replacement: 'لا ' }
    ];
  }

  /**
   * Convert Western Arabic numerals to Arabic words
   */
  numberToArabicWords(numStr) {
    const num = parseInt(numStr);
    if (isNaN(num)) return numStr;
    
    if (num === 0) return 'صفر';
    if (num < 0) return 'سالب ' + this.numberToArabicWords((-num).toString());
    
    const convertHundreds = (n, isFeminine = false) => {
      if (n === 0) return '';
      
      const units = isFeminine ? this.arabicNumbers.unitsF : this.arabicNumbers.units;
      
      if (n < 10) return units[n];
      if (n < 20) return this.arabicNumbers.teens[n - 10];
      if (n < 100) {
        const tens = Math.floor(n / 10);
        const remainder = n % 10;
        let result = this.arabicNumbers.tens[tens];
        if (remainder > 0) {
          result = units[remainder] + ' و' + result;
        }
        return result;
      }
      
      const hundreds = Math.floor(n / 100);
      const remainder = n % 100;
      let result = this.arabicNumbers.hundreds[hundreds];
      if (remainder > 0) {
        result += ' ' + convertHundreds(remainder, isFeminine);
      }
      return result;
    };

    let result = [];
    let remaining = num;
    
    // Handle millions and above
    if (remaining >= 1000000) {
      const millions = Math.floor(remaining / 1000000);
      if (millions === 1) {
        result.push('مليون');
      } else if (millions === 2) {
        result.push('مليونان');
      } else if (millions < 11) {
        result.push(convertHundreds(millions) + ' ملايين');
      } else {
        result.push(convertHundreds(millions) + ' مليون');
      }
      remaining %= 1000000;
    }
    
    // Handle thousands
    if (remaining >= 1000) {
      const thousands = Math.floor(remaining / 1000);
      if (thousands === 1) {
        result.push('ألف');
      } else if (thousands === 2) {
        result.push('ألفان');
      } else if (thousands < 11) {
        result.push(convertHundreds(thousands) + ' آلاف');
      } else {
        result.push(convertHundreds(thousands) + ' ألف');
      }
      remaining %= 1000;
    }
    
    // Handle hundreds and below
    if (remaining > 0) {
      result.push(convertHundreds(remaining));
    }
    
    return result.join(' ');
  }

  /**
   * Preprocess Arabic text with comprehensive cleaning and normalization
   */
  preProcessText(text) {
    if (!text || typeof text !== 'string') return '';
    
    let processed = text
      // Normalize Unicode Arabic characters
      .normalize('NFKC')
      
      // Remove or replace problematic characters
      .replace(/[#_*"""„«»@]/g, '')
      .replace(/[']/g, '')
      
      // Handle currency and percentages
      .replace(/(\d+(?:\.\d+)?)\s*%/g, (match, num) => {
        const words = this.numberToArabicWords(num);
        return words + ' في المائة';
      })
      .replace(/(\d+(?:\.\d+)?)\s*دولار/g, (match, num) => {
        const words = this.numberToArabicWords(num);
        return words + ' دولار';
      })
      .replace(/(\d+(?:\.\d+)?)\s*ريال/g, (match, num) => {
        const words = this.numberToArabicWords(num);
        return words + ' ريال';
      })
      .replace(/(\d+(?:\.\d+)?)\s*درهم/g, (match, num) => {
        const words = this.numberToArabicWords(num);
        return words + ' درهم';
      })
      
      // Handle common symbols
      .replace(/&/g, ' و ')
      .replace(/\+/g, ' زائد ')
      .replace(/=/g, ' يساوي ')
      .replace(/-/g, ' ناقص ')
      .replace(/\*/g, ' ضرب ')
      .replace(/\//g, ' مقسوم على ')
      
      // Convert Western Arabic numerals to Arabic words
      .replace(/\d+/g, (match) => this.numberToArabicWords(match))
      
      // Handle time format
      .replace(/(\d{1,2}):(\d{2})/g, (match, hours, minutes) => {
        const h = this.numberToArabicWords(hours);
        const m = this.numberToArabicWords(minutes);
        return `الساعة ${h} و${m} دقيقة`;
      })
      
      // Clean up spacing
      .replace(/\s+/g, ' ')
      .trim();

    // Handle abbreviations
    for (const [abbr, full] of Object.entries(this.abbreviations)) {
      const regex = new RegExp('\\b' + abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      processed = processed.replace(regex, full);
    }

    return processed;
  }

  /**
   * Apply Arabic phonetic rules for better pronunciation
   */
  applyPhoneticRules(text) {
    let phonetic = text;
    
    for (const rule of this.phoneticRules) {
      phonetic = phonetic.replace(rule.pattern, rule.replacement);
    }
    
    return phonetic;
  }

  /**
   * Handle Arabic definite article assimilation (sun and moon letters)
   */
  handleDefiniteArticle(text) {
    // Handle assimilation of ال with sun letters
    let processed = text;
    
    for (const sunLetter of this.sunLetters) {
      const pattern = new RegExp(`ال${sunLetter}`, 'g');
      processed = processed.replace(pattern, sunLetter + sunLetter);
    }
    
    return processed;
  }

  /**
   * Remove diacritics while preserving essential phonetic information
   */
  processDiacritics(text) {
    let processed = '';
    const chars = [...text];
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const diacritic = this.diacritics[char];
      
      if (diacritic !== undefined) {
        processed += diacritic; // Convert diacritic to phonetic representation
      } else {
        processed += char; // Keep the character as is
      }
    }
    
    return processed;
  }

  /**
   * Convert Arabic text to phonemic representation
   */
  textToPhonemes(text) {
    const processed = this.preProcessText(text);
    const withPhonetics = this.applyPhoneticRules(processed);
    const withArticles = this.handleDefiniteArticle(withPhonetics);
    const withDiacritics = this.processDiacritics(withArticles);
    
    const phonemes = [];
    const chars = [...withDiacritics];
    
    let i = 0;
    while (i < chars.length) {
      const char = chars[i];
      
      // Check for pause characters
      if (this.pauseDurations[char] !== undefined) {
        phonemes.push(char);
        i++;
        continue;
      }
      
      // Check for digraphs or trigraphs first
      let found = false;
      for (let len = 3; len >= 2; len--) {
        if (i + len <= chars.length) {
          const substr = chars.slice(i, i + len).join('');
          if (this.phonemeVisemes[substr]) {
            phonemes.push(substr);
            i += len;
            found = true;
            break;
          }
        }
      }
      
      // Single character
      if (!found) {
        if (this.phonemeVisemes[char]) {
          phonemes.push(char);
        }
        i++;
      }
    }
    
    return phonemes;
  }

  /**
   * Enhanced Arabic text to visemes conversion
   */
  wordsToVisemes(text, options = {}) {
    const {
      speedMultiplier = 1.0,
      emphasisStrength = 0.2,
      minVisemeDuration = 0.1,
      maxVisemeDuration = 2.5,
      dialectVariant = 'msa' // 'msa', 'egyptian', 'levantine', 'gulf'
    } = options;

    const phonemes = this.textToPhonemes(text);
    const result = {
      originalText: text,
      processedText: this.preProcessText(text),
      phonemes: phonemes,
      visemes: [],
      times: [],
      durations: [],
      totalDuration: 0,
      dialectVariant: dialectVariant
    };

    let currentTime = 0;
    
    for (let i = 0; i < phonemes.length; i++) {
      const phoneme = phonemes[i];
      
      // Handle pauses
      if (this.pauseDurations[phoneme] !== undefined) {
        currentTime += this.pauseDurations[phoneme] / speedMultiplier;
        continue;
      }
      
      const viseme = this.phonemeVisemes[phoneme];
      if (!viseme) continue;
      
      let duration = (this.phonemeDurations[phoneme] || 1.0) / speedMultiplier;
      
      // Apply emphasis for emphatic consonants
      if (emphasisStrength > 0 && ['ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ق'].includes(phoneme)) {
        duration *= (1 + emphasisStrength);
      }
      
      // Handle vowel length distinctions
      if (['ا', 'و', 'ي', 'آ'].includes(phoneme)) {
        duration *= 1.2; // Long vowels are longer
      }
      
      // Enforce duration limits
      duration = Math.max(minVisemeDuration, Math.min(maxVisemeDuration, duration));
      
      // Merge consecutive identical visemes
      if (result.visemes.length > 0 && result.visemes[result.visemes.length - 1] === viseme) {
        result.durations[result.durations.length - 1] += duration * 0.7;
      } else {
        result.visemes.push(viseme);
        result.times.push(currentTime);
        result.durations.push(duration);
      }
      
      currentTime += duration;
    }
    
    result.totalDuration = currentTime;
    return result;
  }

  /**
   * Generate Arabic-specific timing information
   */
  generateArabicSSML(text, options = {}) {
    const visemeData = this.wordsToVisemes(text, options);
    let ssml = '<speak xml:lang="ar">\n';
    
    for (let i = 0; i < visemeData.visemes.length; i++) {
      const viseme = visemeData.visemes[i];
      const time = visemeData.times[i];
      const duration = visemeData.durations[i];
      
      ssml += `  <mark name="ar_vis_${viseme}_${time.toFixed(2)}s"/>\n`;
      ssml += `  <prosody rate="${(1/duration).toFixed(2)}" xml:lang="ar">${viseme}</prosody>\n`;
    }
    
    ssml += '</speak>';
    return ssml;
  }

  /**
   * Export Arabic viseme data in various formats
   */
  exportVisemeData(text, format = 'json', options = {}) {
    const data = this.wordsToVisemes(text, options);
    
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(data, null, 2);
        
      case 'csv':
        let csv = 'Time,Viseme,Duration,Phoneme\n';
        for (let i = 0; i < data.visemes.length; i++) {
          const phoneme = i < data.phonemes.length ? data.phonemes[i] : '';
          csv += `${data.times[i].toFixed(3)},${data.visemes[i]},${data.durations[i].toFixed(3)},${phoneme}\n`;
        }
        return csv;
        
      case 'timeline':
        let timeline = 'Arabic Lip-sync Timeline:\n';
        timeline += '========================\n';
        for (let i = 0; i < data.visemes.length; i++) {
          const start = data.times[i];
          const end = start + data.durations[i];
          const phoneme = i < data.phonemes.length ? data.phonemes[i] : '';
          timeline += `${start.toFixed(2)}s - ${end.toFixed(2)}s: ${data.visemes[i]} (${phoneme})\n`;
        }
        return timeline;
        
      case 'srt':
        let srt = '';
        let counter = 1;
        for (let i = 0; i < data.visemes.length; i++) {
          const start = data.times[i];
          const end = start + data.durations[i];
          const startTime = this.formatSRTTime(start);
          const endTime = this.formatSRTTime(end);
          srt += `${counter}\n${startTime} --> ${endTime}\n${data.visemes[i]}\n\n`;
          counter++;
        }
        return srt;
        
      default:
        return data;
    }
  }

  /**
   * Format time for SRT subtitle format
   */
  formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Validate Arabic text input
   */
  isValidArabicText(text) {
    if (!text || typeof text !== 'string') return false;
    
    // Check if text contains Arabic characters
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    return arabicRegex.test(text);
  }

  /**
   * Get text directionality information
   */
  getTextDirection(text) {
    return {
      isRTL: true,
      direction: 'rtl',
      language: 'ar',
      writingSystem: 'arabic'
    };
  }

  /**
   * Analyze Arabic text complexity
   */
  analyzeText(text) {
    const phonemes = this.textToPhonemes(text);
    const visemeData = this.wordsToVisemes(text);
    
    return {
      originalLength: text.length,
      processedLength: this.preProcessText(text).length,
      phonemeCount: phonemes.length,
      visemeCount: visemeData.visemes.length,
      estimatedDuration: visemeData.totalDuration,
      complexity: phonemes.length / text.length, // phonemes per character
      hasNumbers: /\d/.test(text),
      hasDiacritics: /[ًٌٍَُِّْٰۭۡۢۨۦۥۤ]/.test(text),
      isValidArabic: this.isValidArabicText(text)
    };
  }
}

export { LipsyncAr };