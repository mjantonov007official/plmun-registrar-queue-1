export const USER_TYPES = ["Student", "Employee", "Alumni", "Parent", "Visitor"] as const;
export type UserType = (typeof USER_TYPES)[number];

export const TRANSACTION_OPTIONS: Record<string, string[]> = {
  E: [
    "Enrollment / Registration",
    "Evaluation Form",
    "Subject Credit",
    "Shifting Form",
    "Completion Form",
    "AW/Adding/Dropping Form",
  ],
  T: ["Transcript of Records Request", "Transcript of Records Claim"],
  C: [
    "Certificate of Grades (COG)",
    "Certificate of Enrollment (COE)",
    "Certificate of Graduation",
    "Certificate of Earned Units",
    "CHED Endorsement",
    "Certificate of Incumbent",
    "GWA Certificate",
    "CAV/S.O. Certificate",
    "Certificate for Medium of Instruction",
    "Authentication",
    "COPC Authentication",
    "COM Reprint",
    "Diploma",
    "Certificate for Latin",
    "Other Certificate (Please Specify)",
  ],
  P: ["Fee Assessment", "Payment", "Clearance"],
  I: ["General Inquiry", "Other Registrar Concern (Please Specify)"],
};

export const TRANSACTION_NOTE_OPTIONS = new Set([
  "Other Certificate (Please Specify)",
  "Other Registrar Concern (Please Specify)",
]);

export function isUserType(value: string): value is UserType {
  return (USER_TYPES as readonly string[]).includes(value);
}

export function validateQueueRequest(input: {
  userType: string;
  serviceCode: string;
  serviceName: string;
  transactions: string[];
  name: string;
  studentId: string;
  note: string;
}): string | null {
  if (!isUserType(input.userType)) return "Please choose your user type.";
  if (!input.name.trim()) return "Please enter your name.";
  if (input.name.trim().length > 100) return "Name is too long.";
  if (input.userType === "Student" && !input.studentId.trim())
    return "Please enter your student ID.";
  if (input.studentId.trim().length > 30) return "Student ID is too long.";
  if (input.userType !== "Student" && input.studentId.trim())
    return "Student ID is only for students.";
  if (input.transactions.length < 1 || input.transactions.length > 20)
    return "Select between 1 and 20 transaction types.";
  if (new Set(input.transactions).size !== input.transactions.length)
    return "Duplicate transaction types are not allowed.";
  const allowed = TRANSACTION_OPTIONS[input.serviceCode] ?? [input.serviceName];
  if (input.transactions.some((item) => !allowed.includes(item)))
    return "One or more transaction types are not valid for this service.";
  const needsNote = input.transactions.some((item) => TRANSACTION_NOTE_OPTIONS.has(item));
  if (needsNote && !input.note.trim()) return "Please specify the requested item.";
  if (input.note.trim().length > 200) return "Transaction details are too long.";
  if (!needsNote && input.note.trim()) return "Unexpected transaction note.";
  return null;
}
