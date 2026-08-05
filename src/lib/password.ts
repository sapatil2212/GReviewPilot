export interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
  checks: { label: string; ok: boolean }[];
}

export function evaluatePassword(pw: string): PasswordStrength {
  const checks = [
    { label: "At least 8 characters", ok: pw.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(pw) },
    { label: "Lowercase letter", ok: /[a-z]/.test(pw) },
    { label: "Number", ok: /\d/.test(pw) },
    { label: "Symbol", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const passed = checks.filter((c) => c.ok).length;
  let score = 0;
  if (pw.length >= 8 && passed >= 2) score = 1;
  if (pw.length >= 8 && passed >= 3) score = 2;
  if (pw.length >= 10 && passed >= 4) score = 3;
  if (pw.length >= 12 && passed === 5) score = 4;
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  const colors = [
    "bg-destructive",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-emerald-500",
    "bg-emerald-600",
  ];
  return { score, label: labels[score], color: colors[score], checks };
}
