import { Email } from "@moc/contracts";

/**
 * Normalize an email at the boundary: lowercase + trim. Mongoose stores it.
 * Pure: no DB access. Tested without Nest or Mongo.
 */
export function normalizeEmail(input: string): Email {
  return Email.parse(input);
}
