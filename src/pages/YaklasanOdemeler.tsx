// src/pages/YaklasanOdemeler.tsx
import { useEffect, useMemo, useState } from "react";
import { getDb, q, getSetting, type Kisi } from "../db";
import { subscribeIslemler } from "../db";
import { Card, Row, PageTitle, Table, Button } from "../components/UI";

type Doviz = "TRY" | "USD" | "EUR" | "ALTIN";

type Odenecek = {
  id: string;
  tarih: string | null; // YYYY-MM-DD
  tutar: number;        // veride snapshot TL (eski kayıtlar)
  tip: "odenecek";
  kisi_id: string | null;
  aciklama: string | null;
  is_bitiminde?: number | null;
  doviz?: Doviz | null;
  tutar_raw?: number | null; // varsa ham miktar
};

function toDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0); // 12:00 → TZ sapmalarını azalt
}
function fmtTL(n: number) {
  return Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}
function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0);
}
function diffDays(a: Date, b: Date) {
  const ms = toMid(a).getTime() - toMid(b).getTime();
  return Math.floor(ms / 86400000);
}
function toMid(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0); }

export default function YaklasanOdemeler() {
  const [rows, setRows] = useState<Odenecek[]>([]);
  const [kisiler, setKisiler] = useState<Array<Pick<Kisi, "id" | "ad">>>([]);
  const [loading, setLoading] = useState(false);

  // Güncel kurlar (Ayarlar'dan)
  const [rateUsd, setRateUsd] = useState(0);
  const [rateEur, setRateEur] = useState(0);
  const [rateAltin, setRateAltin] = useState(0);

  async function loadAll(){
    setLoading(true);
    try {
      await getDb();
      // Kişiler
      setKisiler(await q("SELECT id, ad FROM kisiler ORDER BY ad ASC"));
      // Önümüzdeki 30 gün (tarihi olan ödenecekler)
      const today = startOfToday();
      const to30 = new Date(today.getTime() + 30 * 86400000);
      const fromStr = today.toISOString().slice(0, 10);
      const toStr = to30.toISOString().slice(0, 10);

      const list: Odenecek[] = await q(
        "SELECT id, tarih, tutar, tip, kisi_id, aciklama, is_bitiminde, doviz, tutar_raw " +
        "FROM islemler " +
        "WHERE tip='odenecek' AND tarih IS NOT NULL AND tarih >= ? AND tarih <= ? " +
        "ORDER BY tarih ASC, created_at ASC",
        [fromStr, toStr]
      );

      const normalized = list.map(r => ({
        ...r,
        tutar: Number(r.tutar) || 0,
        tutar_raw: r.tutar_raw == null ? null : Number(r.tutar_raw),
        doviz: (r.doviz as Doviz) ?? null,
      }));
      setRows(normalized);

      await reloadRates();
    } finally { setLoading(false); }
  }

  async function reloadRates() {
    const usd = parseFloat((await getSetting("doviz_usd", "0")).replace(",", ".")) || 0;
    const eur = parseFloat((await getSetting("doviz_eur", "0")).replace(",", ".")) || 0;
    const alt = parseFloat((await getSetting("doviz_altin_gram", "0")).replace(",", ".")) || 0;
    setRateUsd(usd); setRateEur(eur); setRateAltin(alt);
  }

  function convertToTRY(amount: number, unit: Doviz | null | undefined): number {
    if (!unit || unit === "TRY") return amount;
    if (unit === "USD") return amount * (rateUsd || 0);
    if (unit === "EUR") return amount * (rateEur || 0);
    if (unit === "ALTIN") return amount * (rateAltin || 0);
    return amount;
  }

  // Görünüm TL: ödenecekler her zaman güncel kurla
  const withDisplay = useMemo(() => {
    return rows.map(r => {
      const tl = r.tutar_raw != null && r.doviz
        ? convertToTRY(r.tutar_raw, r.doviz)
        : Number(r.tutar || 0);
      return { ...r, _tl: tl };
    });
  }, [rows, rateUsd, rateEur, rateAltin]);

  // Bölümlere ayır (0–7, 8–14, 15–30)
  const today = startOfToday();
  const part7 = withDisplay.filter(r => {
    const d = toDate(String(r.tarih));
    const dd = diffDays(d, today);
    return dd >= 0 && dd <= 7;
  });
  const part14 = withDisplay.filter(r => {
    const d = toDate(String(r.tarih));
    const dd = diffDays(d, today);
    return dd >= 8 && dd <= 14;
  });
  const part30 = withDisplay.filter(r => {
    const d = toDate(String(r.tarih));
    const dd = diffDays(d, today);
    return dd >= 15 && dd <= 30;
  });

  const sum = (arr: typeof withDisplay) => arr.reduce((s, r) => s + Number(r._tl || 0), 0);
  const kisiMap = useMemo(() => Object.fromEntries(kisiler.map(k => [k.id, k.ad])), [kisiler]);

  // ilk yükleme + realtime
  useEffect(()=> {
    (async()=> {
      await loadAll(); // sayfa ilk açıldığında veriyi çek
      // 🔴 Realtime: islemler değişince (odenecekler dahil) bu sayfayı tazele
      const unsub = subscribeIslemler(() => { loadAll(); });
      return () => { unsub?.(); };
    })();
  },[]);

  return (
    <div>
      <PageTitle>Yaklaşan Ödemeler</PageTitle>

      <Card>
        <Row className="cols-3">
          <div className="helper" style={{ alignSelf: "center" }}>
            Sadece tarihi olan <b>Ödenecek</b> kayıtları listelenir; tutarlar <b>güncel kurla</b> hesaplanır.
          </div>
          <div />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" onClick={reloadRates}>Kurları Yenile</Button>
          </div>
        </Row>
      </Card>

      <div style={{ height: 12 }} />

      {/* 0–7 gün */}
      <Card>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Önümüzdeki 7 Gün</div>
        <Table head={
          <>
            <th align="left">Tarih</th>
            <th align="left">Kişi/Kurum</th>
            <th align="left">Açıklama</th>
            <th align="right">Tutar (TL)</th>
          </>
        }>
          {loading && <tr><td colSpan={4}><div className="empty">Yükleniyor…</div></td></tr>}
          {!loading && part7.map(r => (
            <tr key={r.id}>
              <td>{r.tarih || "—"}</td>
              <td>{r.kisi_id ? (kisiMap[r.kisi_id] || ("#" + String(r.kisi_id).slice(0, 6))) : "—"}</td>
              <td>{r.aciklama || "—"}</td>
              <td align="right">{fmtTL(r._tl)}</td>
            </tr>
          ))}
          {!loading && !part7.length && <tr><td colSpan={4}><div className="empty">Kayıt yok.</div></td></tr>}
          {!loading && part7.length > 0 && (
            <tr>
              <td colSpan={3} align="right" style={{ fontWeight: 800 }}>TOPLAM</td>
              <td align="right" style={{ fontWeight: 800 }}>{fmtTL(sum(part7))}</td>
            </tr>
          )}
        </Table>
      </Card>

      <div style={{ height: 12 }} />

      {/* 8–14 gün */}
      <Card>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>8 – 14 Gün</div>
        <Table head={
          <>
            <th align="left">Tarih</th>
            <th align="left">Kişi/Kurum</th>
            <th align="left">Açıklama</th>
            <th align="right">Tutar (TL)</th>
          </>
        }>
          {!loading && part14.map(r => (
            <tr key={r.id}>
              <td>{r.tarih || "—"}</td>
              <td>{r.kisi_id ? (kisiMap[r.kisi_id] || ("#" + String(r.kisi_id).slice(0, 6))) : "—"}</td>
              <td>{r.aciklama || "—"}</td>
              <td align="right">{fmtTL(r._tl)}</td>
            </tr>
          ))}
          {!loading && !part14.length && <tr><td colSpan={4}><div className="empty">Kayıt yok.</div></td></tr>}
          {!loading && part14.length > 0 && (
            <tr>
              <td colSpan={3} align="right" style={{ fontWeight: 800 }}>TOPLAM</td>
              <td align="right" style={{ fontWeight: 800 }}>{fmtTL(sum(part14))}</td>
            </tr>
          )}
        </Table>
      </Card>

      <div style={{ height: 12 }} />

      {/* 15–30 gün */}
      <Card>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>15 – 30 Gün</div>
        <Table head={
          <>
            <th align="left">Tarih</th>
            <th align="left">Kişi/Kurum</th>
            <th align="left">Açıklama</th>
            <th align="right">Tutar (TL)</th>
          </>
        }>
          {!loading && part30.map(r => (
            <tr key={r.id}>
              <td>{r.tarih || "—"}</td>
              <td>{r.kisi_id ? (kisiMap[r.kisi_id] || ("#" + String(r.kisi_id).slice(0, 6))) : "—"}</td>
              <td>{r.aciklama || "—"}</td>
              <td align="right">{fmtTL(r._tl)}</td>
            </tr>
          ))}
          {!loading && !part30.length && <tr><td colSpan={4}><div className="empty">Kayıt yok.</div></td></tr>}
          {!loading && part30.length > 0 && (
            <tr>
              <td colSpan={3} align="right" style={{ fontWeight: 800 }}>TOPLAM</td>
              <td align="right" style={{ fontWeight: 800 }}>{fmtTL(sum(part30))}</td>
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
