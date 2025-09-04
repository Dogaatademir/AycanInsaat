// src/pages/ToplamAlacaklar.tsx
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
  tutar: number;
  tutar_raw: number | null;
  doviz: Doviz | null;
};

function num(v: unknown){ const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }

export default function ToplamAlacaklar(){
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

  const display = useMemo(()=>{
    return rows.map(r=>{
      // yalnızca alacak ve tahsilat için hesaplama
      if (r.tip !== "alacak" && r.tip !== "tahsilat") return {...r, _tl: 0};
      const hasRaw = r.tutar_raw != null && Number.isFinite(r.tutar_raw);
      const tl = hasRaw ? convertToTRY(r.tutar_raw as number, r.doviz) : num(r.tutar);
      return {...r, _tl: tl};
    });
  }, [rows, rateUsd, rateEur, rateAltin]);

  const grouped: RowAgg[] = useMemo(()=>{
    const map = new Map<string, RowAgg>();
    for (const r of display){
      if (r.tip !== "alacak" && r.tip !== "tahsilat") continue;
      const key = String(r.kisi_id ?? "null");
      if(!map.has(key)) map.set(key, { kisi_id: r.kisi_id, ad: r.ad, net: 0 });
      const g = map.get(key)!;
      if (r.tip === "alacak") g.net += num(r._tl);
      else if (r.tip === "tahsilat") g.net -= num(r._tl);
    }
    return Array.from(map.values());
  }, [display]);

  const onlyPositive = useMemo(()=> grouped.filter(g=>g.net > 0).sort((a,b)=> b.net - a.net), [grouped]);

  const toplamAlacak = useMemo(
    () => onlyPositive.reduce((acc, r) => acc + num(r.net), 0),
    [onlyPositive]
  );

  return (
    <div>
      <PageTitle>Toplam Alacaklar</PageTitle>
      <Card>
        <Table
          head={<><th align="left">Kişi/Kurum</th><th align="right">Alacak - Tahsilat</th></>}
        >
          {loading && <tr><td colSpan={2}><div className="empty">Yükleniyor…</div></td></tr>}
          {!loading && onlyPositive.map(r=>(
            <tr key={String(r.kisi_id ?? "none")}>
              <td>{r.ad}</td>
              <td align="right">{num(r.net).toLocaleString("tr-TR",{minimumFractionDigits:2})}</td>
            </tr>
          ))}
          {!loading && !onlyPositive.length && (
            <tr><td colSpan={2}><div className="empty">Alacağı tahsil edilmemiş kişi/kurum yok.</div></td></tr>
          )}
          {/* TOPLAM SATIRI */}
          {!loading && onlyPositive.length > 0 && (
            <tr style={{ fontWeight: 700, borderTop: "1px solid #e5e7eb" }}>
              <td>TOPLAM</td>
              <td align="right">{toplamAlacak.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td>
            </tr>
          )}
        </Table>
      </Card>
      <div className="helper" style={{marginTop:8}}>
        Bu liste <code>Alacak − Tahsilat</code> formülünü uygular ve toplam alacağı TL cinsinden gösterir.
      </div>
    </div>
  );
}
