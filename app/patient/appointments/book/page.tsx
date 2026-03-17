"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Stethoscope,
  CalendarDays,
  ClipboardCheck,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Clock,
  Pencil,
  ArrowLeft,
  CreditCard,
} from "lucide-react";
import {
  getAvailableDoctors,
  getAvailableSlots,
  bookAppointment,
} from "../actions";

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  fee?: number;
}

interface Slot {
  id: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

const STEPS = [
  { num: 1, label: "Doctor", icon: Stethoscope },
  { num: 2, label: "Date & Time", icon: CalendarDays },
  { num: 3, label: "Confirm", icon: ClipboardCheck },
  { num: 4, label: "Payment", icon: CreditCard },
  { num: 5, label: "Done", icon: CheckCircle2 },
];

export default function BookAppointmentPage() {
  const [step, setStep] = useState(1);

  // Step 1
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

  // Step 2
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Step 3
  const [reason, setReason] = useState("");

  // Step 4
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingResult, setBookingResult] = useState<{
    appointmentId: string;
  } | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSummary, setPaymentSummary] = useState<{
    consultationFee: number;
    gst: number;
    total: number;
  } | null>(null);

  // Load doctors on mount
  useEffect(() => {
    (async () => {
      setLoadingDoctors(true);
      try {
        const res = await getAvailableDoctors();
        if (res.success) setDoctors(res.data || []);
      } finally {
        setLoadingDoctors(false);
      }
    })();
  }, []);

  // Load slots when doctor + date are selected
  useEffect(() => {
    if (selectedDoctor && selectedDate) {
      (async () => {
        setLoadingSlots(true);
        setSelectedSlot(null);
        try {
          const res = await getAvailableSlots(selectedDoctor.id, selectedDate);
          if (res.success) setSlots(res.data || []);
          else setSlots([]);
        } finally {
          setLoadingSlots(false);
        }
      })();
    } else {
      setSlots([]);
    }
  }, [selectedDoctor, selectedDate]);

  // Unique specialties
  const specialties = useMemo(() => {
    const set = new Set(doctors.map((d) => d.specialty).filter(Boolean));
    return Array.from(set).sort();
  }, [doctors]);

  // Filtered doctors
  const filteredDoctors = useMemo(() => {
    if (!specialtyFilter) return doctors;
    return doctors.filter((d) => d.specialty === specialtyFilter);
  }, [doctors, specialtyFilter]);

  // Date constraints
  const today = new Date().toISOString().split("T")[0];
  const maxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  })();

  // Get initials from name
  function getInitials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  // Handle booking confirmation
  async function handleConfirmBooking() {
    setBookingError("");
    setPaymentError("");
    setStep(4);
  }

  async function handlePayment() {
    if (!selectedDoctor || !selectedSlot || !selectedDate) return;
    setProcessingPayment(true);
    setPaymentError("");

    try {
      const orderResponse = await fetch("/api/razorpay/appointment-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: selectedDoctor.id,
          appointmentDate: selectedDate,
        }),
      });

      if (!orderResponse.ok) {
        let msg = "Failed to create payment order";
        try {
          const err = await orderResponse.json();
          msg = err?.error || err?.message || msg;
        } catch { }
        throw new Error(msg);
      }

      const orderData = await orderResponse.json();
      const { order_id, key_id, amount, consultation_fee, gst } = orderData;

      setPaymentSummary({
        consultationFee: Number(consultation_fee || 0),
        gst: Number(gst || 0),
        total: Number((amount || 0) / 100),
      });

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(script);

      script.onload = () => {
        const options = {
          key: key_id,
          amount,
          currency: "INR",
          name: "Avani Hospital",
          description: "Appointment Payment",
          order_id,
          // Keep methods broadly enabled so Razorpay can render all account-eligible options.
          method: {
            card: true,
            netbanking: true,
            wallet: true,
            upi: true,
            emi: true,
            paylater: true,
          },
          config: {
            display: {
              preferences: {
                show_default_blocks: true,
              },
            },
          },
          handler: async (response: any) => {
            try {
              const verifyRes = await fetch(
                "/api/razorpay/verify-appointment",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    slotId: selectedSlot.id,
                    doctorId: selectedDoctor.id,
                    date: selectedDate,
                    reason,
                  }),
                },
              );

              if (!verifyRes.ok) {
                let msg = "Payment verification failed";
                try {
                  const err = await verifyRes.json();
                  msg = err?.error || err?.message || msg;
                } catch { }
                throw new Error(msg);
              }

              const result = await verifyRes.json();
              setBookingResult({ appointmentId: result.appointmentId });
              setStep(5);
            } catch (error: any) {
              setPaymentError(
                error?.message ||
                "Payment verification failed. Please contact support.",
              );
              console.error(error);
            } finally {
              setProcessingPayment(false);
            }
          },
          modal: {
            ondismiss: () => setProcessingPayment(false),
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", function (response: any) {
          const description =
            response?.error?.description || "Payment could not be completed.";
          const source = response?.error?.source
            ? ` Source: ${response.error.source}.`
            : "";
          const reason = response?.error?.reason
            ? ` Reason: ${response.error.reason}.`
            : "";
          setPaymentError(`${description}${source}${reason}`);
          setProcessingPayment(false);
        });
        rzp.open();
      };

      script.onerror = () => {
        setPaymentError("Unable to load Razorpay checkout. Please retry.");
        setProcessingPayment(false);
      };
    } catch (error: any) {
      setPaymentError(error?.message || "Failed to process payment");
      setProcessingPayment(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {step < 5 && (
          <Link
            href="/patient/appointments"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Book Appointment</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {step < 5 ? `Step ${step} of 4` : "Payment successful"}
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = step === s.num;
            const isComplete = step > s.num;
            return (
              <div key={s.num} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${isComplete
                        ? "bg-emerald-500 text-white"
                        : isActive
                          ? "bg-emerald-500 text-white ring-4 ring-emerald-100"
                          : "bg-gray-100 text-gray-400"
                      }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={`text-xs font-bold mt-1.5 ${isActive || isComplete
                        ? "text-emerald-700"
                        : "text-gray-400"
                      }`}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-2 rounded-full -mt-5 ${step > s.num ? "bg-emerald-400" : "bg-gray-200"
                      }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 1: Select Doctor */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Specialty Filter */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-gray-700">
              Filter by specialty:
            </label>
            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 outline-none transition-all"
            >
              <option value="">All Specialties</option>
              {specialties.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>

          {/* Doctor Cards */}
          {loadingDoctors ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading doctors...
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
              <Stethoscope className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-lg font-bold text-gray-700">
                No doctors available
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {specialtyFilter
                  ? "Try selecting a different specialty"
                  : "No doctors are currently available for booking"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDoctors.map((doc) => {
                const isSelected = selectedDoctor?.id === doc.id;
                return (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDoctor(doc)}
                    className={`bg-white border-2 rounded-2xl p-5 text-left transition-all hover:shadow-md ${isSelected
                        ? "border-emerald-500 ring-4 ring-emerald-100 shadow-md"
                        : "border-gray-100 hover:border-gray-200"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isSelected
                            ? "bg-gradient-to-br from-emerald-400 to-teal-500"
                            : "bg-gradient-to-br from-gray-300 to-gray-400"
                          }`}
                      >
                        {getInitials(doc.name)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">
                          Dr. {doc.name}
                        </p>
                        <p className="text-sm text-gray-500">{doc.specialty}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="mt-3 flex items-center gap-1 text-xs font-bold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Selected
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Next */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setStep(2)}
              disabled={!selectedDoctor}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              Next: Date & Time
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select Date & Time */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Selected Doctor Summary */}
          {selectedDoctor && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center text-white font-bold text-sm">
                  {getInitials(selectedDoctor.name)}
                </div>
                <div>
                  <p className="font-bold text-emerald-900">
                    Dr. {selectedDoctor.name}
                  </p>
                  <p className="text-sm text-emerald-700">
                    {selectedDoctor.specialty}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStep(1)}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 transition"
              >
                <Pencil className="h-3 w-3" />
                Change
              </button>
            </div>
          )}

          {/* Date Picker */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <label className="text-sm font-bold text-gray-700 block mb-2">
              <CalendarDays className="h-4 w-4 inline mr-1.5 text-emerald-500" />
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate}
              min={today}
              max={maxDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full max-w-xs px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 transition-all outline-none text-sm"
            />
          </div>

          {/* Time Slots */}
          {selectedDate && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <label className="text-sm font-bold text-gray-700 block mb-3">
                <Clock className="h-4 w-4 inline mr-1.5 text-emerald-500" />
                Available Time Slots
              </label>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading available slots...
                </div>
              ) : slots.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  No slots available for this date. Try a different date.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.id === slot.id;
                    return (
                      <button
                        key={slot.id}
                        onClick={() =>
                          slot.is_available && setSelectedSlot(slot)
                        }
                        disabled={!slot.is_available}
                        className={`py-3 px-3 rounded-xl text-sm font-bold border-2 transition-all ${isSelected
                            ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                            : slot.is_available
                              ? "bg-white border-emerald-200 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50"
                              : "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                          }`}
                      >
                        {slot.start_time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-bold px-4 py-3 rounded-xl hover:bg-gray-100 transition"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!selectedSlot}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              Next: Confirm
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Reason & Confirm */}
      {step === 3 && (
        <div className="space-y-5">
          {/* Reason */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <label className="text-sm font-bold text-gray-700 block mb-2">
              Reason / Symptoms (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 transition-all outline-none text-sm"
              rows={3}
              placeholder="Briefly describe your symptoms or reason for visit..."
            />
          </div>

          {/* Summary */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
              Appointment Summary
            </h3>
            <div className="space-y-4">
              {/* Doctor */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    Doctor
                  </p>
                  <p className="font-bold text-gray-900 mt-0.5">
                    Dr. {selectedDoctor?.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {selectedDoctor?.specialty}
                  </p>
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 transition"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </div>

              {/* Date */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    Date
                  </p>
                  <p className="font-bold text-gray-900 mt-0.5">
                    {selectedDate
                      ? new Date(selectedDate + "T00:00:00").toLocaleDateString(
                        undefined,
                        {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        },
                      )
                      : ""}
                  </p>
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 transition"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </div>

              {/* Time */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    Time Slot
                  </p>
                  <p className="font-bold text-gray-900 mt-0.5">
                    {selectedSlot?.start_time} - {selectedSlot?.end_time}
                  </p>
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 transition"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </div>

              {/* Reason */}
              {reason && (
                <div className="py-3">
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    Reason
                  </p>
                  <p className="text-sm text-gray-700 mt-0.5">{reason}</p>
                </div>
              )}
            </div>
          </div>

          {bookingError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-medium">
              {bookingError}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-bold px-4 py-3 rounded-xl hover:bg-gray-100 transition"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handleConfirmBooking}
              disabled={false}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 shadow-lg shadow-emerald-500/20"
            >
              <CreditCard className="h-4 w-4" />
              Continue to Payment
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Payment */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
              Payment Details
            </h3>
            {paymentSummary ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-600 font-medium">
                    Consultation Fee
                  </span>
                  <span className="text-xl font-bold text-gray-900">
                    ₹{paymentSummary.consultationFee}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-gray-600 font-medium">GST (18%)</span>
                  <span className="text-gray-900">₹{paymentSummary.gst}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                  <span className="font-bold text-emerald-900">
                    Total Amount
                  </span>
                  <span className="text-2xl font-bold text-emerald-600">
                    ₹{paymentSummary.total}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Amount will be fetched securely from backend when you click Pay
                Now.
              </p>
            )}
          </div>

          <div className="bg-gray-50 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
              Appointment Details
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Doctor:</span>
                <span className="font-bold text-gray-900">
                  Dr. {selectedDoctor?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="font-bold text-gray-900">
                  {selectedDate
                    ? new Date(selectedDate + "T00:00:00").toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric", year: "numeric" },
                    )
                    : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Time:</span>
                <span className="font-bold text-gray-900">
                  {selectedSlot?.start_time} - {selectedSlot?.end_time}
                </span>
              </div>
            </div>
          </div>

          {paymentError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-medium">
              {paymentError}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(3)}
              disabled={processingPayment}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-bold px-4 py-3 rounded-xl hover:bg-gray-100 transition disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handlePayment}
              disabled={processingPayment}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 shadow-lg shadow-emerald-500/20"
            >
              {processingPayment ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {processingPayment ? "Processing..." : "Pay Now"}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Success */}
      {step === 5 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center space-y-6">
          {/* Animated Checkmark */}
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-20" />
            <div className="relative bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full w-20 h-20 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="h-10 w-10 text-white" />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Appointment Confirmed!
            </h2>
            <p className="text-gray-500 mt-2">
              Your appointment has been successfully booked.
            </p>
          </div>

          {/* Details */}
          <div className="bg-gray-50 rounded-2xl p-6 max-w-sm mx-auto text-left space-y-3">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">
                Doctor
              </p>
              <p className="font-bold text-gray-900">
                Dr. {selectedDoctor?.name}{" "}
                <span className="text-gray-500 font-normal">
                  ({selectedDoctor?.specialty})
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Date</p>
              <p className="font-bold text-gray-900">
                {selectedDate
                  ? new Date(selectedDate + "T00:00:00").toLocaleDateString(
                    undefined,
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    },
                  )
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Time</p>
              <p className="font-bold text-gray-900">
                {selectedSlot?.start_time} - {selectedSlot?.end_time}
              </p>
            </div>
            {reason && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase">
                  Reason
                </p>
                <p className="text-sm text-gray-700">{reason}</p>
              </div>
            )}
            {bookingResult?.appointmentId && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase">
                  Appointment ID
                </p>
                <p className="font-bold text-emerald-600 text-sm">
                  {bookingResult.appointmentId}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/patient/appointments"
              className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl transition shadow-lg shadow-emerald-500/20"
            >
              View My Appointments
            </Link>
            <Link
              href="/patient/dashboard"
              className="inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-bold px-6 py-3 rounded-xl hover:bg-gray-50 transition"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
