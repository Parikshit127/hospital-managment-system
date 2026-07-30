// lib/voice/i18n.ts — [A] Voice prompt strings for EN/HI
import type { LanguageCode } from '@/lib/contracts/voice';

export interface VoicePrompts {
  // Greeting
  greeting: string;
  
  // Field prompts (keyed by field name)
  field: Record<string, string>;
  
  // Confirmation
  confirmValue: (field: string, value: string) => string;
  confirmed: string;
  rejected: string;
  reask: string;
  
  // Fallback
  fallbackOffer: string;
  manualFallback: string;
  
  // Voice-hostile field strategies
  spellItPrompt: string;
  readBackDigits: (digits: string) => string;
  readBackDate: (date: string) => string;
  
  // Enum/list prompts
  selectFromList: (options: string[]) => string;
  noMatchRetry: (options: string[]) => string;
  
  // Review & edit (final confirmation before save)
  reviewSummary: (pairs: Array<{ label: string; value: string }>) => string;
  reviewConfirm: string;
  reviewWhichField: string;

  // Completion
  allFieldsDone: string;
  savingPatient: string;
  saveSuccess: (patientId: string) => string;
  saveError: string;
  
  // Derived fields
  derivedAge: (age: string, dob: string) => string;
  
  // Skip optional
  skipPrompt: string;
}

function groupDigits(digits: string): string {
  // Add spaces between every digit so TTS reads them individually instead of as millions/lakhs
  return digits.split('').join(' ');
}

function formatDateForSpeech(isoDate: string, lang: LanguageCode): string {
  try {
    const d = new Date(isoDate);
    const months_en = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const months_hi = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
      'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
    const months = lang === 'hi' ? months_hi : months_en;
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return isoDate;
  }
}

const EN: VoicePrompts = {
  greeting: 'Welcome! I will help you register as a patient. I will ask you a few questions one by one. You can correct any answer at any time. Let\'s begin.',
  
  field: {
    hospital: 'Which hospital or clinic would you like to register at?',
    full_name: 'What is your full name?',
    phone: 'What is your 10-digit mobile phone number?',
    email: 'What is your email address?',
    date_of_birth: 'What is your date of birth? Please say it as day, month, year. For example, 15 March 1990.',
    age: 'What is your age in years?',
    gender: 'What is your gender?',
    blood_group: 'What is your blood group? You can say "skip" if you don\'t know.',
    address: 'What is your address? You can say "skip" to add it later.',
    emergency_contact_name: 'What is the name of your emergency contact person? You can say "skip".',
    emergency_contact_phone: 'What is the phone number of your emergency contact? You can say "skip".',
  },
  
  confirmValue: (field: string, value: string) => `I heard ${field} as: ${value}. Is that correct? Say "yes" to confirm or "no" to try again.`,
  confirmed: 'Got it!',
  rejected: 'No problem, let\'s try again.',
  reask: 'I didn\'t catch that clearly. Could you please repeat?',
  
  fallbackOffer: 'I\'m having trouble hearing that. Would you like to type it instead? You can use the form on screen.',
  manualFallback: 'Please type the value in the form on screen.',
  
  spellItPrompt: 'Could you spell that out letter by letter? Or you can type it on screen.',
  readBackDigits: (digits: string) => `The number I heard is: ${groupDigits(digits)}. Is that correct?`,
  readBackDate: (date: string) => `The date I heard is: ${formatDateForSpeech(date, 'en')}. Is that correct?`,
  
  selectFromList: (options: string[]) => {
    const numbered = options.map((o, i) => `${i + 1}: ${o}`).join(', ');
    return `Below are the options — ${numbered}. Say the number or name.`;
  },
  noMatchRetry: (options: string[]) => {
    const numbered = options.map((o, i) => `${i + 1}: ${o}`).join(', ');
    return `I didn't recognise that. Below are the options — ${numbered}. Say the number or name.`;
  },
  
  reviewSummary: (pairs) =>
    'Here is what I have. ' + pairs.map(p => `${p.label} is ${p.value}`).join('. ') + '.',
  reviewConfirm: 'Shall I save this registration? Say "yes" to confirm, or tell me which field you would like to change.',
  reviewWhichField: 'Which field would you like to edit? For example, say name, phone, age, or address.',

  allFieldsDone: 'All your details have been collected. Let me save your registration now.',
  savingPatient: 'Saving your registration, please wait...',
  saveSuccess: (patientId: string) => `Registration successful! Your patient ID is ${patientId}. Please save this ID.`,
  saveError: 'There was an error saving your registration. Please try again or use the form on screen to submit.',

  derivedAge: (age: string, dob: string) => `Based on your date of birth ${formatDateForSpeech(dob, 'en')}, your age is ${age} years. Is that correct?`,

  skipPrompt: 'Say "skip" to leave this field blank, or provide a value.',
};

const HI: VoicePrompts = {
  greeting: 'नमस्ते! मैं आपको मरीज़ के रूप में पंजीकृत करने में मदद करूँगी। मैं आपसे एक-एक करके कुछ सवाल पूछूँगी। आप किसी भी जवाब को कभी भी सही कर सकते हैं। चलिए शुरू करते हैं।',
  
  field: {
    hospital: 'आप किस अस्पताल या क्लिनिक में पंजीकरण करना चाहते हैं?',
    full_name: 'आपका पूरा नाम क्या है?',
    phone: 'आपका 10 अंकों का मोबाइल नंबर क्या है?',
    email: 'आपका ईमेल पता क्या है?',
    date_of_birth: 'आपकी जन्म तिथि क्या है? कृपया तारीख, महीना, साल बताएं। जैसे 15 मार्च 1990।',
    age: 'आपकी उम्र क्या है? वर्षों में बताएं।',
    gender: 'आपका लिंग क्या है?',
    blood_group: 'आपका रक्त समूह क्या है? अगर नहीं पता तो "छोड़ें" कहें।',
    address: 'आपका पता क्या है? बाद में जोड़ने के लिए "छोड़ें" कहें।',
    emergency_contact_name: 'आपके आपातकालीन संपर्क व्यक्ति का नाम क्या है? "छोड़ें" कह सकते हैं।',
    emergency_contact_phone: 'आपके आपातकालीन संपर्क का फ़ोन नंबर क्या है? "छोड़ें" कह सकते हैं।',
  },
  
  confirmValue: (field: string, value: string) => `मैंने ${field} सुना: ${value}। क्या यह सही है? पुष्टि के लिए "हाँ" कहें या दोबारा बताने के लिए "नहीं" कहें।`,
  confirmed: 'ठीक है!',
  rejected: 'कोई बात नहीं, फिर से बताएं।',
  reask: 'मैं ठीक से नहीं सुन पाई। कृपया दोबारा बताएं।',
  
  fallbackOffer: 'मुझे सुनने में दिक्कत हो रही है। क्या आप स्क्रीन पर टाइप करना चाहेंगे?',
  manualFallback: 'कृपया स्क्रीन पर फॉर्म में मान टाइप करें।',
  
  spellItPrompt: 'क्या आप एक-एक अक्षर बता सकते हैं? या स्क्रीन पर टाइप करें।',
  readBackDigits: (digits: string) => `मैंने जो नंबर सुना वह है: ${groupDigits(digits)}। क्या यह सही है?`,
  readBackDate: (date: string) => `मैंने जो तारीख सुनी वह है: ${formatDateForSpeech(date, 'hi')}। क्या यह सही है?`,
  
  selectFromList: (options: string[]) => {
    const numbered = options.map((o, i) => `${i + 1}: ${o}`).join(', ');
    return `नीचे विकल्प हैं — ${numbered}। नंबर या नाम बोलें।`;
  },
  noMatchRetry: (options: string[]) => {
    const numbered = options.map((o, i) => `${i + 1}: ${o}`).join(', ');
    return `मैं वह नहीं पहचान पाई। नीचे विकल्प हैं — ${numbered}। नंबर या नाम बोलें।`;
  },
  
  reviewSummary: (pairs) =>
    'मैंने यह जानकारी दर्ज की है। ' + pairs.map(p => `${p.label} ${p.value} है`).join('। ') + '।',
  reviewConfirm: 'क्या मैं यह पंजीकरण सहेज दूँ? पुष्टि के लिए "हाँ" कहें, या बताएं कि आप कौन सा विवरण बदलना चाहते हैं।',
  reviewWhichField: 'आप कौन सा विवरण बदलना चाहते हैं? जैसे नाम, फ़ोन, उम्र, या पता बोलें।',

  allFieldsDone: 'आपकी सभी जानकारी एकत्र हो गई है। अब मैं आपका पंजीकरण सहेज रही हूँ।',
  savingPatient: 'पंजीकरण सहेजा जा रहा है, कृपया प्रतीक्षा करें...',
  saveSuccess: (patientId: string) => `पंजीकरण सफल! आपकी मरीज़ आईडी ${patientId} है। कृपया इसे सहेजें।`,
  saveError: 'पंजीकरण सहेजने में त्रुटि हुई। कृपया पुनः प्रयास करें या स्क्रीन पर फॉर्म से सबमिट करें।',
  
  derivedAge: (age: string, dob: string) => `आपकी जन्म तिथि ${formatDateForSpeech(dob, 'hi')} के आधार पर, आपकी उम्र ${age} वर्ष है। क्या यह सही है?`,
  
  skipPrompt: 'इस फ़ील्ड को खाली छोड़ने के लिए "छोड़ें" कहें, या मान बताएं।',
};

const PROMPTS: Record<LanguageCode, VoicePrompts> = { en: EN, hi: HI };

export function getPrompts(lang: LanguageCode): VoicePrompts {
  return PROMPTS[lang] || PROMPTS.en;
}

// Friendly field labels for confirmation read-back
const FIELD_LABELS: Record<LanguageCode, Record<string, string>> = {
  en: {
    hospital: 'hospital',
    full_name: 'full name',
    phone: 'phone number',
    email: 'email',
    date_of_birth: 'date of birth',
    age: 'age',
    gender: 'gender',
    blood_group: 'blood group',
    address: 'address',
    emergency_contact_name: 'emergency contact name',
    emergency_contact_phone: 'emergency contact phone',
  },
  hi: {
    hospital: 'अस्पताल',
    full_name: 'पूरा नाम',
    phone: 'फ़ोन नंबर',
    email: 'ईमेल',
    date_of_birth: 'जन्म तिथि',
    age: 'उम्र',
    gender: 'लिंग',
    blood_group: 'रक्त समूह',
    address: 'पता',
    emergency_contact_name: 'आपातकालीन संपर्क नाम',
    emergency_contact_phone: 'आपातकालीन संपर्क फ़ोन',
  },
};

export function getFieldLabel(lang: LanguageCode, field: string): string {
  return FIELD_LABELS[lang]?.[field] ?? field;
}

// STT language codes for browser SpeechRecognition
export const STT_LANG_MAP: Record<LanguageCode, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
};

// TTS language/voice preferences
export const TTS_LANG_MAP: Record<LanguageCode, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
};
