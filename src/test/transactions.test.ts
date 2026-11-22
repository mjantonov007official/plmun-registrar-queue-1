import { describe, expect, it } from "vitest";
import {
  isUserType,
  TRANSACTION_NOTE_OPTIONS,
  TRANSACTION_OPTIONS,
  USER_TYPES,
  validateQueueRequest,
} from "@/lib/transactions";

describe("public queue request choices", () => {
  it("includes each intended visitor type", () => {
    expect(USER_TYPES).toEqual(["Student", "Employee", "Alumni", "Parent", "Visitor"]);
    expect(isUserType("Parent")).toBe(true);
    expect(isUserType("Administrator")).toBe(false);
  });

  it("maps the requested forms to enrollment and document requests to certificates", () => {
    expect(TRANSACTION_OPTIONS["E"]).toContain("AW/Adding/Dropping Form");
    expect(TRANSACTION_OPTIONS["C"]).toContain("COPC Authentication");
    expect(TRANSACTION_OPTIONS["C"]).toContain("Other Certificate (Please Specify)");
    expect(
      TRANSACTION_OPTIONS["C"]?.filter((item) => item === "Certificate of Grades (COG)"),
    ).toHaveLength(1);
  });

  it("requires a note only for options that ask the user to specify", () => {
    expect(TRANSACTION_NOTE_OPTIONS.has("Other Certificate (Please Specify)")).toBe(true);
    expect(TRANSACTION_NOTE_OPTIONS.has("Certificate of Graduation")).toBe(false);
  });

  it("rejects missing identity, invalid category selections, and unrequested student IDs", () => {
    const request = {
      userType: "Student",
      serviceCode: "C",
      serviceName: "Certificates & Documents",
      transactions: ["Certificate of Grades (COG)"],
      name: "Alex Example",
      studentId: "2024-00123",
      note: "",
    };
    expect(validateQueueRequest({ ...request, studentId: "" })).toMatch(/student ID/i);
    expect(validateQueueRequest({ ...request, transactions: ["Payment"] })).toMatch(/not valid/i);
    expect(
      validateQueueRequest({ ...request, userType: "Visitor", studentId: "2024-00123" }),
    ).toMatch(/only for students/i);
    expect(validateQueueRequest({ ...request, name: " " })).toMatch(/name/i);
    expect(validateQueueRequest({ ...request, userType: "Other" })).toMatch(/user type/i);
  });

  it("requires a note for specified requests and rejects duplicates or oversized input", () => {
    const request = {
      userType: "Alumni",
      serviceCode: "C",
      serviceName: "Certificates & Documents",
      transactions: ["Other Certificate (Please Specify)"],
      name: "Alex Example",
      studentId: "",
      note: "",
    };
    expect(validateQueueRequest(request)).toMatch(/specify/i);
    expect(validateQueueRequest({ ...request, note: "Copy of diploma" })).toBeNull();
    expect(
      validateQueueRequest({
        ...request,
        transactions: ["Certificate of Graduation", "Certificate of Graduation"],
      }),
    ).toMatch(/duplicate/i);
    expect(validateQueueRequest({ ...request, note: "x".repeat(201) })).toMatch(/too long/i);
    expect(validateQueueRequest({ ...request, transactions: [] })).toMatch(/select between/i);
  });
});
