import { GoogleProfile, User } from "@moc/contracts";

export interface NewUserFromGoogleDeps {
  newId: () => string;
  now: () => Date;
}

/**
 * Project a Google profile into a User-shaped record. Caller supplies the
 * id generator and clock so the function stays deterministic in tests.
 * Re-parses the result with the User schema as a defense-in-depth check
 * against drift between the contracts in this commit and a future one.
 */
export function newUserFromGoogleProfile(
  profile: GoogleProfile,
  deps: NewUserFromGoogleDeps,
): User {
  return User.parse({
    id: deps.newId(),
    email: profile.email,
    googleId: profile.sub,
    createdAt: deps.now().toISOString(),
  });
}
