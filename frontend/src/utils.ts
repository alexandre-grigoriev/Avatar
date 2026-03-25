import React from "react";
import { Shield, Building2, Star, User } from "lucide-react";
import { ADMIN_EMAILS, TRUSTED_USERS, UI_STRINGS } from "./constants";

export function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export function t(lang: string) {
  return UI_STRINGS[lang] ?? UI_STRINGS.en;
}

export function getUserStatus(email: string | undefined): string {
  if (!email) return "Guest";
  const e = email.toLowerCase();
  if (ADMIN_EMAILS.includes(e)) return "Admin";
  if (e.endsWith("@horiba.com")) return "HORIBA user";
  if (TRUSTED_USERS.includes(e)) return "Trusted user";
  return "Guest";
}

export function UserStatusIcon({ email, className }: { email: string | undefined; className?: string }) {
  switch (getUserStatus(email)) {
    case "Admin":        return React.createElement(Shield, { className });
    case "HORIBA user":  return React.createElement(Building2, { className });
    case "Trusted user": return React.createElement(Star, { className });
    default:             return React.createElement(User, { className });
  }
}
