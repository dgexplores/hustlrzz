import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, signInMethods, validatePasswordChange } from "@/lib/settings";

describe("validatePasswordChange", () => {
  it("rejects passwords below the minimum length", () => {
    expect(validatePasswordChange("abc", "abc")).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  });

  it("rejects mismatched passwords", () => {
    expect(validatePasswordChange("secret1", "secret2")).toBe("Passwords do not match.");
  });

  it("accepts matching passwords at or above the minimum length", () => {
    expect(validatePasswordChange("secret1", "secret1")).toBeNull();
    expect(validatePasswordChange("sixchr", "sixchr")).toBeNull();
  });
});

describe("signInMethods", () => {
  it("returns an empty list without a user", () => {
    expect(signInMethods(null)).toEqual([]);
    expect(signInMethods(undefined)).toEqual([]);
  });

  it("shows email from user.email", () => {
    expect(signInMethods({ email: "a@b.co" })).toEqual([
      { id: "email", label: "Email", detail: "a@b.co" },
    ]);
  });

  it("detects Google from app_metadata.provider", () => {
    const methods = signInMethods({
      email: "a@b.co",
      app_metadata: { provider: "google" },
    });
    expect(methods.map((m) => m.id)).toEqual(["email", "google"]);
  });

  it("detects Google from user_metadata.avatar_url", () => {
    const methods = signInMethods({
      email: "a@b.co",
      user_metadata: { avatar_url: "https://example.com/a.png" },
    });
    expect(methods.map((m) => m.id)).toEqual(["email", "google"]);
  });
});
