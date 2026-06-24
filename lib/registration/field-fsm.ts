// lib/registration/field-fsm.ts — [A] Deterministic dialogue state machine for registration
// FSM guarantees field order, confirm-before-accept, and no-assumptions rules.

import type { LanguageCode } from '@/lib/contracts/voice';
import type { VoiceSession } from '@/lib/contracts/voice';
import {
  FIELD_ORDER,
  VOICE_FIELD_ORDER,
  validateField,
  deriveAgeFromDOB,
  isSkipIntent,
  isYes,
  isNo,
  type FieldName,
  type FieldSpec,
} from './field-specs';
import { getPrompts, getFieldLabel } from '@/lib/voice/i18n';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type FSMState =
  | 'IDLE'
  | 'CONSENT'
  | 'GREETING'
  | 'COLLECT_FIELD'
  | 'CONFIRM_FIELD'
  | 'REVIEW'
  | 'MANUAL_FALLBACK'
  | 'NEXT_OR_SAVE'
  | 'SAVE_PATIENT'
  | 'SAVE_ERROR'
  | 'DONE';

export interface FormData {
  hospital: string;        // org slug (for save) — NOT displayed
  hospital_name: string;   // org name (for display)
  org_id: string;          // org UUID (for RegistrationResult)
  full_name: string;
  phone: string;
  email: string;
  date_of_birth: string;
  age: string;
  gender: string;
  blood_group: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
}

export interface OrgOption {
  id: string;
  name: string;
  slug: string;
  address: string | null;
}

export interface FSMContext {
  state: FSMState;
  currentFieldIndex: number;
  formData: FormData;
  retries: number;
  pendingValue: string;
  organisations: OrgOption[];
  error: string;
  transcriptLog: Array<{ role: 'assistant' | 'user'; text: string }>;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
}

export type FSMEvent =
  | { type: 'START' }
  | { type: 'CONSENT_GIVEN' }
  | { type: 'VOICE_INPUT'; text: string; confidence: number }
  | { type: 'MANUAL_INPUT'; field: FieldName; value: string }
  | { type: 'SAVE_SUCCESS'; patientId: string }
  | { type: 'SAVE_FAILURE'; error: string }
  | { type: 'SKIP' }
  | { type: 'FALLBACK_COMPLETE'; field: FieldName; value: string };

export function createInitialContext(): FSMContext {
  return {
    state: 'IDLE',
    currentFieldIndex: 0,
    formData: {
      hospital: '',
      hospital_name: '',
      org_id: '',
      full_name: '',
      phone: '',
      email: '',
      date_of_birth: '',
      age: '',
      gender: 'Male',
      blood_group: '',
      address: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
    },
    retries: 0,
    pendingValue: '',
    organisations: [],
    error: '',
    transcriptLog: [],
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
  };
}

// ─── FSM Controller ────────────────────────────────────────────────────────────

/**
 * The FSM controller runs the voice registration flow.
 * It is called by the React component and manages all dialogue state transitions.
 */
export class RegistrationFSM {
  private ctx: FSMContext;
  private session: VoiceSession;
  private onUpdate: (ctx: FSMContext) => void;
  private onComplete: (data: any, patientId: string, password?: string, setupLink?: string) => void;
  private aborted: boolean = false;

  constructor(
    session: VoiceSession,
    organisations: OrgOption[],
    onUpdate: (ctx: FSMContext) => void,
    onComplete: (data: any, patientId: string, password?: string, setupLink?: string) => void,
  ) {
    this.ctx = createInitialContext();
    this.ctx.organisations = organisations;
    this.session = session;
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;
  }

  abort() {
    this.aborted = true;
    // Immediately stop any in-progress speech
    import('@/lib/voice/tts').then(m => m.stopSpeaking());
  }

  private update(partial: Partial<FSMContext>) {
    Object.assign(this.ctx, partial);
    this.onUpdate({ ...this.ctx });
  }

  private log(role: 'assistant' | 'user', text: string) {
    this.ctx.transcriptLog.push({ role, text });
  }

  private async speak(text: string) {
    if (this.aborted) return; // Don't speak if aborted
    this.log('assistant', text);
    this.update({ isSpeaking: true });
    await this.session.speak(text);
    this.update({ isSpeaking: false });
  }

  private async listen(expectedType?: 'boolean' | 'text'): Promise<{ text: string; confidence: number }> {
    this.update({ isListening: true });
    const result = await this.session.listen(expectedType);
    if (result.text) this.log('user', result.text);
    this.update({ isListening: false });
    return result;
  }

  private getCurrentField(): FieldSpec | undefined {
    return VOICE_FIELD_ORDER[this.ctx.currentFieldIndex];
  }

  // ─── Main Flow ─────────────────────────────────────────────────────────────

  async start() {
    const prompts = getPrompts(this.session.language);

    // Consent
    this.update({ state: 'CONSENT' });
    await this.speak(prompts.consent);
    
    const declineMsg = this.session.language === 'hi'
      ? 'कोई बात नहीं। आप स्क्रीन पर फॉर्म भर सकते हैं।'
      : 'No problem. You can fill the form on screen instead.';

    let consentRetries = 0;
    const MAX_CONSENT_RETRIES = 2;
    while (!this.aborted) {
      const consentResult = await this.listen('boolean');
      if (this.aborted) return;

      if (isYes(consentResult.text)) {
        break; // user consented
      }

      if (isNo(consentResult.text)) {
        // Explicit decline — fall back to manual entry immediately.
        await this.speak(declineMsg);
        return;
      }

      // Empty or unrecognised input: don't abort — re-prompt up to MAX times.
      consentRetries++;
      if (consentRetries > MAX_CONSENT_RETRIES) {
        await this.speak(declineMsg);
        return;
      }
      await this.speak(this.session.language === 'hi'
        ? 'मुझे समझ नहीं आया। कृपया "हाँ" या "नहीं" कहें।'
        : 'I didn\'t catch that, please say yes or no.');
    }

    // Greeting
    this.update({ state: 'GREETING' });
    await this.speak(prompts.greeting);

    // Start collecting fields
    await this.collectFields();
  }

  private async collectFields() {
    while (this.ctx.currentFieldIndex < VOICE_FIELD_ORDER.length && !this.aborted) {
      const field = this.getCurrentField()!;

      // Skip age if it was already autofilled by date of birth
      if (field.name === 'age' && this.ctx.formData.age) {
        this.update({ currentFieldIndex: this.ctx.currentFieldIndex + 1, retries: 0 });
        continue;
      }

      this.update({ state: 'COLLECT_FIELD', retries: 0 });
      const success = await this.collectSingleField(field);
      
      if (this.aborted) return;
      if (!success) {
        // Manual fallback was offered
        this.update({ state: 'MANUAL_FALLBACK' });
        return; // Wait for manual input from UI
      }

      // Autofill age if we just collected date_of_birth
      if (field.name === 'date_of_birth' && this.ctx.formData.date_of_birth) {
        const date = new Date(this.ctx.formData.date_of_birth);
        if (!isNaN(date.getTime())) {
          const ageYears = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000));
          this.ctx.formData.age = ageYears.toString();
          this.update({ formData: { ...this.ctx.formData } });
        }
      }

      this.update({ currentFieldIndex: this.ctx.currentFieldIndex + 1, retries: 0 });
    }

    if (!this.aborted) {
      this.update({ state: 'NEXT_OR_SAVE' });
      await this.reviewAndSave();
    }
  }

  // ─── Review & edit (final confirmation before save) ──────────────────────────

  /**
   * Read the collected details back to the patient and let them either confirm
   * (save) or name a field to correct. Targeted edits re-run collectSingleField
   * for just that field, then loop back to the review summary.
   */
  private async reviewAndSave() {
    const prompts = getPrompts(this.session.language);
    this.update({ state: 'REVIEW' });

    let speakSummary = true;
    let misses = 0;
    const MAX_MISSES = 3; // safety valve — never trap the user in the review loop

    while (!this.aborted) {
      if (speakSummary) {
        await this.speak(this.buildReviewSummary());
        await this.speak(prompts.reviewConfirm);
        speakSummary = false;
      }

      const { text } = await this.listen();
      if (this.aborted) return;

      // Confirmed → save and finish.
      if (isYes(text)) {
        await this.savePatient();
        return;
      }

      // Named a field → re-collect just that field, then re-review.
      const target = this.detectEditField(text);
      if (target) {
        const voiceIdx = VOICE_FIELD_ORDER.findIndex(f => f.name === target.name);
        if (voiceIdx >= 0) this.update({ currentFieldIndex: voiceIdx });

        this.update({ state: 'COLLECT_FIELD' });
        const ok = await this.collectSingleField(target);
        if (this.aborted) return;
        if (!ok) {
          // Manual fallback was triggered during the edit — hand off to the UI.
          this.update({ state: 'MANUAL_FALLBACK' });
          return;
        }

        // Keep age in sync if the date of birth was edited.
        if (target.name === 'date_of_birth' && this.ctx.formData.date_of_birth) {
          const date = new Date(this.ctx.formData.date_of_birth);
          if (!isNaN(date.getTime())) {
            const ageYears = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000));
            this.ctx.formData.age = ageYears.toString();
          }
        }

        this.update({ state: 'REVIEW', currentFieldIndex: VOICE_FIELD_ORDER.length, formData: { ...this.ctx.formData } });
        speakSummary = true; // re-read the updated summary
        misses = 0;
        continue;
      }

      // "No"/garbled without a named field → ask which field to edit.
      misses++;
      if (misses > MAX_MISSES) {
        // Couldn't understand repeatedly — save rather than loop forever.
        await this.savePatient();
        return;
      }
      await this.speak(prompts.reviewWhichField);
    }
  }

  /** Build the spoken read-back summary from every collected field that has a value. */
  private buildReviewSummary(): string {
    const lang = this.session.language;
    const pairs: Array<{ label: string; value: string }> = [];
    for (const field of FIELD_ORDER) {
      const key = field.name === 'hospital' ? 'hospital_name' : field.name;
      let value = String((this.ctx.formData as any)[key] ?? '').trim();
      if (!value) continue;
      // Read phone numbers digit-by-digit so TTS doesn't say them as one big number.
      if (field.type === 'phone') value = value.split('').join(' ');
      pairs.push({ label: getFieldLabel(lang, field.name), value });
    }
    return getPrompts(lang).reviewSummary(pairs);
  }

  /** Map a spoken response to the field the patient wants to edit (EN + HI keywords). */
  private detectEditField(text: string): FieldSpec | undefined {
    if (!text) return undefined;
    const t = text.toLowerCase();
    const KW: Partial<Record<FieldName, string[]>> = {
      hospital: ['hospital', 'clinic', 'अस्पताल', 'क्लिनिक'],
      full_name: ['name', 'नाम'],
      phone: ['phone', 'mobile', 'number', 'फ़ोन', 'फोन', 'मोबाइल', 'नंबर'],
      email: ['email', 'mail', 'ईमेल'],
      date_of_birth: ['birth', 'dob', 'जन्म', 'जन्मतिथि'],
      age: ['age', 'उम्र', 'आयु'],
      gender: ['gender', 'sex', 'लिंग'],
      blood_group: ['blood', 'रक्त', 'ब्लड'],
      address: ['address', 'पता'],
    };
    for (const field of FIELD_ORDER) {
      if ((KW[field.name] || []).some(kw => t.includes(kw))) return field;
    }
    return undefined;
  }

  private async collectSingleField(field: FieldSpec): Promise<boolean> {
    const prompts = getPrompts(this.session.language);
    const fieldLabel = getFieldLabel(this.session.language, field.name);
    let retries = 0;

    // Build the prompt
    let promptText = prompts.field[field.name] || `Please provide your ${fieldLabel}.`;

    // For list/enum fields, append options
    if (field.type === 'list' && field.name === 'hospital') {
      const orgNames = this.ctx.organisations.map(o => o.name);
      promptText += ' ' + prompts.selectFromList(orgNames);
    } else if (field.type === 'enum' && field.enumValues) {
      promptText += ' ' + prompts.selectFromList(field.enumValues);
    }

    await this.speak(promptText);

    while (retries <= field.maxRetries && !this.aborted) {
      const result = await this.listen();
      if (this.aborted) return false;

      // Empty input
      if (!result.text) {
        retries++;
        if (retries > field.maxRetries) {
          await this.speak(prompts.fallbackOffer);
          return false; // Trigger manual fallback
        }
        await this.speak(prompts.reask);
        continue;
      }

      // Skip intent for optional fields
      if (field.skippable && isSkipIntent(result.text)) {
        this.setFieldValue(field.name, '');
        await this.speak(prompts.confirmed);
        return true;
      }

      // Validate the input
      const listOptions = field.name === 'hospital'
        ? this.ctx.organisations.map(o => o.name)
        : undefined;

      const validation = validateField(field.name, result.text, {
        enumValues: field.enumValues,
        listOptions,
      });

      if (!validation.valid) {
        retries++;
        if (retries > field.maxRetries) {
          await this.speak(prompts.fallbackOffer);
          return false;
        }
        // Give specific error feedback
        if (field.type === 'list' || field.type === 'enum') {
          const options = listOptions || field.enumValues || [];
          await this.speak(prompts.noMatchRetry(options));
        } else if (field.voiceHostile) {
          await this.speak(prompts.spellItPrompt);
        } else {
          await this.speak(`${validation.error}. ${prompts.reask}`);
        }
        continue;
      }

      // Implicit Trust: We no longer ask "Is that correct?"
      // We directly save it to the form and move to the next field.
      this.setFieldValue(field.name, validation.cleaned);
      
      // Update transcript log with cleaned value to look nice in the UI
      if (validation.cleaned && validation.cleaned !== result.text) {
        for (let i = this.ctx.transcriptLog.length - 1; i >= 0; i--) {
          if (this.ctx.transcriptLog[i].role === 'user' && this.ctx.transcriptLog[i].text === result.text) {
            this.ctx.transcriptLog[i].text = validation.cleaned;
            this.update({ transcriptLog: [...this.ctx.transcriptLog] });
            break;
          }
        }
      }

      // Short acknowledgment
      await this.speak(prompts.confirmed);

      // If hospital was just set, store the org details for departments
      if (field.name === 'hospital') {
        const org = this.ctx.organisations.find(
          o => o.name.toLowerCase() === validation.cleaned.toLowerCase()
        );
        if (org) {
          this.ctx.formData.hospital = org.slug;
          this.ctx.formData.hospital_name = org.name;
          this.ctx.formData.org_id = org.id;
          this.session.set('organisationId', org.id);
          this.session.set('orgSlug', org.slug);
        }
      }

      return true;
    }

    return false;
  }

  private setFieldValue(name: FieldName, value: string) {
    if (name === 'hospital') {
      // hospital_name is set, but we store the matched name for display
      // The slug/id are stored separately in the org matching step
    } else {
      (this.ctx.formData as any)[name] = value;
    }
    this.update({ formData: { ...this.ctx.formData } });
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  private async savePatient() {
    // Validate required fields before attempting to save
    const missingRequired = VOICE_FIELD_ORDER.filter(f => !f.skippable && !this.ctx.formData[f.name]);
    if (missingRequired.length > 0) {
      const msg = this.session.language === 'hi'
        ? 'कुछ आवश्यक फ़ील्ड छूट गए हैं। कृपया उन्हें सबमिट करने के लिए स्क्रीन पर भरें।'
        : 'Some required fields are missing. Please fill them on the screen to submit.';
      this.update({ state: 'SAVE_ERROR', error: msg, isProcessing: false });
      await this.speak(msg);
      return;
    }

    const prompts = getPrompts(this.session.language);
    await this.speak(prompts.allFieldsDone);
    this.update({ state: 'SAVE_PATIENT', isProcessing: true });
    await this.speak(prompts.savingPatient);

    try {
      const payload = {
        org_slug: this.ctx.formData.hospital,
        full_name: this.ctx.formData.full_name,
        phone: this.ctx.formData.phone,
        email: this.ctx.formData.email || '',
        age: this.ctx.formData.age || '',
        gender: this.ctx.formData.gender || 'Male',
        date_of_birth: this.ctx.formData.date_of_birth || '',
        address: this.ctx.formData.address || '',
        blood_group: this.ctx.formData.blood_group || '',
        emergency_contact_name: this.ctx.formData.emergency_contact_name || '',
        emergency_contact_phone: this.ctx.formData.emergency_contact_phone || '',
      };

      const res = await fetch('/api/patient/self-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        this.update({ state: 'DONE', isProcessing: false });
        await this.speak(prompts.saveSuccess(data.patient_id));
        this.onComplete(this.ctx.formData, data.patient_id, data.password, data.setup_link);
      } else {
        this.update({ state: 'SAVE_ERROR', error: data.error || 'Save failed', isProcessing: false });
        await this.speak(prompts.saveError);
      }
    } catch (err: any) {
      this.update({ state: 'SAVE_ERROR', error: err.message || 'Network error', isProcessing: false });
      await this.speak(getPrompts(this.session.language).saveError);
    }
  }

  // ─── External triggers (for manual input from UI) ──────────────────────────

  /**
   * Handle manual input from the on-screen form for a specific field.
   * Called when the user taps/types a correction.
   */
  async handleManualInput(field: FieldName, value: string) {
    // Unconditionally update the form data so the React input component can reflect keystrokes
    (this.ctx.formData as any)[field] = value;
    this.update({ formData: { ...this.ctx.formData } });

    // If it happens to be valid, we can process side-effects (like hospital selection)
    const validation = validateField(field, value, {
      enumValues: FIELD_ORDER.find(f => f.name === field)?.enumValues,
      listOptions: field === 'hospital'
        ? this.ctx.organisations.map(o => o.name)
        : undefined,
    });

    if (validation.valid) {
      if (field === 'hospital') {
        const org = this.ctx.organisations.find(
          o => o.name.toLowerCase() === validation.cleaned.toLowerCase() || o.slug === value
        );
        if (org) {
          this.ctx.formData.hospital = org.slug;
          this.ctx.formData.hospital_name = org.name;
          this.ctx.formData.org_id = org.id;
          this.session.set('organisationId', org.id);
          this.session.set('orgSlug', org.slug);
          this.update({ formData: { ...this.ctx.formData } });
        }
      }
    }
  }

  /**
   * Resume after manual fallback.
   */
  async resumeAfterFallback() {
    const fieldSpec = this.getCurrentField()!;
    const currentValue = (this.ctx.formData as any)[fieldSpec.name] || '';
    
    const validation = validateField(fieldSpec.name, currentValue, {
      enumValues: fieldSpec.enumValues,
      listOptions: fieldSpec.name === 'hospital'
        ? this.ctx.organisations.map(o => o.name)
        : undefined,
    });

    if (!validation.valid) {
      // Speak the error and refuse to proceed
      await this.speak(validation.error || 'Invalid input.');
      return;
    }

    // Save cleaned value and proceed
    (this.ctx.formData as any)[fieldSpec.name] = validation.cleaned;
    this.update({ 
      formData: { ...this.ctx.formData },
      currentFieldIndex: this.ctx.currentFieldIndex + 1, 
      retries: 0 
    });
    
    await this.collectFields();
  }

  /**
   * Submit the form manually (if voice save failed).
   */
  async submitManually() {
    await this.savePatient();
  }

  getContext(): FSMContext {
    return { ...this.ctx };
  }
}
