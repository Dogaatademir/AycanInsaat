// src/pages/ToplamMasraf.tsx
import { useEffect, useMemo, useState } from "react";
import { getDb, q, getSetting, type Kisi } from "../db";
import { subscribeIslemler } from "../db";
import { Card, Row, PageTitle, Table, Button } from "../components/UI";

type Doviz = "TRY" | "USD" | "EUR" | "ALTIN";

type OdemeRow = {
  id: string;
  tarih: string | null;
  tutar: number;                // TL snapshot
  aciklama: string | null;
  tip: "odeme";
  kisi_id: string | null;
  doviz?: Doviz | null;
  tutar_raw?: number | null;
};

export default function ToplamMasraf(){
  const [rows, setRows] = useState<OdemeRow[]>([]);
  const [kisiler, setKisiler] = useState<Array<Pick<Kisi,"id"|"ad">>>([]);
  const [loading, setLoading] = useState(false);

  // (yalnızca bilgi amaçlı) güncel kurlar
  const [rateUsd, setRateUsd] = useState(0);
  const [rateEur, setRateEur] = useState(0);
  const [rateAltin, setRateAltin] = useState(0);

  async function loadAll(){
    setLoading(true);
    try{
      await getDb();
      setKisiler(await q("SELECT id, ad FROM kisiler ORDER BY ad ASC"));
      const data: OdemeRow[] = await q(
        "SELECT id, tarih, tutar, aciklama, tip, kisi_id, doviz, tutar_raw FROM islemler WHERE tip='odeme' ORDER BY created_at ASC, tarih ASC"
      );
      const normalized = data.map(r=>({
        ...r,
        tarih: r.tarih ?? null,
        tutar: Number(r.tutar) || 0,
        tutar_raw: r.tutar_raw == null ? null : Number(r.tutar_raw),
        doviz: (r.doviz as Doviz) ?? null,
      }));
      setRows(normalized);
    } finally{
      setLoading(false);
    }
  }

  async function reloadRates(){
    const usd = parseFloat((await getSetting("doviz_usd","0")).replace(",", ".")) || 0;
    const eur = parseFloat((await getSetting("doviz_eur","0")).replace(",", ".")) || 0;
    const alt = parseFloat((await getSetting("doviz_altin_gram","0")).replace(",", ".")) || 0;
    setRateUsd(usd); setRateEur(eur); setRateAltin(alt);
  }

  // ilk yükleme + realtime
  useEffect(()=>{ 
    (async()=>{
      await loadAll();
      await reloadRates();
      // 🔴 Realtime: islemler değişince ödeme listesi otomatik tazelensin
      const unsub = subscribeIslemler(() => { loadAll(); });
      return () => { unsub?.(); };
    })();
  },[]);

  // Ödeme olduğu için direkt TL snapshot
  const toplamMasraf = useMemo(()=> rows.reduce((s,r)=> s + Number(r.tutar||0), 0), [rows]);

  const kisiMap = useMemo(()=>Object.fromEntries(kisiler.map(k=>[k.id, k.ad])), [kisiler]);
  function printNow(){ setTimeout(()=>window.print(), 50); }

  return (
    <div>
      <style>{`@media print{ .sidebar, .header, .nav, .no-print { display:none !important; } .main { padding: 0 !important; } @page { size:auto; margin:12mm; } }`}</style>
      <PageTitle>Toplam Masraf</PageTitle>

      <div className="no-print">
        <Card>
          <Row className="cols-3">
            <div className="helper" style={{alignSelf:"center"}}>
              Tüm <b>Ödeme</b> kalemleri kayıt anındaki kurla TL’ye sabittir.
            </div>
            <div />
            <div style={{display:"flex", justifyContent:"flex-end", gap:8}}>
              <Button variant="secondary" onClick={reloadRates}>Kurları Yenile</Button>
              <Button variant="secondary" onClick={printNow}>Yazdır</Button>
            </div>
          </Row>
        </Card>
      </div>

      <div style={{height:12}}/>

      <Card>
        <Table
          head={<>
            <th align="left">Tarih</th>
            <th align="left">Kişi/Kurum</th>
            <th align="left">Açıklama</th>
            <th align="right">Tutar (TL)</th>
          </>}
        >
          {loading && <tr><td colSpan={4}><div className="empty">Yükleniyor…</div></td></tr>}
          {!loading && rows.map(r=>(
            <tr key={r.id}>
              <td>{r.tarih || "—"}</td>
              <td>{r.kisi_id ? (kisiMap[r.kisi_id] || ("#"+String(r.kisi_id).slice(0,6))) : "—"}</td>
              <td>{r.aciklama || "—"}</td>
              <td align="right">{Number(r.tutar).toLocaleString("tr-TR",{minimumFractionDigits:2})}</td>
            </tr>
          ))}
          {!loading && !rows.length && (
            <tr><td colSpan={4}><div className="empty">Henüz ödeme kaydı yok.</div></td></tr>
          )}
          {/* Toplam satırı */}
          {!loading && rows.length>0 && (
            <tr>
              <td colSpan={3} align="right" style={{fontWeight:800}}>TOPLAM</td>
              <td align="right" style={{fontWeight:800}}>
                {toplamMasraf.toLocaleString("tr-TR",{minimumFractionDigits:2})}
              </td>
            </tr>
          )}
        </Table>

        <div style={{marginTop:16, display:"flex", justifyContent:"flex-end"}}>
          <div className="helper">
            Bilgi: Güncel Kurlar — USD: {rateUsd || 0} • EUR: {rateEur || 0} • ALTIN: {rateAltin || 0}
          </div>
        </div>
      </Card>
    </div>
  );
}
