// src/pages/ToplamOdenecekler.tsx
import { useEffect, useState, useMemo } from "react";
import { getDb, q, getSetting } from "../db";
import { subscribeIslemler } from "../db";
import { Card, PageTitle, Table } from "../components/UI";

type Doviz = "TRY" | "USD" | "EUR" | "ALTIN";
type RowAgg = { kisi_id: string | null; ad: string; net: number };

type Row = {
  kisi_id: string | null;
  ad: string;
  tip: "tahsilat" | "odeme" | "odenecek" | "alacak";
  tutar: number;              // TL snapshot
  tutar_raw: number | null;   // varsa ham
  doviz: Doviz | null;
};

function num(v: unknown){ const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }

export default function ToplamOdenecekler(){
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [rateUsd, setRateUsd] = useState(0);
  const [rateEur, setRateEur] = useState(0);
  const [rateAltin, setRateAltin] = useState(0);

  async function loadRates(){
    const usd = parseFloat((await getSetting("doviz_usd","0")).replace(",", ".")) || 0;
    const eur = parseFloat((await getSetting("doviz_eur","0")).replace(",", ".")) || 0;
    const alt = parseFloat((await getSetting("doviz_altin_gram","0")).replace(",", ".")) || 0;
    setRateUsd(usd); setRateEur(eur); setRateAltin(alt);
  }

  function convertToTRY(amount: number, unit: Doviz | null | undefined): number {
    if (!unit || unit === "TRY") return amount;
    if (unit === "USD") return amount * (rateUsd || 0);
    if (unit === "EUR") return amount * (rateEur || 0);
    if (unit === "ALTIN") return amount * (rateAltin || 0);
    return amount;
  }

  async function load(){
    setLoading(true);
    try{
      await getDb();
      // Ham satırları al: kişi, tip, tutar, tutar_raw, doviz
      const data: Row[] = (await q(
        `SELECT i.kisi_id,
                COALESCE(k.ad,'(Kişisiz)') AS ad,
                i.tip,
                CAST(i.tutar AS REAL)      AS tutar,
                CAST(i.tutar_raw AS REAL)  AS tutar_raw,
                i.doviz
         FROM islemler i
         LEFT JOIN kisiler k ON k.id = i.kisi_id`
      )) as any;

      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ (async()=>{ await loadRates(); await load(); })(); },[]);
  useEffect(()=> {
    const unsub = subscribeIslemler(() => { loadRates(); load(); });
    return () => { unsub?.(); };
  },[]);

  // TL karşılığı görünür tutar
  const display = useMemo(()=>{
    return rows.map(r=>{
      if (r.tip === "odeme" || r.tip === "tahsilat"){
        return {...r, _tl: num(r.tutar)};
      }
      const hasRaw = r.tutar_raw != null && Number.isFinite(r.tutar_raw);
      const tl = hasRaw ? convertToTRY(r.tutar_raw as number, r.doviz) : num(r.tutar);
      return {...r, _tl: tl};
    });
  }, [rows, rateUsd, rateEur, rateAltin]);

  // Kişi bazında Net = -Ödenecek + Ödeme - Tahsilat + Alacak
  const grouped: RowAgg[] = useMemo(()=>{
    const map = new Map<string, RowAgg>();
    for (const r of display){
      const key = String(r.kisi_id ?? "null");
      if(!map.has(key)) map.set(key, { kisi_id: r.kisi_id, ad: r.ad, net: 0 });
      const g = map.get(key)!;
      if (r.tip === "odenecek") g.net += -num(r._tl);
      else if (r.tip === "odeme") g.net +=  num(r._tl);
      else if (r.tip === "tahsilat") g.net += -num(r._tl);
      else if (r.tip === "alacak") g.net +=  num(r._tl);
    }
    return Array.from(map.values());
  }, [display]);

  const onlyNegative = useMemo(()=> grouped.filter(g=>g.net < 0).sort((a,b)=> a.net - b.net), [grouped]);

  // Negatif netlerin mutlak toplamı: gerçek ödenecek (pozitif)
  const toplamOdenecek = useMemo(
    () => onlyNegative.reduce((acc, r) => acc + Math.abs(num(r.net)), 0),
    [onlyNegative]
  );

  return (
    <div>
      <PageTitle>Toplam Ödenecekler</PageTitle>
      <Card>
        <Table
          head={<><th align="left">Kişi/Kurum</th><th align="right">Net (Ödenecek)</th></>}
        >
          {loading && <tr><td colSpan={2}><div className="empty">Yükleniyor…</div></td></tr>}
          {!loading && onlyNegative.map(r=>(
            <tr key={String(r.kisi_id ?? "none")}>
              <td>{r.ad}</td>
              <td align="right">{num(r.net).toLocaleString("tr-TR",{minimumFractionDigits:2})}</td>
            </tr>
          ))}
          {!loading && !onlyNegative.length && (
            <tr><td colSpan={2}><div className="empty">Negatif nete sahip kişi/kurum yok.</div></td></tr>
          )}
          {/* TOPLAM SATIRI */}
          {!loading && onlyNegative.length > 0 && (
            <tr style={{ fontWeight: 700, borderTop: "1px solid #e5e7eb" }}>
              <td>TOPLAM</td>
              <td align="right">{toplamOdenecek.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td>
            </tr>
          )}
        </Table>
      </Card>
      <div className="helper" style={{marginTop:8}}>
        Bu liste, kişi bazında <code>Net = -Ödenecek + Ödeme - Tahsilat + Alacak</code> formülünden <b>negatif</b> çıkanları gösterir. Alttaki toplam, bu negatiflerin mutlak değerlerinin toplamıdır.
      </div>
    </div>
  );
}
