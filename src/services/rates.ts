// src/services/rates.ts
// Stabil kur güncelleme (tamamı CORS-dostu):
//  - USD/EUR: Frankfurter (ECB) + exchangerate.host (fallback)
//  - XAU/TRY (Altın): exchangerate.host üzerinde çoklu fallback’ler
// Gram altın (TRY) = (XAU/TRY) / 31.1034768

import { getSetting, setSetting } from "../db";

const FR_BASE = "https://api.frankfurter.app";
const EXH_BASE = "https://api.exchangerate.host";
const OZ_TO_GRAM = 31.1034768;

// ---- yardımcılar ----
async function fetchJSON(url: string, retries = 3, timeoutMs = 8000): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(t);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, attempt * 500));
    }
  }
  throw new Error("unreachable");
}

function toFixedStr(v: number, digits: number) {
  return Number.isFinite(v) ? v.toFixed(digits) : "0";
}

// ---- FX: USD/EUR için kararlı oran ----
async function frRate(from: string, to: string): Promise<number> {
  const data = await fetchJSON(`${FR_BASE}/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const v = data?.rates?.[to];
  if (typeof v !== "number") throw new Error(`Frankfurter rate missing for ${from}->${to}`);
  return v;
}

async function exhRate(from: string, to: string): Promise<number> {
  const data = await fetchJSON(`${EXH_BASE}/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const v = data?.result;
  if (typeof v !== "number") throw new Error(`exchangerate.host rate missing for ${from}->${to}`);
  return v;
}

async function getRateStableFX(from: string, to: string): Promise<number> {
  try {
    return await frRate(from, to);
  } catch {
    return await exhRate(from, to);
  }
}

// ---- Altın: exchangerate.host üzerinde çok katmanlı fallback ----
// Hepsi CORS-dostu; hiçbirinde Yahoo/TradingView yok.

async function getXauTry_direct(): Promise<number> {
  // XAU→TRY doğrudan
  return await exhRate("XAU", "TRY");
}

async function getXauTry_viaUsd(usdTry?: number): Promise<number> {
  // USD→XAU (XAU per USD) → ters çevir: USD per XAU → TRY/ons için USD/TRY ile çarp
  const usd_to_xau = await exhRate("USD", "XAU");
  const xau_usd = 1 / usd_to_xau; // USD per XAU (ons)
  const usd_try = typeof usdTry === "number" && Number.isFinite(usdTry) ? usdTry : await getRateStableFX("USD", "TRY");
  return xau_usd * usd_try; // TRY per XAU
}

async function getXauTry_invertTry(): Promise<number> {
  // TRY→XAU (XAU per TRY) → ters çevir: TRY per XAU
  const try_to_xau = await exhRate("TRY", "XAU");
  return 1 / try_to_xau;
}

async function getXauTry_viaEur(eurTry?: number): Promise<number> {
  // EUR→XAU (XAU per EUR) → ters çevir: EUR per XAU → TRY/ons için EUR/TRY ile çarp
  const eur_to_xau = await exhRate("EUR", "XAU");
  const xau_eur = 1 / eur_to_xau; // EUR per XAU
  const eur_try = typeof eurTry === "number" && Number.isFinite(eurTry) ? eurTry : await getRateStableFX("EUR", "TRY");
  return xau_eur * eur_try; // TRY per XAU
}

async function getXauTryStable(usdTryHint?: number, eurTryHint?: number): Promise<number | null> {
  // 1) XAU→TRY
  try {
    return await getXauTry_direct();
  } catch {}
  // 2) USD→XAU ters + USD→TRY
  try {
    return await getXauTry_viaUsd(usdTryHint);
  } catch {}
  // 3) TRY→XAU ters
  try {
    return await getXauTry_invertTry();
  } catch {}
  // 4) EUR→XAU ters + EUR→TRY
  try {
    return await getXauTry_viaEur(eurTryHint);
  } catch {}
  // 5) Yoksa null → üst katman eski değeri korur
  return null;
}

// ---- Dışa açık API ----
/**
 * Kurları çekip kalıcı olarak saklar.
 * - doviz_usd: USD/TRY (4 hane)
 * - doviz_eur: EUR/TRY (4 hane)
 * - doviz_altin_gram: Gram altın TRY (2 hane)  → Altın yakalanamazsa ESKİ değer korunur
 * - doviz_source, doviz_updated_at: meta
 */
export async function updateRatesAndPersist(sourceNote?: string) {
  // 1) USD/EUR
  const [usdTry, eurTry] = await Promise.all([
    getRateStableFX("USD", "TRY"),
    getRateStableFX("EUR", "TRY"),
  ]);

  // 2) XAU/TRY (opsiyonel; bulunamazsa eski değer kalsın)
  const xauTry = await getXauTryStable(usdTry, eurTry);
  let gramAltinTry: number | null = null;

  if (xauTry !== null && Number.isFinite(xauTry)) {
    gramAltinTry = xauTry / OZ_TO_GRAM;
  } else {
    const old = Number(await getSetting("doviz_altin_gram", "0"));
    gramAltinTry = Number.isFinite(old) && old > 0 ? old : null;
  }

  // 3) Persist
  await setSetting("doviz_usd", toFixedStr(usdTry, 4));
  await setSetting("doviz_eur", toFixedStr(eurTry, 4));
  if (gramAltinTry !== null) {
    await setSetting("doviz_altin_gram", toFixedStr(gramAltinTry, 2));
  }

  const goldNote = xauTry !== null ? "gold: ok" : "gold: previous value kept";
  const source =
    sourceNote ?? `Frankfurter (ECB) + exchangerate.host; ${goldNote}; no Yahoo`;
  await setSetting("doviz_source", source);
  await setSetting("doviz_updated_at", new Date().toISOString());
}
