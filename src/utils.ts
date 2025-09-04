// src/utils.ts içindeki toAmount'ı bununla değiştirin
export function toAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  let s = value.trim();
  if (!s) return 0;

  // baştaki işaret (opsiyonel)
  let sign = 1;
  if (s[0] === "-") { sign = -1; s = s.slice(1); }

  // sadece rakam ve ayırıcıları bırak
  s = s.replace(/[^\d.,]/g, ""); // TL, boşluk vs. sil

  if (!s) return 0;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  // Yardımcı: tek tip ayırıcıyla yazılmışsa "binlik gruplama" mı?
  const looksLikeThousands = (str: string, sep: string) => {
    const parts = str.split(sep);
    if (parts.length <= 1) return false;
    // ilk parça 1–3 hane, diğer parçalar tam 3 hane olmalı → 1.234.567
    if (!/^\d{1,3}$/.test(parts[0])) return false;
    for (let i = 1; i < parts.length; i++) {
      if (!/^\d{3}$/.test(parts[i])) return false;
    }
    return true;
  };

  let resultStr: string;

  if (hasDot && hasComma) {
    // Her iki ayırıcı da var → en sağdaki ondalık, diğeri binlik.
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    const lastSepIndex = Math.max(lastDot, lastComma);
    const decDigits = s.length - lastSepIndex - 1;

    // tüm ayırıcıları temizleyip ondalığı tekrar yerleştir
    const digitsOnly = s.replace(/[.,]/g, "");
    if (decDigits > 0) {
      const cut = digitsOnly.length - decDigits;
      resultStr = (cut <= 0 ? "0" : digitsOnly.slice(0, cut)) + "." + digitsOnly.slice(cut);
    } else {
      resultStr = digitsOnly; // aslında ondalık yokmuş
    }
  } else if (hasDot || hasComma) {
    // Tek tip ayırıcı var → binlik mi ondalık mı?
    const sep = hasDot ? "." : ",";
    // “binlik gruplama” formatına uyuyorsa binliktir: ayırıcıları sil.
    if (looksLikeThousands(s, sep)) {
      resultStr = s.split(sep).join("");
    } else {
      // ondalık varsay: en sağdaki ayırıcı ondalık
      const idx = s.lastIndexOf(sep);
      const decDigits = s.length - idx - 1;
      const digitsOnly = s.replace(new RegExp(`\\${sep}`, "g"), "");
      if (decDigits > 0) {
        const cut = digitsOnly.length - decDigits;
        resultStr = (cut <= 0 ? "0" : digitsOnly.slice(0, cut)) + "." + digitsOnly.slice(cut);
      } else {
        resultStr = digitsOnly;
      }
    }
  } else {
    // Ayırıcı yok → doğrudan sayı
    resultStr = s;
  }

  const n = parseFloat(resultStr);
  return Number.isFinite(n) ? sign * n : 0;
}
// toAmount'ınız aynı kalsın. Altına şunu ekleyin:

/** Görünüm için TR formatına çevirir (1.234.567,89). Boş/Geçersiz ise "" döner. */
export function formatAmountTR(value: unknown): string {
  // Kullanıcı alanı tamamen boşsa boş bırak
  if (typeof value === "string" && value.trim() === "") return "";
  const n = toAmount(value);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function today() { return new Date().toISOString().slice(0, 10); }
