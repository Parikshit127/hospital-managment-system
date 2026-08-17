'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import {
    UserPlus, CheckCircle, Phone,
    User, MapPin, Shield, Calendar, Loader2, Mail,
    AlertCircle, Heart, Users, FileCheck,
    Building2, CreditCard, FileText, GitMerge, CalendarPlus,
    Receipt, UserCheck, X, ShieldCheck
} from 'lucide-react';
import { registerPatient, checkDuplicatePatient } from '@/app/actions/register-patient';
import { lookupInsuranceByPhone } from '@/app/actions/insurance-lookup';
import { getCorporateMasters, getTpaProviders } from '@/app/actions/patient-type-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { useRouter } from 'next/navigation';
import ReferredBySelect from './ReferredBySelect';

type DuplicatePatient = {
    patient_id: string;
    full_name: string;
    phone: string | null;
    age: string | null;
    gender: string | null;
    department: string | null;
    date_of_birth: string | null;
    created_at: Date;
    patient_type?: string | null;
};

const PATIENT_TYPE_BADGE: Record<string, string> = {
    cash: 'bg-orange-100 text-orange-700',
    corporate: 'bg-blue-100 text-blue-700',
    tpa_insurance: 'bg-amber-100 text-amber-700',
};
const PATIENT_TYPE_LABEL: Record<string, string> = {
    cash: 'Cash',
    corporate: 'Corporate',
    tpa_insurance: 'TPA',
};

type CorporateItem = {
    id: string;
    company_name: string;
    company_code: string;
    discount_percentage: string | number;
};

type TpaProviderItem = {
    id: number;
    provider_name: string;
    provider_code: string;
    pre_auth_required: boolean;
    default_discount_percentage: string | number;
};

const PATIENT_TYPES = [
    { value: 'cash', label: 'Cash', color: 'teal' },
    { value: 'corporate', label: 'Corporate', color: 'blue' },
    { value: 'tpa_insurance', label: 'TPA / Insurance', color: 'amber' },
] as const;

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const RELATIONSHIPS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Other'] as const;

const COUNTRIES = [
    'India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
    'France', 'Japan', 'China', 'Singapore', 'UAE', 'Saudi Arabia', 'Kuwait',
    'Qatar', 'Bahrain', 'Oman', 'Bangladesh', 'Pakistan', 'Nepal', 'Sri Lanka',
    'Myanmar', 'Thailand', 'Malaysia', 'Indonesia', 'Philippines', 'South Africa',
    'Kenya', 'Nigeria', 'New Zealand', 'Ireland', 'Other',
];

const INDIA_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const INDIA_CITIES: Record<string, string[]> = {
    'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Kurnool', 'Nellore', 'Rajahmundry', 'Kakinada', 'Kadapa', 'Anantapur', 'Eluru', 'Ongole', 'Vizianagaram', 'Srikakulam', 'Chittoor'],
    'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat', 'Tezpur', 'Ziro'],
    'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur', 'Bongaigaon', 'Dhubri', 'Karimganj'],
    'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Arrah', 'Begusarai', 'Katihar', 'Munger', 'Chapra', 'Samastipur', 'Hajipur'],
    'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Rajnandgaon', 'Raigarh', 'Jagdalpur', 'Ambikapur'],
    'Goa': ['Panaji', 'Vasco da Gama', 'Margao', 'Mapusa', 'Ponda', 'Calangute', 'Bicholim'],
    'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand', 'Navsari', 'Mehsana', 'Morbi', 'Bharuch', 'Surendranagar', 'Amreli'],
    'Haryana': ['Faridabad', 'Gurugram', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak', 'Hisar', 'Karnal', 'Sonipat', 'Panchkula', 'Bhiwani', 'Sirsa', 'Bahadurgarh', 'Rewari'],
    'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Manali', 'Solan', 'Mandi', 'Nahan', 'Hamirpur', 'Una', 'Bilaspur', 'Palampur'],
    'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Hazaribagh', 'Giridih', 'Ramgarh', 'Phusro', 'Medininagar'],
    'Karnataka': ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru', 'Belagavi', 'Kalaburagi', 'Davanagere', 'Ballari', 'Vijayapura', 'Shivamogga', 'Tumkur', 'Udupi', 'Raichur', 'Bidar', 'Hassan'],
    'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha', 'Palakkad', 'Malappuram', 'Kottayam', 'Pathanamthitta', 'Idukki', 'Kasaragod'],
    'Madhya Pradesh': ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain', 'Sagar', 'Dewas', 'Ratlam', 'Rewa', 'Satna', 'Burhanpur', 'Singrauli', 'Chhindwara', 'Morena', 'Bhind'],
    'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur', 'Kolhapur', 'Amravati', 'Nanded', 'Sangli', 'Jalgaon', 'Akola', 'Latur', 'Dhule', 'Ahmednagar', 'Raigad', 'Ratnagiri', 'Navi Mumbai'],
    'Manipur': ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Kakching', 'Senapati'],
    'Meghalaya': ['Shillong', 'Tura', 'Jowai', 'Nongpoh', 'Baghmara'],
    'Mizoram': ['Aizawl', 'Lunglei', 'Champhai', 'Serchhip', 'Kolasib'],
    'Nagaland': ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha'],
    'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Brahmapur', 'Sambalpur', 'Puri', 'Balasore', 'Bhadrak', 'Baripada', 'Jharsuguda', 'Rayagada', 'Koraput'],
    'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Hoshiarpur', 'Pathankot', 'Moga', 'Firozpur', 'Sangrur', 'Fazilka'],
    'Rajasthan': ['Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer', 'Udaipur', 'Alwar', 'Bhilwara', 'Bharatpur', 'Sri Ganganagar', 'Sikar', 'Pali', 'Beawar', 'Hanumangarh'],
    'Sikkim': ['Gangtok', 'Namchi', 'Geyzing', 'Mangan', 'Soreng'],
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Vellore', 'Erode', 'Tiruppur', 'Thoothukudi', 'Ambattur', 'Avadi', 'Thanjavur', 'Dindigul', 'Kanchipuram', 'Cuddalore', 'Hosur'],
    'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Secunderabad', 'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Suryapet', 'Adilabad', 'Siddipet'],
    'Tripura': ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailasahar', 'Belonia'],
    'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj', 'Meerut', 'Noida', 'Ghaziabad', 'Bareilly', 'Aligarh', 'Moradabad', 'Gorakhpur', 'Saharanpur', 'Firozabad', 'Mathura', 'Muzaffarnagar', 'Jhansi', 'Hapur', 'Ayodhya', 'Shahjahanpur', 'Rampur', 'Loni'],
    'Uttarakhand': ['Dehradun', 'Haridwar', 'Roorkee', 'Nainital', 'Haldwani', 'Rudrapur', 'Rishikesh', 'Kashipur', 'Kotdwara', 'Pithoragarh'],
    'West Bengal': ['Kolkata', 'Howrah', 'Asansol', 'Siliguri', 'Durgapur', 'Bardhaman', 'Malda', 'Baranagar', 'Medinipur', 'Haldia', 'Krishnanagar', 'Baharampur', 'Jalpaiguri'],
    'Andaman and Nicobar Islands': ['Port Blair', 'Bamboo Flat', 'Garacharma'],
    'Chandigarh': ['Chandigarh'],
    'Dadra and Nagar Haveli and Daman and Diu': ['Daman', 'Diu', 'Silvassa'],
    'Delhi': ['New Delhi', 'Dwarka', 'Rohini', 'Saket', 'Janakpuri', 'Laxmi Nagar', 'Shahdara', 'Pitampura', 'Karol Bagh', 'Connaught Place', 'Nehru Place', 'Vasant Kunj', 'Mayur Vihar', 'Preet Vihar', 'Rajouri Garden'],
    'Jammu and Kashmir': ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Sopore', 'Kathua', 'Udhampur', 'Pulwama'],
    'Ladakh': ['Leh', 'Kargil'],
    'Lakshadweep': ['Kavaratti', 'Agatti', 'Amini'],
    'Puducherry': ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
};

function calculateAge(dob: string): string {
    if (!dob) return '';
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return String(Math.max(0, age));
}

export default function ReceptionPage() {
    const toast = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [duplicates, setDuplicates] = useState<DuplicatePatient[]>([]);
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
    const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
    const [dobValue, setDobValue] = useState('');      // ISO yyyy-mm-dd (submitted)
    const [dobText, setDobText] = useState('');         // dd/mm/yyyy (what the user sees)
    const [ageValue, setAgeValue] = useState('');
    // Optional fine-grained age for infants (kept separate from years)
    const [ageMonths, setAgeMonths] = useState('');
    const [ageDays, setAgeDays] = useState('');
    // Phase 1 — Patient Type
    const [patientType, setPatientType] = useState<'cash' | 'corporate' | 'tpa_insurance'>('cash');
    const [corporates, setCorporates] = useState<CorporateItem[]>([]);
    const [tpaProviders, setTpaProviders] = useState<TpaProviderItem[]>([]);
    const [selectedCorporate, setSelectedCorporate] = useState<CorporateItem | null>(null);
    const [isLookingUpInsurance, setIsLookingUpInsurance] = useState(false);
    const [insuranceFoundAlert, setInsuranceFoundAlert] = useState<string | null>(null);
    const [allowDuplicate, setAllowDuplicate] = useState(false);

    // Cascading address dropdowns
    const [selectedCountry, setSelectedCountry] = useState('India');
    const [selectedState, setSelectedState] = useState('');
    const [selectedCity, setSelectedCity] = useState('');
    const [customCity, setCustomCity] = useState('');

    // Load corporates + TPA providers on mount
    useEffect(() => {
        getCorporateMasters().then(r => {
            if (r.success) setCorporates(r.data as CorporateItem[]);
        });
        getTpaProviders().then(r => {
            if (r.success) setTpaProviders(r.data as TpaProviderItem[]);
        });
    }, []);

    // Duplicate detection on phone blur
    const handlePhoneBlur = useCallback(async (e: React.FocusEvent<HTMLInputElement>) => {
        const phone = e.target.value.replace(/[\s\-+]/g, '');
        if (phone.length < 10) {
            setDuplicates([]);
            setShowDuplicateWarning(false);
            return;
        }

        setIsCheckingDuplicate(true);
        const result = await checkDuplicatePatient(phone);
        setIsCheckingDuplicate(false);

        if (result.success && result.data.length > 0) {
            setDuplicates(result.data);
            setShowDuplicateWarning(true);
        } else {
            // Patient type (incl. TPA/insurance) is captured at admission, not registration.
            setDuplicates([]);
            setShowDuplicateWarning(false);
        }
    }, [checkDuplicatePatient]);

    const handlePhoneChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '').slice(0, 10);
        e.target.value = val;

        if (val.length === 10) {
            setIsCheckingDuplicate(true);
            const result = await checkDuplicatePatient(val);
            setIsCheckingDuplicate(false);

            if (result.success && result.data.length > 0) {
                setDuplicates(result.data);
                setShowDuplicateWarning(true);
            } else {
                setDuplicates([]);
                setShowDuplicateWarning(false);
            }
        } else {
            if (val.length < 10) {
                setDuplicates([]);
                setShowDuplicateWarning(false);
                setInsuranceFoundAlert(null);
                setAllowDuplicate(false);
            }
        }
    }, [checkDuplicatePatient]);

    // DOB → Age auto-calc
    // DOB is typed as dd/mm/yyyy (browser-independent). Auto-insert slashes, then derive
    // the ISO value (for submission) + age once a full valid date is entered.
    const handleDobChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 8); // ddmmyyyy
        let formatted = digits;
        if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
        else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
        setDobText(formatted);

        if (digits.length === 8) {
            const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4);
            const iso = `${yyyy}-${mm}-${dd}`;
            const d = new Date(iso);
            const valid = !isNaN(d.getTime()) && Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31 && d <= new Date();
            if (valid) {
                setDobValue(iso);
                setAgeValue(calculateAge(iso));
                return;
            }
        }
        setDobValue('');
    }, []);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);

        // --- Pre-submit duplicate guard ---
        // Always check on submit (catches cases where the on-change check was missed)
        if (!allowDuplicate) {
            const phoneVal = (formData.get('phone') as string || '').replace(/\D/g, '').slice(-10);
            if (phoneVal.length >= 10) {
                const dupResult = await checkDuplicatePatient(phoneVal);
                if (dupResult.success && dupResult.data.length > 0) {
                    setDuplicates(dupResult.data);
                    setShowDuplicateWarning(true);
                    setIsSubmitting(false);
                    return; // Block submission — let the user decide via the modal
                }
            }
        }

        if (allowDuplicate) {
            formData.set('allowDuplicate', 'true');
        }
        const result = await registerPatient(formData) as any;

        if (result.success) {
            // Stash registration metadata for the welcome banner on the profile.
            // sessionStorage avoids leaking the password setup link into the URL.
            try {
                sessionStorage.setItem('recent_registration', JSON.stringify({
                    patient_id: result.patient_id,
                    appointment_id: result.appointment_id ?? null,
                    password_setup_required: !!result.password_setup_required,
                    manual_password_setup_link: result.manual_password_setup_link ?? null,
                    user_type: result.user_type ?? null,
                    ts: Date.now(),
                }));
            } catch { /* sessionStorage unavailable — banner will still show without the setup link */ }

            setDuplicates([]);
            setShowDuplicateWarning(false);
            setAllowDuplicate(false);
            (event.target as HTMLFormElement).reset();
            setDobValue('');
            setDobText('');
            setAgeValue('');
            setAgeMonths('');
            setAgeDays('');
            setPatientType('cash');
            setSelectedCorporate(null);
            setSelectedCountry('India');
            setSelectedState('');
            setSelectedCity('');
            setCustomCity('');
            router.push(`/reception/patient/${result.patient_id}?welcome=1&tab=billing`);
            return;
        } else if (result.duplicate) {
            // Server blocked duplicate — show warning modal
            toast.error('Patient already registered with this phone number');
            setShowDuplicateWarning(true);
            // Re-fetch duplicates to show in modal
            const phone = formData.get('phone') as string;
            if (phone) {
                const dupResult = await checkDuplicatePatient(phone);
                if (dupResult.success && dupResult.data.length > 0) {
                    setDuplicates(dupResult.data);
                }
            }
        } else {
            toast.error(result.error || 'Registration failed');
        }
        setIsSubmitting(false);
    }

    const inputClass = "w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10 outline-none transition-all";
    const inputWithIconClass = `${inputClass} pl-11`;
    const labelClass = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1";
    const selectClass = `${inputClass} appearance-none`;

    return (
        <AppShell pageTitle="Patient Registration" pageIcon={<UserPlus className="h-5 w-5" />}>

            <div className="max-w-[1200px] mx-auto">
                {/* Page Title */}
                <div className="mb-8">
                    <h2 className="text-3xl font-black tracking-tight text-gray-900">
                        Patient Registration
                    </h2>
                    <p className="text-gray-500 mt-1 font-medium">
                        Register incoming OPD patients · Digital IDs generated automatically
                    </p>
                </div>

                <div>
                    {/* Main Form Area */}
                    <div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden relative">
                            {/* Gradient top border */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-400 via-emerald-500 to-teal-400" />

                            {/* Registration Form (success path redirects to /reception/patient/[id]?welcome=1) */}
                            <form onSubmit={handleSubmit} className="p-8">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-orange-500/10 rounded-xl">
                                            <UserPlus className="h-5 w-5 text-teal-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-gray-700">Patient Details</h3>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fill in patient information below</p>
                                        </div>
                                    </div>

                                    {/* Referred By — internal only, first field */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
                                        <div className="md:col-span-2">
                                            <ReferredBySelect labelClass={labelClass} selectClass={selectClass} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
                                        {/* Full Name */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>Full Name *</label>
                                            <div className="relative">
                                                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <input
                                                    name="full_name"
                                                    required
                                                    minLength={2}
                                                    maxLength={100}
                                                    className={inputWithIconClass}
                                                    placeholder="e.g. Rahul Kumar"
                                                />
                                            </div>
                                        </div>

                                        {/* Phone with +91 prefix */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>
                                                Phone *
                                                {isCheckingDuplicate && <span className="ml-2 text-teal-400 normal-case">checking...</span>}
                                            </label>
                                            <div className="relative flex">
                                                <span className="inline-flex items-center px-3 py-3.5 bg-gray-100 border border-r-0 border-gray-300 rounded-l-xl text-sm font-bold text-gray-500">
                                                    +91
                                                </span>
                                                <div className="relative flex-1">
                                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                    <input
                                                        name="phone"
                                                        required
                                                        type="tel"
                                                        inputMode="numeric"
                                                        pattern="[0-9]{10}"
                                                        maxLength={10}
                                                        onBlur={handlePhoneBlur}
                                                        className="w-full bg-white border border-gray-300 rounded-r-xl pl-10 pr-4 py-3.5 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10 outline-none transition-all"
                                                        placeholder="10-digit mobile"
                                                        onChange={handlePhoneChange}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Date of Birth */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Date of Birth</label>
                                            <div className="relative">
                                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    placeholder="dd/mm/yyyy"
                                                    value={dobText}
                                                    maxLength={10}
                                                    onChange={handleDobChange}
                                                    className={inputWithIconClass}
                                                />
                                                {/* Submitted as ISO yyyy-mm-dd so nothing downstream changes */}
                                                <input type="hidden" name="date_of_birth" value={dobValue} />
                                            </div>
                                        </div>

                                        {/* Age — years (required) + optional months/days for infants */}
                                        <div className="space-y-1.5 md:col-span-2">
                                            <label className={labelClass}>
                                                Age * <span className="font-medium text-gray-400 normal-case">(months & days optional — for infants)</span>
                                            </label>
                                            <div className="grid grid-cols-3 gap-2">
                                                <input
                                                    name="age"
                                                    type="number"
                                                    min="0"
                                                    max="120"
                                                    required
                                                    value={ageValue}
                                                    onChange={(e) => setAgeValue(e.target.value)}
                                                    className={`${inputClass} text-center`}
                                                    placeholder="Years"
                                                />
                                                <input
                                                    name="age_months"
                                                    type="number"
                                                    min="0"
                                                    max="11"
                                                    value={ageMonths}
                                                    onChange={(e) => setAgeMonths(e.target.value)}
                                                    className={`${inputClass} text-center`}
                                                    placeholder="Months"
                                                />
                                                <input
                                                    name="age_days"
                                                    type="number"
                                                    min="0"
                                                    max="31"
                                                    value={ageDays}
                                                    onChange={(e) => setAgeDays(e.target.value)}
                                                    className={`${inputClass} text-center`}
                                                    placeholder="Days"
                                                />
                                            </div>
                                            {/* Persist fine-grained infant age as total days (existing column) */}
                                            <input
                                                type="hidden"
                                                name="age_in_days"
                                                value={(() => {
                                                    const m = parseInt(ageMonths, 10);
                                                    const d = parseInt(ageDays, 10);
                                                    const total = (isNaN(m) ? 0 : m) * 30 + (isNaN(d) ? 0 : d);
                                                    return total > 0 ? String(total) : '';
                                                })()}
                                            />
                                        </div>

                                        {/* Gender */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Gender *</label>
                                            <select name="gender" className={selectClass}>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>

                                        {/* Blood Group */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Blood Group</label>
                                            <div className="relative">
                                                <Heart className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <select name="blood_group" className={`${selectClass} pl-11`}>
                                                    <option value="">Select</option>
                                                    {BLOOD_GROUPS.map(bg => (
                                                        <option key={bg} value={bg}>{bg}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Aadhaar */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>Aadhaar (Optional)</label>
                                            <div className="relative">
                                                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <input
                                                    name="aadhar"
                                                    className={`${inputWithIconClass} tracking-wider font-mono`}
                                                    placeholder="xxxx-xxxx-xxxx"
                                                    maxLength={14}
                                                    onChange={(e) => {
                                                        let val = e.target.value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1-');
                                                        e.target.value = val;
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Nationality */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Nationality</label>
                                            <input
                                                name="nationality"
                                                defaultValue="Indian"
                                                className={inputClass}
                                                placeholder="e.g. Indian"
                                                maxLength={60}
                                            />
                                        </div>

                                        {/* Government Proof */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Government Proof (Optional)</label>
                                            <div className="grid grid-cols-5 gap-2">
                                                <select name="govt_id_type" defaultValue="" className={`${selectClass} col-span-2`}>
                                                    <option value="">ID Type</option>
                                                    <option value="Aadhaar">Aadhaar</option>
                                                    <option value="PAN">PAN</option>
                                                    <option value="Passport">Passport</option>
                                                    <option value="Voter ID">Voter ID</option>
                                                    <option value="Driving License">Driving License</option>
                                                </select>
                                                <input
                                                    name="govt_id_number"
                                                    className={`${inputClass} col-span-3`}
                                                    placeholder="ID number"
                                                    maxLength={40}
                                                />
                                            </div>
                                        </div>

                                        {/* Email */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>Email (Optional)</label>
                                            <div className="relative">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <input
                                                    name="email"
                                                    type="email"
                                                    className={inputWithIconClass}
                                                    placeholder="patient@example.com"
                                                />
                                            </div>
                                        </div>

                                    </div>

                                    {/* Address Details Section */}
                                    <div className="mb-6 border-t border-gray-200 pt-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <MapPin className="h-4 w-4 text-teal-500" />
                                            <span className="text-xs font-black text-gray-500">Address Details *</span>
                                        </div>
                                        {/* Hidden fields carry the selected values into FormData */}
                                        <input type="hidden" name="country" value={selectedCountry} />
                                        <input type="hidden" name="state" value={selectedState} />
                                        <input type="hidden" name="city" value={selectedCity === '__other' ? customCity : selectedCity} />

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                                            {/* Street / House / Landmark */}
                                            <div className="md:col-span-4 space-y-1.5">
                                                <label className={labelClass}>Street / House No. / Landmark *</label>
                                                <div className="relative">
                                                    <MapPin className="absolute left-4 top-4 h-4 w-4 text-gray-300" />
                                                    <textarea
                                                        name="address"
                                                        required
                                                        rows={2}
                                                        maxLength={500}
                                                        className="w-full bg-white border border-gray-300 rounded-xl pl-11 pr-4 py-3.5 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10 outline-none transition-all resize-none"
                                                        placeholder="House No., Street, Area, Landmark..."
                                                    />
                                                </div>
                                            </div>

                                            {/* Country */}
                                            <div className="md:col-span-2 space-y-1.5">
                                                <label className={labelClass}>Country *</label>
                                                <select
                                                    value={selectedCountry}
                                                    onChange={e => {
                                                        setSelectedCountry(e.target.value);
                                                        setSelectedState('');
                                                        setSelectedCity('');
                                                        setCustomCity('');
                                                    }}
                                                    className={selectClass}
                                                >
                                                    {COUNTRIES.map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* State — dropdown for India, text input for others */}
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>State <span className="text-gray-400 font-normal">(Optional)</span></label>
                                                {selectedCountry === 'India' ? (
                                                    <select
                                                        value={selectedState}
                                                        onChange={e => {
                                                            setSelectedState(e.target.value);
                                                            setSelectedCity('');
                                                            setCustomCity('');
                                                        }}
                                                        className={selectClass}
                                                    >
                                                        <option value="">Select State</option>
                                                        {INDIA_STATES.map(s => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        value={selectedState}
                                                        onChange={e => setSelectedState(e.target.value)}
                                                        className={inputClass}
                                                        placeholder="State / Province"
                                                        maxLength={60}
                                                    />
                                                )}
                                            </div>

                                            {/* Pincode */}
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>
                                                    {selectedCountry === 'India' ? 'Pincode *' : 'Postal Code *'}
                                                </label>
                                                <input
                                                    name="pincode"
                                                    required
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern={selectedCountry === 'India' ? '[0-9]{6}' : undefined}
                                                    maxLength={selectedCountry === 'India' ? 6 : 10}
                                                    onChange={(e) => {
                                                        if (selectedCountry === 'India') {
                                                            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                        }
                                                    }}
                                                    className={`${inputClass} font-mono tracking-wider`}
                                                    placeholder={selectedCountry === 'India' ? '6-digit PIN' : 'Postal code'}
                                                />
                                            </div>

                                            {/* City — dropdown when India + state selected, text input otherwise */}
                                            <div className="md:col-span-2 space-y-1.5">
                                                <label className={labelClass}>City *</label>
                                                {selectedCountry === 'India' && selectedState && INDIA_CITIES[selectedState] ? (
                                                    <div className="space-y-2">
                                                        <select
                                                            value={selectedCity}
                                                            onChange={e => {
                                                                setSelectedCity(e.target.value);
                                                                if (e.target.value !== '__other') setCustomCity('');
                                                            }}
                                                            required
                                                            className={selectClass}
                                                        >
                                                            <option value="">Select City</option>
                                                            {INDIA_CITIES[selectedState].map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                            <option value="__other">Other (type below)</option>
                                                        </select>
                                                        {selectedCity === '__other' && (
                                                            <input
                                                                value={customCity}
                                                                onChange={e => setCustomCity(e.target.value)}
                                                                required
                                                                className={inputClass}
                                                                placeholder="Enter city name"
                                                                maxLength={60}
                                                            />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <input
                                                        value={selectedCity === '__other' ? customCity : selectedCity}
                                                        onChange={e => setSelectedCity(e.target.value)}
                                                        required
                                                        className={inputClass}
                                                        placeholder="e.g. Mumbai"
                                                        maxLength={60}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Emergency Contact Section */}
                                    <div className="mb-6 border-t border-gray-200 pt-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Users className="h-4 w-4 text-rose-400" />
                                            <span className="text-xs font-black text-gray-500">Emergency Contact (Optional)</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Contact Name</label>
                                                <input
                                                    name="emergency_contact_name"
                                                    maxLength={60}
                                                    className={inputClass}
                                                    placeholder="Full name"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Contact Phone</label>
                                                <input
                                                    name="emergency_contact_phone"
                                                    type="tel"
                                                    inputMode="numeric"
                                                    pattern="[0-9]{10}"
                                                    className={inputClass}
                                                    placeholder="10-digit mobile"
                                                    maxLength={10}
                                                    onChange={(e) => {
                                                        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                    }}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Relationship</label>
                                                <select name="emergency_contact_relation" className={selectClass}>
                                                    <option value="">Select</option>
                                                    {RELATIONSHIPS.map(rel => (
                                                        <option key={rel} value={rel}>{rel}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Payment type — reception needs this at registration, not only at
                                        admission. It used to be hardcoded to "cash" here, which forced the
                                        team to re-do TPA patients through the admission screen. The server
                                        action has always accepted these fields. */}
                                    <div className="mb-6 border-t border-gray-200 pt-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <ShieldCheck className="h-4 w-4 text-teal-500" />
                                            <span className="text-xs font-black text-gray-500">Payment Type</span>
                                        </div>
                                        <input type="hidden" name="patient_type" value={patientType} />
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                                            {PATIENT_TYPES.map(pt => {
                                                const active = patientType === pt.value;
                                                return (
                                                    <button
                                                        key={pt.value}
                                                        type="button"
                                                        onClick={() => {
                                                            setPatientType(pt.value);
                                                            if (pt.value !== 'corporate') setSelectedCorporate(null);
                                                        }}
                                                        className={`px-4 py-3 rounded-xl border-2 text-sm font-black transition-all ${
                                                            active
                                                                ? 'border-orange-500 bg-orange-50 text-orange-700'
                                                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                                        }`}
                                                    >
                                                        {pt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {patientType === 'corporate' && (
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Corporate / Company</label>
                                                <select
                                                    name="corporate_id"
                                                    className={selectClass}
                                                    value={selectedCorporate?.id ?? ''}
                                                    onChange={(e) => {
                                                        const c = corporates.find(x => x.id === e.target.value) || null;
                                                        setSelectedCorporate(c);
                                                    }}
                                                >
                                                    <option value="">Select company</option>
                                                    {corporates.map(c => (
                                                        <option key={c.id} value={c.id}>
                                                            {c.company_name} ({c.company_code})
                                                        </option>
                                                    ))}
                                                </select>
                                                {selectedCorporate && (
                                                    <p className="text-[11px] font-bold text-teal-600 ml-1">
                                                        Contracted discount: {selectedCorporate.discount_percentage}%
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {patientType === 'tpa_insurance' && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                <div className="space-y-1.5">
                                                    <label className={labelClass}>TPA / Insurance Provider</label>
                                                    <select name="tpa_provider_id" className={selectClass} defaultValue="">
                                                        <option value="">Select provider</option>
                                                        {tpaProviders.map(p => (
                                                            <option key={p.id} value={p.id}>
                                                                {p.provider_name} ({p.provider_code})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={labelClass}>Policy Number</label>
                                                    <input
                                                        name="insurance_policy_number"
                                                        maxLength={60}
                                                        className={inputClass}
                                                        placeholder="Policy / card number"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={labelClass}>Valid From</label>
                                                    <input name="insurance_validity_start" type="date" className={inputClass} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={labelClass}>Valid Until</label>
                                                    <input name="insurance_validity_end" type="date" className={inputClass} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {/* Notes */}
                                    <div className="mb-6 border-t border-gray-200 pt-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <FileText className="h-4 w-4 text-amber-500" />
                                            <span className="text-xs font-black text-gray-500">Note <span className="font-medium text-gray-400 normal-case">(optional)</span></span>
                                        </div>
                                        <textarea
                                            name="patient_note"
                                            rows={2}
                                            maxLength={2000}
                                            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 outline-none transition-all resize-none"
                                            placeholder="Add a note about this patient (visible on the patient profile)…"
                                        />
                                    </div>

                                    {/* Consent */}
                                    <div className="mb-6 border-t border-gray-200 pt-6">
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                name="registration_consent"
                                                required
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500/20"
                                            />
                                            <div>
                                                <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors flex items-center gap-1.5">
                                                    <FileCheck className="h-3.5 w-3.5 text-teal-400" />
                                                    Registration Consent *
                                                </span>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    I confirm the patient has given consent for registration and data collection as per hospital policy.
                                                </p>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="flex justify-end pt-6 border-t border-gray-200">
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="px-8 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            {isSubmitting ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                                            ) : (
                                                <><UserPlus className="h-4 w-4" /> Register Patient</>
                                            )}
                                        </button>
                                    </div>
                                </form>
                        </div>
                    </div>
                </div>
            </div>

        {/* Duplicate Patient Detection Modal */}
        {showDuplicateWarning && duplicates.length > 0 && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                    {/* Header */}
                    <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 rounded-xl">
                                <AlertCircle className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">
                                    Patient Already Registered
                                </h3>
                                <p className="text-xs text-amber-700 font-medium mt-0.5">
                                    {duplicates.length} existing record{duplicates.length > 1 ? 's' : ''} found with this phone number
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowDuplicateWarning(false)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Patient Cards */}
                    <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                        {duplicates.map((p) => (
                            <div key={p.patient_id} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <div className="flex items-start gap-3 mb-3">
                                    {/* Avatar */}
                                    <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0">
                                        {p.full_name?.charAt(0) || 'P'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-black text-gray-900">{p.full_name}</span>
                                            {p.patient_type && (
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${PATIENT_TYPE_BADGE[p.patient_type] || 'bg-gray-100 text-gray-600'}`}>
                                                    {PATIENT_TYPE_LABEL[p.patient_type] || p.patient_type}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs font-mono text-orange-600 mt-0.5">{p.patient_id}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {[p.phone, p.age ? `${p.age}y` : null, p.gender, p.department].filter(Boolean).join(' · ')}
                                        </p>
                                        {p.date_of_birth && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">
                                                Registered {new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {/* Action Buttons */}
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => router.push(`/reception/patient/${p.patient_id}`)}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors"
                                    >
                                        <UserCheck className="h-3.5 w-3.5" /> Open Profile
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => router.push(`/reception/appointments?patientId=${p.patient_id}`)}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-bold rounded-lg transition-colors"
                                    >
                                        <CalendarPlus className="h-3.5 w-3.5" /> Book Appointment
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => router.push(`/billing/new?patientId=${p.patient_id}`)}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors"
                                    >
                                        <Receipt className="h-3.5 w-3.5" /> New Bill
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50">
                        {duplicates.length >= 2 && (
                            <button
                                type="button"
                                onClick={() => router.push(`/reception/merge-patients?phone=${duplicates[0]?.phone || ''}`)}
                                className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 text-xs font-bold rounded-xl transition-colors"
                            >
                                <GitMerge className="h-3.5 w-3.5" /> Merge Records
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setAllowDuplicate(true);
                                setShowDuplicateWarning(false);
                                toast.info('Duplicate override enabled — click "Register Patient" to proceed');
                            }}
                            className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors"
                        >
                            <UserPlus className="h-3.5 w-3.5" /> Register as New Patient Anyway
                        </button>
                    </div>
                </div>
            </div>
        )}

        </AppShell>
    );
}
