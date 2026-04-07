/**
 * WhatsApp Message Template Builders
 * Used for session messages (direct text) - NOT for campaign templates
 */

export function appointmentConfirmationMsg(data: {
  patientName: string;
  doctorName: string;
  department: string;
  date: string;
  time: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Appointment Confirmed*\n\nDear ${data.patientName},\n\nYour appointment with *Dr. ${data.doctorName}* (${data.department}) is confirmed.\n\n📅 Date: *${data.date}*\n🕐 Time: *${data.time}*\n\nPlease arrive 10 minutes early with your Patient ID.\n\nThank you!`;
}

export function appointmentReminderMsg(data: {
  patientName: string;
  doctorName: string;
  time: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Reminder*\n\nDear ${data.patientName},\n\nYour appointment with *Dr. ${data.doctorName}* is in *${data.time}*.\n\nPlease bring your Patient ID card.\n\nFor queries, call reception.`;
}

export function appointmentCancellationMsg(data: {
  patientName: string;
  doctorName: string;
  date: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Appointment Cancelled*\n\nDear ${data.patientName},\n\nYour appointment with *Dr. ${data.doctorName}* on *${data.date}* has been cancelled.\n\nPlease contact reception to reschedule.\n\nWe apologize for the inconvenience.`;
}

export function prescriptionReadyMsg(data: {
  patientName: string;
  doctorName: string;
  diagnosis: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Prescription Ready*\n\nDear ${data.patientName},\n\nDr. ${data.doctorName} has added a new prescription to your record.\n\n*Diagnosis:* ${data.diagnosis}\n\nView details in your Patient Portal.`;
}

export function admissionConfirmedMsg(data: {
  patientName: string;
  doctorName: string;
  bedDetails: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Admission Confirmed*\n\nDear ${data.patientName},\n\nYou have been admitted under the care of *Dr. ${data.doctorName}*.\n\n🛏 Bed: *${data.bedDetails}*\n\nTrack your status in the Patient Portal.\n\nWishing you a speedy recovery!`;
}

export function labReportReadyMsg(data: {
  patientName: string;
  testName: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Lab Report Ready*\n\nDear ${data.patientName},\n\nYour *${data.testName}* report is ready.\n\nPlease collect from the Lab or view online.\n\nThank you.`;
}

export function dischargeSummaryMsg(data: {
  patientName: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Discharge Summary*\n\nDear ${data.patientName},\n\nYour discharge summary has been prepared. Please collect from reception or view in the Patient Portal.\n\nWishing you a speedy recovery!`;
}

export function billingInvoiceMsg(data: {
  patientName: string;
  invoiceNumber: string;
  amount: number;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Invoice Generated*\n\nDear ${data.patientName},\n\nInvoice *#${data.invoiceNumber}* for *₹${data.amount.toLocaleString('en-IN')}* has been generated.\n\nYou can view and pay online via the Patient Portal.\n\nThank you.`;
}

export function paymentReceiptMsg(data: {
  patientName: string;
  amount: number;
  transactionId: string;
  date: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Payment Received*\n\nDear ${data.patientName},\n\nWe have received your payment of *₹${data.amount.toLocaleString('en-IN')}*.\n\n🧾 Receipt: *${data.transactionId}*\n📅 Date: *${data.date}*\n\nThank you!`;
}

export function pillReminderMsg(data: {
  patientName: string;
  medicationName: string;
  time: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — Medication Reminder* 💊\n\nDear ${data.patientName},\n\nIt's time for your medication:\n*${data.medicationName}* at *${data.time}*\n\nPlease take your medicine on time.`;
}

export function icuDailyUpdateMsg(data: {
  familyMemberName: string;
  patientName: string;
  condition: string;
  doctorNote: string;
  nextUpdateTime: string;
  hospitalName: string;
}): string {
  return `*${data.hospitalName} — ICU Daily Update*\n\nDear ${data.familyMemberName},\n\nUpdate on *${data.patientName}*:\n\n🏥 Condition: *${data.condition}*\n👨‍⚕️ Doctor's Note: ${data.doctorNote}\n\n⏰ Next update: ${data.nextUpdateTime}\n\nFor queries, contact the ICU reception.`;
}

export function newPatientCardMsg(data: {
  doctorName: string;
  patientName: string;
  age: string;
  gender: string;
  chiefComplaint: string;
  tokenNumber: string;
  uhid: string;
}): string {
  return `*New Patient Assigned*\n\nDr. ${data.doctorName},\n\nA new patient has been assigned to you:\n\n👤 *${data.patientName}*\n📋 Age: ${data.age} | Gender: ${data.gender}\n🆔 UHID: ${data.uhid}\n🔢 Token: ${data.tokenNumber}\n💬 Chief Complaint: ${data.chiefComplaint}\n\nPlease check your dashboard.`;
}
