import crypto from "crypto";
import { SCHOOL_IDS } from "../../../shared/constants/schools";

/**
 * Mask student email to protect privacy across network synchronization.
 * Rules:
 * - Extract prefix before '@'
 * - prefix.length <= 2: prefix + "***"
 * - prefix.length <= 4: prefix[0] + "***" + prefix.slice(-1)
 * - prefix.length > 4: prefix.slice(0, 2) + "***" + prefix.slice(-2)
 * - Empty or invalid prefix: "anonymous"
 */
export function maskEmail(email?: string): string {
  if (!email || typeof email !== "string") {
    return "anonymous";
  }
  const clean = email.trim();
  const prefix = clean.includes("@") ? clean.split("@")[0].trim() : clean;
  if (!prefix) {
    return "anonymous";
  }

  if (prefix.length <= 2) {
    return prefix + "***";
  } else if (prefix.length <= 4) {
    return prefix[0] + "***" + prefix.slice(-1);
  } else {
    return prefix.slice(0, 2) + "***" + prefix.slice(-2);
  }
}

/**
 * Authenticate admin key using constant-time comparison (crypto.timingSafeEqual).
 * Protects against timing attacks.
 */
export function checkAdminKey(providedKey?: string): boolean {
  const envKey = process.env.ADMIN_KEY;
  if (!providedKey || typeof providedKey !== "string" || !envKey || typeof envKey !== "string") {
    return false;
  }
  const bufProvided = Buffer.from(providedKey);
  const bufEnv = Buffer.from(envKey);
  if (bufProvided.length !== bufEnv.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufProvided, bufEnv);
}

/**
 * Validate that a value is a safe integer within the specified range [min, max].
 */
export function isSafeInteger(val: any, min: number = -Infinity, max: number = Infinity): boolean {
  return typeof val === "number" && Number.isInteger(val) && Number.isFinite(val) && val >= min && val <= max;
}

/**
 * Validate that a coordinate value is safe (finite number between min and max).
 * Default range covers the map space [0, 1000].
 */
export function isSafeCoordinate(val: any, min: number = 0, max: number = 1000): boolean {
  return typeof val === "number" && Number.isFinite(val) && val >= min && val <= max;
}

/**
 * Validate that a schoolId corresponds to an official registered school.
 */
export function isValidSchoolId(val: any): boolean {
  return typeof val === "string" && SCHOOL_IDS.includes(val);
}
