// lib/registration/field-specs.ts — [A] Field definitions, order, and validators
// Mirrors the exact order and validation of the manual registration form.

export type FieldName =
  | 'hospital'
  | 'full_name'
  | 'phone'
  | 'email'
  | 'date_of_birth'
  | 'age'
  | 'gender'
  | 'blood_group'
  | 'address'
  | 'emergency_contact_name'
  | 'emergency_contact_phone';

export interface FieldSpec {
  name: FieldName;
  required: boolean;
  type: 'text' | 'phone' | 'email' | 'date' | 'enum' | 'list' | 'derived';
  enumValues?: string[];      // for enum fields (gender, blood_group)
  liveList?: boolean;          // fetched from DB (hospital, department)
  voiceHostile?: boolean;      // needs special handling (email, phone, dob)
  skippable?: boolean;         // patient can say "skip"
  maxRetries: number;          // before offering manual fallback
}

// Exact field order from the manual form (Img3)
export const FIELD_ORDER: FieldSpec[] = [
  {
    name: 'hospital',
    required: true,
    type: 'list',
    liveList: true,
    voiceHostile: false,
    skippable: false,
    maxRetries: 3,
  },
  {
    name: 'full_name',
    required: true,
    type: 'text',
    voiceHostile: false,
    skippable: false,
    maxRetries: 3,
  },
  {
    name: 'phone',
    required: true,
    type: 'phone',
    voiceHostile: true,
    skippable: false,
    maxRetries: 3,
  },
  {
    name: 'email',
    required: true,
    type: 'email',
    voiceHostile: true,
    skippable: false,
    maxRetries: 3,
  },
  {
    name: 'date_of_birth',
    required: false,
    type: 'date',
    voiceHostile: true,
    skippable: true,
    maxRetries: 3,
  },
  {
    name: 'age',
    required: false,
    type: 'derived',
    voiceHostile: false,
    skippable: true,
    maxRetries: 2,
  },
  {
    name: 'gender',
    required: true,
    type: 'enum',
    enumValues: ['Male', 'Female', 'Other'],
    voiceHostile: false,
    skippable: false,
    maxRetries: 3,
  },
  {
    name: 'blood_group',
    required: false,
    type: 'enum',
    enumValues: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    voiceHostile: false,
    skippable: true,
    maxRetries: 2,
  },
  {
    name: 'address',
    required: false,
    type: 'text',
    voiceHostile: false,
    skippable: true,
    maxRetries: 2,
  },
  {
    name: 'emergency_contact_name',
    required: false,
    type: 'text',
    voiceHostile: false,
    skippable: true,
    maxRetries: 2,
  },
  {
    name: 'emergency_contact_phone',
    required: false,
    type: 'phone',
    voiceHostile: true,
    skippable: true,
    maxRetries: 2,
  },
];

// Fields collected by voice — excludes address and emergency contacts (can be added later via profile)
export const VOICE_FIELD_ORDER: FieldSpec[] = FIELD_ORDER.filter(
  f => !['address', 'emergency_contact_name', 'emergency_contact_phone'].includes(f.name),
);

// ─── Validators ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  cleaned: string;
  error?: string;
}

/**
 * Validate a field value. Returns cleaned value if valid.
 * Mirrors the manual form's validation rules exactly.
 */
export function validateField(
  field: FieldName,
  value: string,
  context?: { enumValues?: string[]; listOptions?: string[] },
): ValidationResult {
  const trimmed = value.trim();

  switch (field) {
    case 'full_name':
      if (!trimmed) return { valid: false, cleaned: '', error: 'Name is required' };
      if (trimmed.length < 2) return { valid: false, cleaned: trimmed, error: 'Name is too short' };
      return { valid: true, cleaned: trimmed };

    case 'phone':
    case 'emergency_contact_phone': {
      const digitMap: Record<string, string> = {
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
        'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'oh': '0', 'o': '0',
        'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पांच': '5', 'पाँच': '5',
        'छह': '6', 'छः': '6', 'सात': '7', 'आठ': '8', 'नौ': '9', 'दस': '10',
        'जीरो': '0', 'वन': '1', 'टू': '2', 'थ्री': '3', 'फोर': '4', 'फाइव': '5', 'फ़ाइव': '5',
        'सिक्स': '6', 'सेवन': '7', 'एट': '8', 'नाइन': '9', 'टेन': '10', 'ओ': '0'
      };
      
      const words = trimmed.toLowerCase().split(/[\s\-]+/);
      const mapped = words.map(w => {
        const clean = w.replace(/[^\w\u0900-\u097F]/g, '');
        return digitMap[clean] || digitMap[w] || clean;
      });
      
      const digits = mapped.join('').replace(/\D/g, '').slice(-10);
      if (digits.length !== 10) return { valid: false, cleaned: digits, error: 'Must be a 10-digit number' };
      return { valid: true, cleaned: digits };
    }

    case 'email': {
      // Email is required — empty input (or a "skip" intent) is not accepted.
      if (!trimmed || trimmed.toLowerCase() === 'skip') return { valid: false, cleaned: '', error: 'Email is required' };

      let cleanedEmail = trimmed.toLowerCase();
      // Replace spoken symbols with characters
      cleanedEmail = cleanedEmail.replace(/\s+at\s+the\s+rate\s+/g, '@');
      cleanedEmail = cleanedEmail.replace(/\s+at\s+/g, '@');
      cleanedEmail = cleanedEmail.replace(/\s+dot\s+/g, '.');
      // Strip all remaining whitespace
      cleanedEmail = cleanedEmail.replace(/\s+/g, '');

      // Strip trailing STT punctuation (e.g. periods)
      cleanedEmail = cleanedEmail.replace(/[.,;!?।॥]+$/, '');

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanedEmail)) return { valid: false, cleaned: cleanedEmail, error: 'Invalid email format' };
      return { valid: true, cleaned: cleanedEmail };
    }

    case 'date_of_birth': {
      if (!trimmed || trimmed.toLowerCase() === 'skip') return { valid: true, cleaned: '' };
      const parsed = parseDateFromVoice(trimmed);
      if (!parsed) return { valid: false, cleaned: trimmed, error: 'Could not understand the date. Please say day, month, year.' };
      const date = new Date(parsed);
      if (isNaN(date.getTime())) return { valid: false, cleaned: trimmed, error: 'Invalid date' };
      if (date > new Date()) return { valid: false, cleaned: trimmed, error: 'Date of birth cannot be in the future' };
      const ageYears = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000));
      if (ageYears > 120) return { valid: false, cleaned: trimmed, error: 'Date seems too far in the past' };
      return { valid: true, cleaned: parsed };
    }

    case 'age': {
      if (!trimmed || trimmed.toLowerCase() === 'skip') return { valid: true, cleaned: '' };
      let ageNum = parseInt(trimmed.replace(/\D/g, ''), 10);
      if (isNaN(ageNum)) {
        const lower = trimmed.toLowerCase();
        let sum = 0;
        let found = false;

        // Check if they said something like "two zero" for 20
        const digitMap: Record<string, string> = {
          'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
          'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'oh': '0', 'o': '0',
          'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पांच': '5', 'पाँच': '5',
          'छह': '6', 'छः': '6', 'सात': '7', 'आठ': '8', 'नौ': '9', 'दस': '10',
          'जीरो': '0', 'वन': '1', 'टू': '2', 'थ्री': '3', 'फोर': '4', 'फाइव': '5', 'फ़ाइव': '5',
          'सिक्स': '6', 'सेवन': '7', 'एट': '8', 'नाइन': '9', 'टेन': '10', 'ओ': '0'
        };
        const mappedDigits = lower.split(/[\s\-]+/).map(w => {
          const clean = w.replace(/[^\w\u0900-\u097F]/g, '');
          return digitMap[clean] || digitMap[w] || '';
        }).filter(Boolean);
        
        if (mappedDigits.length > 0 && mappedDigits.every(d => d.length <= 2)) {
          // They spoke individual digits like "two zero" or "दो शून्य"
          const parsedStr = mappedDigits.join('');
          if (parsedStr.length > 0) {
            ageNum = parseInt(parsedStr, 10);
            found = true;
          }
        }

        if (!found) {
          // Decades
          if (lower.includes('twenty') || lower.includes('बीस')) { sum += 20; found = true; }
          else if (lower.includes('thirty') || lower.includes('तीस')) { sum += 30; found = true; }
          else if (lower.includes('forty') || lower.includes('चालीस')) { sum += 40; found = true; }
          else if (lower.includes('fifty') || lower.includes('पचास')) { sum += 50; found = true; }
          else if (lower.includes('sixty') || lower.includes('साठ')) { sum += 60; found = true; }
          else if (lower.includes('seventy') || lower.includes('सत्तर')) { sum += 70; found = true; }
          else if (lower.includes('eighty') || lower.includes('अस्सी')) { sum += 80; found = true; }
          else if (lower.includes('ninety') || lower.includes('नब्बे')) { sum += 90; found = true; }
          
          // Singles / Teens
          const onesMap = [
            { words: ['nineteen', 'उन्नीस'], val: 19 },
            { words: ['eighteen', 'अठारह'], val: 18 },
            { words: ['seventeen', 'सत्रह'], val: 17 },
            { words: ['sixteen', 'सोलह'], val: 16 },
            { words: ['fifteen', 'पंद्रह', 'पन्द्रह'], val: 15 },
            { words: ['fourteen', 'चौदह'], val: 14 },
            { words: ['thirteen', 'तेरह'], val: 13 },
            { words: ['twelve', 'बारह'], val: 12 },
            { words: ['eleven', 'ग्यारह'], val: 11 },
            { words: ['ten', 'दस'], val: 10 },
            { words: ['nine', 'नौ'], val: 9 },
            { words: ['eight', 'आठ'], val: 8 },
            { words: ['seven', 'सात'], val: 7 },
            { words: ['six', 'छह', 'छः'], val: 6 },
            { words: ['five', 'पांच', 'पाँच'], val: 5 },
            { words: ['four', 'चार'], val: 4 },
            { words: ['three', 'तीन'], val: 3 },
            { words: ['two', 'दो'], val: 2 },
            { words: ['one', 'एक'], val: 1 },
          ];
          
          let addedOne = false;
          for (const o of onesMap) {
             if (o.words.some(w => lower.includes(w))) {
                if (!addedOne) {
                   sum += o.val;
                   found = true;
                   addedOne = true;
                }
             }
          }
          
          if (found) ageNum = sum;
        }
      }
      
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
        return { valid: false, cleaned: trimmed, error: 'Age must be between 0 and 120' };
      }
      return { valid: true, cleaned: String(ageNum) };
    }

    case 'gender': {
      const matched = matchEnum(trimmed, context?.enumValues || ['Male', 'Female', 'Other']);
      if (!matched) return { valid: false, cleaned: trimmed, error: 'Must be Male, Female, or Other' };
      return { valid: true, cleaned: matched };
    }

    case 'blood_group': {
      if (!trimmed || trimmed.toLowerCase() === 'skip') return { valid: true, cleaned: '' };
      const matched = matchBloodGroup(trimmed);
      if (!matched) return { valid: false, cleaned: trimmed, error: 'Must be a valid blood group (e.g. A+, B-, O+)' };
      return { valid: true, cleaned: matched };
    }

    case 'hospital': {
      if (!trimmed) return { valid: false, cleaned: '', error: 'Selection required' };
      const options = context?.listOptions || [];
      if (options.length > 0) {
        const matched = matchFromList(trimmed, options);
        if (!matched) return { valid: false, cleaned: trimmed, error: `No match found. Available options: ${options.join(', ')}` };
        return { valid: true, cleaned: matched };
      }
      return { valid: true, cleaned: trimmed };
    }

    case 'address':
    case 'emergency_contact_name': {
      if (!trimmed || trimmed.toLowerCase() === 'skip') return { valid: true, cleaned: '' };
      return { valid: true, cleaned: trimmed };
    }

    default:
      return { valid: true, cleaned: trimmed };
  }
}

// ─── Parsing helpers ───────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  january: '01', jan: '01', 'जनवरी': '01',
  february: '02', feb: '02', 'फ़रवरी': '02', 'फरवरी': '02',
  march: '03', mar: '03', 'मार्च': '03',
  april: '04', apr: '04', 'अप्रैल': '04',
  may: '05', 'मई': '05',
  june: '06', jun: '06', 'जून': '06',
  july: '07', jul: '07', 'जुलाई': '07',
  august: '08', aug: '08', 'अगस्त': '08',
  september: '09', sep: '09', sept: '09', 'सितंबर': '09', 'सितम्बर': '09',
  october: '10', oct: '10', 'अक्टूबर': '10', 'अक्तूबर': '10',
  november: '11', nov: '11', 'नवंबर': '11', 'नवम्बर': '11',
  december: '12', dec: '12', 'दिसंबर': '12', 'दिसम्बर': '12',
};

/**
 * Parse a date from voice input. Supports formats like:
 * "15 March 1990", "15/03/1990", "15-03-1990", "March 15 1990"
 * Returns ISO date string (yyyy-mm-dd) or null.
 */
export function parseDateFromVoice(input: string): string | null {
  const cleaned = input.trim().toLowerCase();

  // Try dd/mm/yyyy or dd-mm-yyyy
  const slashMatch = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // Try "15 March 1990" or "15 march 1990"
  const dayMonthYear = cleaned.match(/(\d{1,2})\s+([a-zà-ÿ\u0900-\u097F]+)\s+(\d{4})/);
  if (dayMonthYear) {
    const [, dd, monthStr, yyyy] = dayMonthYear;
    const mm = MONTH_MAP[monthStr];
    if (mm) return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
  }

  // Try "March 15, 1990" or "March 15 1990"
  const monthDayYear = cleaned.match(/([a-zà-ÿ\u0900-\u097F]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthDayYear) {
    const [, monthStr, dd, yyyy] = monthDayYear;
    const mm = MONTH_MAP[monthStr];
    if (mm) return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
  }

  // Try plain digits: ddmmyyyy
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 8) {
    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yyyy = digits.slice(4);
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

/**
 * Derive age from a confirmed DOB.
 */
export function deriveAgeFromDOB(isoDate: string): string {
  const dob = new Date(isoDate);
  if (isNaN(dob.getTime())) return '';
  const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
  return String(age);
}

/**
 * Spoken/typed number words → position, including the common Indian-English
 * STT misrecognitions of the short number words. Indian-English speech
 * recognition very frequently transcribes spoken "one" as "when", "won",
 * "van" or "wan"; "two" as "to"/"too"; "three" as "tree"/"free"; etc. Because
 * list/enum selection asks the user to "say the number or name", we accept
 * these homophones so a clear "one" isn't rejected.
 */
const NUMBER_WORDS: Record<string, number> = {
  // English number words
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  // English ordinals
  'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
  'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
  // Common STT homophones / misrecognitions of the short number words
  'won': 1, 'when': 1, 'van': 1, 'wan': 1, 'juan': 1, 'wun': 1, 'whan': 1,
  'to': 2, 'too': 2, 'tu': 2, 'tou': 2,
  'tree': 3, 'free': 3, 'thri': 3, 'thee': 3,
  'for': 4, 'fore': 4, 'foar': 4,
  'ate': 8,
  // Romanised Hindi
  'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
  // Devanagari Hindi words
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5,
  // Devanagari digits
  '१': 1, '२': 2, '३': 3, '४': 4, '५': 5,
};

/**
 * Parse a spoken/typed selection into a 1-based number, tolerating trailing
 * punctuation (STT often appends "?" or "."), digit input, spelled-out words
 * and common homophones. Returns null when no number can be found.
 */
function wordToNumber(text: string): number | null {
  // Direct integer ("1", "2", …)
  const direct = parseInt(text.trim(), 10);
  if (!isNaN(direct)) return direct;

  // Word-based — strip punctuation off each token, first match wins.
  const words = text.toLowerCase().split(/\s+/);
  for (const raw of words) {
    const w = raw.replace(/[.,?!।॥]/g, '');
    if (NUMBER_WORDS[w]) return NUMBER_WORDS[w];
  }
  return null;
}

/**
 * Match a spoken value against an enum list using fuzzy matching.
 */
function matchEnum(input: string, values: string[]): string | null {
  const lower = input.toLowerCase().trim();
  
  // Exact match (case-insensitive)
  const exact = values.find(v => v.toLowerCase() === lower);
  if (exact) return exact;

  // Partial / starts-with match
  const partial = values.find(v => v.toLowerCase().startsWith(lower) || lower.startsWith(v.toLowerCase()));
  if (partial) return partial;

  // Number-based selection: "1", "two", "when" (STT for "one"), etc.
  const num = wordToNumber(lower);
  if (num !== null && num >= 1 && num <= values.length) {
    return values[num - 1];
  }

  // Hindi gender mappings + STT phonetic variants.
  // en-IN STT commonly transcribes spoken "male" as "mail" (homophones in Indian English).
  const hindiMap: Record<string, string> = {
    'पुरुष': 'Male', 'पुरुस': 'Male', 'male': 'Male', 'man': 'Male',
    'mail': 'Male', 'maile': 'Male', 'mayle': 'Male', 'mael': 'Male', 'mel': 'Male',
    'महिला': 'Female', 'female': 'Female', 'woman': 'Female', 'lady': 'Female',
    'femail': 'Female', 'femaile': 'Female',
    'अन्य': 'Other', 'other': 'Other',
  };
  if (hindiMap[lower] && values.includes(hindiMap[lower])) return hindiMap[lower];

  return null;
}

/**
 * Match a spoken blood group to a standard value.
 */
function matchBloodGroup(input: string): string | null {
  const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const cleaned = input.toUpperCase().replace(/\s+/g, '');
  
  // Direct match
  if (validGroups.includes(cleaned)) return cleaned;

  // Voice-friendly mappings
  const voiceMap: Record<string, string> = {
    'A POSITIVE': 'A+', 'A POS': 'A+', 'A PLUS': 'A+',
    'A NEGATIVE': 'A-', 'A NEG': 'A-', 'A MINUS': 'A-',
    'B POSITIVE': 'B+', 'B POS': 'B+', 'B PLUS': 'B+',
    'B NEGATIVE': 'B-', 'B NEG': 'B-', 'B MINUS': 'B-',
    'AB POSITIVE': 'AB+', 'AB POS': 'AB+', 'AB PLUS': 'AB+',
    'AB NEGATIVE': 'AB-', 'AB NEG': 'AB-', 'AB MINUS': 'AB-',
    'O POSITIVE': 'O+', 'O POS': 'O+', 'O PLUS': 'O+',
    'O NEGATIVE': 'O-', 'O NEG': 'O-', 'O MINUS': 'O-',
    'BE POSITIVE': 'B+', 'BE POS': 'B+', 'BE PLUS': 'B+',
    'BE NEGATIVE': 'B-', 'BE NEG': 'B-', 'BE MINUS': 'B-',
    'OH POSITIVE': 'O+', 'ZERO POSITIVE': 'O+',
    'OH NEGATIVE': 'O-', 'ZERO NEGATIVE': 'O-',
  };

  const upper = input.toUpperCase().trim().replace(/[.,?!।]/g, '');
  if (voiceMap[upper]) return voiceMap[upper];
  
  // Try checking if any part of the phrase exactly matches a key
  for (const [key, value] of Object.entries(voiceMap)) {
    if (upper.includes(key)) return value;
  }

  // Number-based selection
  const num = parseInt(input.trim(), 10);
  if (!isNaN(num) && num >= 1 && num <= 8) return validGroups[num - 1];

  return null;
}

/**
 * Match a spoken value against a list using fuzzy matching.
 * Supports name matching and number-based selection.
 */
function matchFromList(input: string, options: string[]): string | null {
  const lower = input.toLowerCase().trim();

  // Exact match
  const exact = options.find(o => o.toLowerCase() === lower);
  if (exact) return exact;

  // Starts-with or contains
  const startsWith = options.find(o => o.toLowerCase().startsWith(lower));
  if (startsWith) return startsWith;

  const contains = options.find(o => o.toLowerCase().includes(lower) || lower.includes(o.toLowerCase()));
  if (contains) return contains;

  // Number-based selection (digits, spelled-out words, or STT homophones
  // like "when"/"won"/"van" for "one")
  const num = wordToNumber(lower);
  if (num !== null && num >= 1 && num <= options.length) {
    return options[num - 1];
  }

  return null;
}

// ─── Intent detection (skip / yes / no) ─────────────────────────────────────────
//
// The previous implementation split on whitespace and matched whole words against
// a Set. That silently broke for multi-word confirmations ("sahi hai", "theek hai",
// "बाद में") and for any punctuation the STT engine appended. This caused the
// confirmation short-circuit to fail, sending the dialogue into long retry loops.
//
// The matcher below:
//   1. force-lowercases the text,
//   2. strips ALL punctuation (periods, commas, danda, etc.) while preserving
//      Latin, digits and Devanagari letters,
//   3. matches single-word tokens by exact word and multi-word tokens by phrase.

/**
 * Normalise spoken text for intent matching: lowercase, strip punctuation
 * (including the Hindi danda ।/॥), collapse whitespace.
 */
function normalizeIntentText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[।॥]/g, ' ')         // Hindi danda / double danda
    .replace(/[^\w\sऀ-ॿ]/g, ' ')   // strip punctuation, keep latin/digits/Devanagari
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if the (normalised) text contains any of the given intent tokens.
 * Tokens containing a space are matched as phrases (substring of the normalised
 * text); single-word tokens are matched as whole words to avoid false positives.
 */
function matchesIntent(text: string, tokens: string[]): boolean {
  const norm = normalizeIntentText(text);
  if (!norm) return false;
  const wordSet = new Set(norm.split(' '));
  for (const token of tokens) {
    if (token.includes(' ')) {
      if (norm.includes(token)) return true;
    } else if (wordSet.has(token)) {
      return true;
    }
  }
  return false;
}

// ─── Skip detection ────────────────────────────────────────────────────────────

const SKIP_TOKENS = [
  // English
  'skip', 'none', 'dismiss', 'leave', 'pass', 'later', 'not now',
  // Hindi (Devanagari)
  'छोड़ें', 'छोड़ो', 'छोड़', 'बाद में', 'नहीं', 'ना',
  // Hindi (romanised)
  'chhodo', 'chhod', 'chhodna', 'nahi', 'nahin', 'baad mein',
];

export function isSkipIntent(text: string): boolean {
  return matchesIntent(text, SKIP_TOKENS);
}

// ─── Confirmation detection ────────────────────────────────────────────────────

const YES_TOKENS = [
  // English
  'yes', 'yeah', 'yep', 'yup', 'ya', 'yo', 'sure', 'correct', 'right',
  'confirm', 'confirmed', 'ok', 'okay', 'okey', 'fine', 'good',
  'absolutely', 'definitely', 'go ahead', 'of course',
  'that is right', 'thats right', 'that is correct', 'thats correct',
  // Hindi (Devanagari)
  'हाँ', 'हां', 'जी', 'जी हाँ', 'जी हां', 'हाँजी', 'सही', 'सही है',
  'ठीक', 'ठीक है', 'बिलकुल', 'सच',
  // Hindi (romanised)
  'haan', 'haa', 'ha', 'hanji', 'haan ji', 'ji', 'ji haan', 'ji haa',
  'sahi', 'sahi hai', 'theek', 'theek hai', 'thik', 'thik hai', 'bilkul',
];

const NO_TOKENS = [
  // English
  'no', 'nope', 'nah', 'naw', 'wrong', 'incorrect', 'not correct',
  'not right', 'change', 'retry', 'again', 'try again',
  // Hindi (Devanagari)
  'नहीं', 'ना', 'गलत', 'गलत है', 'बदलो', 'बदलें', 'दुबारा',
  // Hindi (romanised)
  'nahi', 'nahin', 'na', 'galat', 'galat hai', 'badlo', 'dubara',
];

export function isYes(text: string): boolean {
  return matchesIntent(text, YES_TOKENS);
}

export function isNo(text: string): boolean {
  return matchesIntent(text, NO_TOKENS);
}
