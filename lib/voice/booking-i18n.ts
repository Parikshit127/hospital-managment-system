// lib/voice/booking-i18n.ts — [B] Voice prompt strings for the BOOKING flow (EN/HI)
//
// Mirrors the structure of lib/voice/i18n.ts (the registration flow), but for
// the appointment-booking voice assistant in
// app/patient/appointment/voice/VoiceBookingClient.tsx.
//
// Dynamic proper nouns (specialty names, doctor names, dates, times) are
// interpolated verbatim — for Hindi we wrap them in Hindi sentence structure
// rather than translating the nouns, which is how code-switched medical Hindi
// is naturally spoken in Indian clinics.

import type { LanguageCode } from '@/lib/contracts/voice';

export interface BookingPrompts {
  // Step 3 — symptoms
  welcome: (firstName: string) => string;
  symptomRetry: string;
  analysing: string;
  emergency: string;
  /** reasoning comes from the NLU API (already localised when language is passed);
   *  departmentList is a comma-joined string of specialty names (may be empty). */
  lowConfidence: (reasoning: string, departmentList: string) => string;
  routingToSpecialty: (specialty: string) => string;   // high-confidence auto-route
  lookingForSpecialist: (specialty: string) => string; // department picker tap
  symptomError: string;

  // Step 4 — doctors
  noDoctorsRetryGeneral: (specialty: string) => string;
  noDoctorsAtAll: string;
  /** Display text used for the SET_ERROR error card (not spoken). */
  noDoctorsErrorDisplay: string;
  doctorLabel: (index: number, name: string, specialty: string) => string;
  doctorList: (count: number, doctorList: string) => string;
  doctorRetry: string;
  doctorTapFallback: string;
  doctorFetchError: string;

  // Step 4.5 — date
  datePrompt: (doctorName: string) => string;
  dateRetry: string;
  dateSelected: (friendlyDate: string) => string;

  // Step 5 — slots
  noSlotsNextDate: (date: string, nextDate: string) => string;
  noSlots7Days: (doctorName: string) => string;
  slotLabel: (index: number, time: string) => string;
  slotList: (date: string, slotList: string) => string;
  slotNotAvailable: string;
  slotRetry: string;
  slotFetchError: string;

  // Step 6 — confirmation & booking
  confirmReadback: (doctorName: string, specialty: string, date: string, time: string) => string;
  confirmRetry: string;
  bookingConfirming: string;
  bookingDeclined: string;
  confirmExhausted: string;
  slotTaken: string;
  bookingError: (message: string) => string;
  bookingSuccess: (appointmentId: string) => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// English
// ─────────────────────────────────────────────────────────────────────────────

const EN: BookingPrompts = {
  welcome: (firstName) =>
    `Hello ${firstName}! I'm your AI booking assistant. Please describe your symptoms, and I'll find the right doctor for you.`,
  symptomRetry: 'I didn\'t catch that. Could you please describe your symptoms?',
  analysing: 'Got it. Let me analyse your symptoms…',
  emergency:
    'I have detected emergency symptoms in what you described. Please call 108 or go to the nearest emergency room immediately.',
  lowConfidence: (reasoning, departmentList) =>
    `${reasoning} Could you describe your symptoms in a bit more detail, or please tap a department from the list below to continue.`
    + (departmentList ? ` Available departments include: ${departmentList}.` : ''),
  routingToSpecialty: (specialty) => `Based on your symptoms, I'll look for a ${specialty} specialist.`,
  lookingForSpecialist: (specialty) => `Looking for a ${specialty} specialist.`,
  symptomError: 'I had trouble analysing your symptoms. Please try again.',

  noDoctorsRetryGeneral: (specialty) =>
    `I couldn't find any ${specialty} doctors available right now. Let me look for a General Medicine doctor.`,
  noDoctorsAtAll: 'No doctors are available at this time. Please try again later or call the reception.',
  noDoctorsErrorDisplay: 'No doctors available. Please contact reception.',
  doctorLabel: (index, name, specialty) => `Doctor ${index}: Doctor ${name}, ${specialty}`,
  doctorList: (count, doctorList) =>
    `I found ${count} doctor${count > 1 ? 's' : ''}. ${doctorList}. Please tap a doctor card to select, or say the doctor number.`,
  doctorRetry: 'I didn\'t catch that. Please say the doctor\'s name or number.',
  doctorTapFallback: 'Please tap a doctor card to make your selection.',
  doctorFetchError: 'I had trouble fetching available doctors. Please try again.',

  datePrompt: (doctorName) =>
    `Great choice! Doctor ${doctorName}. What date would you like to book? You can say a specific date like 25 June, or say today or tomorrow.`,
  dateRetry: 'I didn\'t catch that. Please say a date like 25 June, or pick one below.',
  dateSelected: (friendlyDate) => `Got it, ${friendlyDate}. Let me check available slots.`,

  noSlotsNextDate: (date, nextDate) =>
    `No slots available for ${date}. The next available date is ${nextDate}. Tap the button to view those slots.`,
  noSlots7Days: (doctorName) =>
    `Dr. ${doctorName} has no available slots in the next 7 days. Please select a different doctor.`,
  slotLabel: (index, time) => `Slot ${index}: ${time}`,
  slotList: (date, slotList) =>
    `Here are the available slots for ${date}. ${slotList}. Please tap a slot or say the slot number.`,
  slotNotAvailable: 'That slot is not available. Please choose a different time slot.',
  slotRetry: 'I didn\'t catch that. Please say the slot number or time.',
  slotFetchError: 'I had trouble fetching available slots. Please try again.',

  confirmReadback: (doctorName, specialty, date, time) =>
    `Just to confirm: an appointment with Dr. ${doctorName}, ${specialty}, on ${date} at ${time}. `
    + 'Shall I confirm this booking? Say yes or no.',
  confirmRetry: 'Sorry, I didn\'t catch that. Shall I confirm this booking? Please say yes or no.',
  bookingConfirming: 'Great, confirming your booking now.',
  bookingDeclined: 'No problem. Please choose a different time slot.',
  confirmExhausted: 'I\'ll leave your selection on screen. Tap a slot to continue.',
  slotTaken: 'That slot was just taken. Let me fetch the updated availability.',
  bookingError: (message) =>
    `I'm sorry, there was an error: ${message}. Please try again or contact reception.`,
  bookingSuccess: (appointmentId) =>
    `Your appointment has been confirmed! Your appointment ID is ${appointmentId}.`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hindi
// ─────────────────────────────────────────────────────────────────────────────

const HI: BookingPrompts = {
  welcome: (firstName) =>
    `नमस्ते ${firstName}! मैं आपकी AI बुकिंग सहायक हूँ। कृपया अपने लक्षण बताएं, और मैं आपके लिए सही डॉक्टर ढूँढूँगी।`,
  symptomRetry: 'मैं ठीक से नहीं सुन पाई। क्या आप अपने लक्षण बता सकते हैं?',
  analysing: 'ठीक है। मुझे आपके लक्षणों का विश्लेषण करने दीजिए…',
  emergency:
    'आपके बताए लक्षणों में मुझे आपातकालीन संकेत मिले हैं। कृपया तुरंत 108 पर कॉल करें या नज़दीकी आपातकालीन कक्ष में जाएं।',
  lowConfidence: (reasoning, departmentList) =>
    `${reasoning} क्या आप अपने लक्षण थोड़ा और विस्तार से बता सकते हैं, या आगे बढ़ने के लिए नीचे दी गई सूची से कोई विभाग चुनें।`
    + (departmentList ? ` उपलब्ध विभाग हैं: ${departmentList}।` : ''),
  routingToSpecialty: (specialty) => `आपके लक्षणों के आधार पर, मैं ${specialty} विशेषज्ञ ढूँढती हूँ।`,
  lookingForSpecialist: (specialty) => `${specialty} विशेषज्ञ ढूँढ रही हूँ।`,
  symptomError: 'आपके लक्षणों का विश्लेषण करने में दिक्कत हुई। कृपया फिर से प्रयास करें।',

  noDoctorsRetryGeneral: (specialty) =>
    `इस समय कोई ${specialty} डॉक्टर उपलब्ध नहीं मिला। मैं जनरल मेडिसिन के डॉक्टर को ढूँढती हूँ।`,
  noDoctorsAtAll: 'इस समय कोई डॉक्टर उपलब्ध नहीं है। कृपया बाद में प्रयास करें या रिसेप्शन पर कॉल करें।',
  noDoctorsErrorDisplay: 'कोई डॉक्टर उपलब्ध नहीं है। कृपया रिसेप्शन से संपर्क करें।',
  doctorLabel: (index, name, specialty) => `डॉक्टर ${index}: डॉक्टर ${name}, ${specialty}`,
  doctorList: (count, doctorList) =>
    `मुझे ${count} डॉक्टर मिले। ${doctorList}। चुनने के लिए डॉक्टर कार्ड पर टैप करें, या डॉक्टर का नंबर बोलें।`,
  doctorRetry: 'मैं ठीक से नहीं सुन पाई। कृपया डॉक्टर का नाम या नंबर बोलें।',
  doctorTapFallback: 'कृपया अपना चयन करने के लिए किसी डॉक्टर कार्ड पर टैप करें।',
  doctorFetchError: 'उपलब्ध डॉक्टरों को लाने में दिक्कत हुई। कृपया फिर से प्रयास करें।',

  datePrompt: (doctorName) =>
    `बढ़िया चुनाव! डॉक्टर ${doctorName}। आप किस तारीख को बुक करना चाहेंगे? आप कोई तारीख बोल सकते हैं जैसे 25 जून, या आज या कल कह सकते हैं।`,
  dateRetry: 'मैं ठीक से नहीं सुन पाई। कृपया कोई तारीख बोलें जैसे 25 जून, या नीचे से कोई चुनें।',
  dateSelected: (friendlyDate) => `ठीक है, ${friendlyDate}। मुझे उपलब्ध स्लॉट जांचने दीजिए।`,

  noSlotsNextDate: (date, nextDate) =>
    `${date} के लिए कोई स्लॉट उपलब्ध नहीं है। अगली उपलब्ध तारीख ${nextDate} है। उन स्लॉट को देखने के लिए बटन पर टैप करें।`,
  noSlots7Days: (doctorName) =>
    `डॉक्टर ${doctorName} के पास अगले 7 दिनों में कोई स्लॉट उपलब्ध नहीं है। कृपया कोई दूसरा डॉक्टर चुनें।`,
  slotLabel: (index, time) => `स्लॉट ${index}: ${time}`,
  slotList: (date, slotList) =>
    `${date} के लिए उपलब्ध स्लॉट ये हैं। ${slotList}। कृपया किसी स्लॉट पर टैप करें या स्लॉट नंबर बोलें।`,
  slotNotAvailable: 'वह स्लॉट उपलब्ध नहीं है। कृपया कोई दूसरा समय स्लॉट चुनें।',
  slotRetry: 'मैं ठीक से नहीं सुन पाई। कृपया स्लॉट नंबर या समय बोलें।',
  slotFetchError: 'उपलब्ध स्लॉट लाने में दिक्कत हुई। कृपया फिर से प्रयास करें।',

  confirmReadback: (doctorName, specialty, date, time) =>
    `पुष्टि के लिए: डॉक्टर ${doctorName}, ${specialty} के साथ, ${date} को ${time} बजे अपॉइंटमेंट। `
    + 'क्या मैं यह बुकिंग पक्की कर दूँ? हाँ या नहीं कहें।',
  confirmRetry: 'माफ़ कीजिए, मैं ठीक से नहीं सुन पाई। क्या मैं यह बुकिंग पक्की कर दूँ? कृपया हाँ या नहीं कहें।',
  bookingConfirming: 'बढ़िया, मैं अभी आपकी बुकिंग पक्की कर रही हूँ।',
  bookingDeclined: 'कोई बात नहीं। कृपया कोई दूसरा समय स्लॉट चुनें।',
  confirmExhausted: 'मैं आपका चयन स्क्रीन पर छोड़ रही हूँ। आगे बढ़ने के लिए किसी स्लॉट पर टैप करें।',
  slotTaken: 'वह स्लॉट अभी-अभी किसी और ने ले लिया। मुझे ताज़ा उपलब्धता लाने दीजिए।',
  bookingError: (message) =>
    `मुझे खेद है, एक त्रुटि हुई: ${message}। कृपया फिर से प्रयास करें या रिसेप्शन से संपर्क करें।`,
  bookingSuccess: (appointmentId) =>
    `आपका अपॉइंटमेंट पक्का हो गया है! आपकी अपॉइंटमेंट आईडी ${appointmentId} है।`,
};

const BOOKING_PROMPTS: Record<LanguageCode, BookingPrompts> = { en: EN, hi: HI };

export function getBookingPrompts(lang: LanguageCode): BookingPrompts {
  return BOOKING_PROMPTS[lang] || BOOKING_PROMPTS.en;
}

// ─────────────────────────────────────────────────────────────────────────────
// Locale-aware spoken date/time formatting
// ─────────────────────────────────────────────────────────────────────────────

const DATE_LOCALE: Record<LanguageCode, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
};

/** Format an ISO date for speech in the patient's language (e.g. "Monday, 23 June"). */
export function formatDateSpoken(iso: string, lang: LanguageCode = 'en'): string {
  try {
    return new Date(iso).toLocaleDateString(DATE_LOCALE[lang] || 'en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

/** Format a "HH:MM" 24-hour time string as a spoken 12-hour time (e.g. "9:30 AM"). */
export function formatTimeSpoken(time: string): string {
  const [hourStr, min] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${min} ${period}`;
}
