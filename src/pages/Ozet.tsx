// src/pages/Ozet.tsx
import { useEffect, useMemo, useState } from "react";
import { getDb, q, getSetting, type Kisi } from "../db";
import { subscribeIslemler } from "../db";
import { Card, Row, PageTitle, Button } from "../components/UI";

type Doviz = "TRY" | "USD" | "EUR" | "ALTIN";
type Tip = "tahsilat" | "odeme" | "odenecek" | "alacak";

type RowT = {
  id: string;
  tarih: string | null;            // YYYY-MM-DD
  tip: Tip;
  kisi_id: string | null;
  aciklama: string | null;
  tutar: number;                   // TL snapshot (gerçekleşenlerde kesin)
  tutar_raw: number | null;        // varsa ham miktar (planlılarda)
  doviz: Doviz | null;             // varsa para birimi (planlılarda)
};

function num(v: unknown){ const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }
function toDate(s?: string | null){
  if(!s) return null;
  const [y,m,d] = s.split("-").map(Number);
  if(!y || !m || !d) return null;
  return new Date(y,(m||1)-1,(d||1),12,0,0); // 12:00 → TZ sapmalarını azalt
}
function monthKey(d: Date){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function fmtTL(n: number){ return Number(n||0).toLocaleString("tr-TR",{ minimumFractionDigits: 2 }); }

export default function Ozet(){
  const [rows, setRows] = useState<RowT[]>([]);
  const [kisiler, setKisiler] = useState<Array<Pick<Kisi,"id"|"ad">>>([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // isMobile state'i chart yüksekliği için hala kullanılıyor

  // Güncel kurlar (Ayarlar'daki anahtarlarla bire bir)
  const [rateUsd, setRateUsd] = useState(0);
  const [rateEur, setRateEur] = useState(0);
  const [rateAltin, setRateAltin] = useState(0);

  // Mobil kontrol
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  async function reloadRates(){
    try {
      const usd = parseFloat((await getSetting("doviz_usd","0")).replace(",", ".")) || 0;
      const eur = parseFloat((await getSetting("doviz_eur","0")).replace(",", ".")) || 0;
      const alt = parseFloat((await getSetting("doviz_altin_gram","0")).replace(",", ".")) || 0;
      setRateUsd(usd); 
      setRateEur(eur); 
      setRateAltin(alt);
    } catch {}
  }

  function convertToTRY(amount: number, unit: Doviz | null | undefined): number {
    if (!unit || unit === "TRY") return amount;
    if (unit === "USD")  return amount * (rateUsd  || 0);
    if (unit === "EUR")  return amount * (rateEur  || 0);
    if (unit === "ALTIN")return amount * (rateAltin|| 0);
    return amount;
  }

  async function loadAll(){
    setLoading(true);
    try{
      await getDb();
      
      // DÜZELTME: Generic tip argümanı kaldırıldı
      let kisiData = await q("SELECT id, ad FROM kisiler ORDER BY ad ASC");
      setKisiler(kisiData as any);
      
      // DÜZELTME: Generic tip argümanı kaldırıldı
      let list = await q(
        "SELECT id, tarih, tip, kisi_id, aciklama, tutar, tutar_raw, doviz " +
        "FROM islemler ORDER BY created_at DESC"
      );
      
      const norm = (list as RowT[]).map(r=>{
        const tutar = Number(r.tutar ?? 0);
        const tutar_raw = r.tutar_raw != null ? 
          parseFloat(String(r.tutar_raw).replace(",", ".")) || null : null;
        return { ...r, tutar, tutar_raw, doviz: (r.doviz as Doviz) ?? null };
      });

      setRows(norm);
      await reloadRates();
    } catch (error) {
      console.error("Veri yükleme hatası:", error);
    } finally{ 
      setLoading(false); 
    }
  }

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const initializeData = async () => {
      await loadAll();
      unsubscribe = subscribeIslemler(loadAll);
    };
    initializeData();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const kisiMap = useMemo(()=>Object.fromEntries(kisiler.map(k=>[k.id, k.ad])), [kisiler]);

  const withDisplay = useMemo(()=>{
    return rows.map(r=>{
      if (r.tip === "odeme" || r.tip === "tahsilat"){
        return { ...r, _tl: num(r.tutar) };
      }
      const hasRaw = r.tutar_raw != null && Number.isFinite(r.tutar_raw);
      const tl = hasRaw ? convertToTRY(r.tutar_raw as number, r.doviz) : num(r.tutar);
      return { ...r, _tl: tl };
    });
  }, [rows, rateUsd, rateEur, rateAltin]);

  const sumBy = (tip: Tip) => withDisplay
    .filter(r=>r.tip===tip)
    .reduce((s,r)=> s + num((r as any)._tl), 0);
  
  const toplamTahsilat = useMemo(()=> sumBy("tahsilat"), [withDisplay]);
  const toplamOdeme    = useMemo(()=> sumBy("odeme"),    [withDisplay]);
  const toplamAlacak   = useMemo(()=> sumBy("alacak"),   [withDisplay]);
 
  const netByKisi = useMemo(()=>{
    const map = new Map<string,{ ad: string; net: number }>();
    for(const r of withDisplay){
      const key = String(r.kisi_id ?? "null");
      if(!map.has(key))
        map.set(key, { ad: r.kisi_id ? (kisiMap[r.kisi_id] ?? "(Bilinmiyor)") : "(Kişisiz)", net: 0 });
      const v = num((r as any)._tl);
      if (r.tip === "odenecek") map.get(key)!.net += -v;
      else if (r.tip === "odeme") map.get(key)!.net +=  v;
      else if (r.tip === "tahsilat") map.get(key)!.net += -v;
      else if (r.tip === "alacak") map.get(key)!.net +=  v;
    }
    return Array.from(map.values());
  }, [withDisplay, kisiMap]);

  const planlananOdenecek = useMemo(() => netByKisi
      .filter(k => k.net < 0)
      .reduce((acc, k) => acc + Math.abs(k.net), 0), [netByKisi]);

  const planlananAlacak = useMemo(() => toplamAlacak - toplamTahsilat, [toplamAlacak, toplamTahsilat]);

  const netDurum = useMemo(() => toplamTahsilat - toplamOdeme, [toplamTahsilat, toplamOdeme]);

  const today = new Date();
  const to30  = new Date(today.getTime() + 30*86400000);
  const yaklasan30Toplam = useMemo(()=>{
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12,0,0);
    return withDisplay
      .filter(r=> r.tip==="odenecek" && r.tarih)
      .filter(r=>{
        const d = toDate(r.tarih!); if(!d) return false;
        return d >= start && d <= to30;
      })
      .reduce((s,r)=> s + num((r as any)._tl), 0);
  }, [withDisplay]);

  const topAlacakli = useMemo(()=> netByKisi.filter(x=>x.net>0).sort((a,b)=> b.net-a.net).slice(0,5), [netByKisi]);
  const topBorc     = useMemo(()=> netByKisi.filter(x=>x.net<0).sort((a,b)=> a.net-b.net).slice(0,5), [netByKisi]);

  const monthly = useMemo(()=>{
    const map = new Map<string,{ tahsilat: number; odeme: number }>();
    for(const r of withDisplay){
      if ((r.tip !== "odeme" && r.tip !== "tahsilat") || !r.tarih) continue;
      const d = toDate(r.tarih); 
      if(!d) continue;
      const key = monthKey(d);
      if(!map.has(key)) map.set(key, { tahsilat:0, odeme:0 });
      const g = map.get(key)!; 
      const val = num((r as any)._tl);
      if (r.tip === "tahsilat") g.tahsilat += val;
      else g.odeme += val;
    }
    
    const out: Array<{ key:string; label:string; tahsilat:number; odeme:number }>=[];
    const base = new Date(today.getFullYear(), today.getMonth(), 1, 12,0,0);
    const ayIsimleri = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    for(let i=5;i>=0;i--){
      const d = new Date(base.getFullYear(), base.getMonth()-i, 1, 12,0,0);
      const mk = monthKey(d); 
      const g = map.get(mk) || { tahsilat:0, odeme:0 };
      const label = `${ayIsimleri[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
      out.push({ key: mk, label, tahsilat: g.tahsilat, odeme: g.odeme });
    }
    return out;
  }, [withDisplay]);

  const maxMonthly = useMemo(()=> Math.max(1, ...monthly.map(m=> Math.max(m.tahsilat, m.odeme))), [monthly]);

  const renderKPI = (icon: string, title: string, value: string, index: number) => (
    <div key={index} className="kpi">
      <div className="icon">{icon}</div>
      <div className="meta">
        <div className="title">{title}</div>
        <div className="val">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="ozet-page">
      <style>{`
        .ozet-page {
          --gap-s: 8px;
          --gap-m: 12px;
          --gap-l: 16px;
          --gap-xl: 20px;

          --padding-s: 8px;
          --padding-m: 12px;
          --padding-l: 16px;
          --padding-xl: 20px;

          --radius-m: 12px;
          --radius-l: 14px;
          
          --chart-height: 140px;
        }

        /* Genel Layout */
        .ozet-page {
          display: flex;
          flex-direction: column;
          gap: var(--gap-l);
        }

        /* KPI Kartları */
        .kpis {
          display: grid;
          gap: var(--gap-m);
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }
        .kpi {
          display: flex;
          align-items: center;
          gap: var(--gap-m);
          padding: var(--padding-l);
          border-radius: var(--radius-m);
          background: var(--panel);
          border: 1px solid var(--border);
          min-height: 70px;
        }
        .kpi .icon {
          font-size: 20px;
        }
        .kpi .meta {
          flex: 1;
          min-width: 0;
        }
        .kpi .title {
          font-size: 11px;
          color: var(--muted);
          font-weight: 600;
          letter-spacing: .3px;
          line-height: 1.2;
          margin-bottom: 4px;
        }
        .kpi .val {
          font-size: 16px;
          font-weight: 800;
          line-height: 1.1;
        }

        /* Ana İçerik Sütunları (Grafik ve Listeler) */
        .cols-2 {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--gap-l);
        }
        .card .card-title {
          font-weight: 800;
          font-size: 18px;
          margin-bottom: var(--gap-l);
        }
        
        /* Nakit Akışı Grafiği */
        .chart {
          display: flex;
          gap: var(--gap-s);
          align-items: flex-end;
          height: var(--chart-height);
          padding: var(--padding-s) 4px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .chart-item {
          flex: 0 0 50px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--gap-s);
        }
        .chart-bars {
          display: flex;
          gap: var(--gap-s);
          align-items: flex-end;
          height: 100%;
        }
        .chart-bar {
          width: 14px;
          border-radius: 6px;
          min-height: 6px;
        }
        .chart-label {
          font-size: 12px;
          color: #6b7280;
          text-align: center;
          line-height: 1.3;
        }
        .chart-legend {
          font-size: 13px;
          color: #6b7280;
          margin-top: var(--gap-m);
          line-height: 1.4;
        }
        .chart::-webkit-scrollbar { height: 6px; }
        .chart::-webkit-scrollbar-track { background: var(--border); border-radius: 3px; }
        .chart::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 3px; }

        /* Kişi Listeleri */
        .list-title {
          font-weight: 700;
          margin-bottom: var(--gap-s);
          font-size: 16px;
        }
        .list + .list {
          margin-top: var(--gap-l);
        }
        .ozet-page ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .ozet-page li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--padding-l) 0;
          border-bottom: 1px dashed var(--border);
          font-size: 16px;
          gap: var(--gap-m);
        }
        .ozet-page li span:first-child {
          flex: 1;
          min-width: 0;
          word-break: break-word;
        }
        .ozet-page li span:last-child {
          flex-shrink: 0;
          white-space: nowrap;
          font-weight: 600;
        }

        /* Alt Aksiyon Bölümü */
        .cols-3 {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--gap-m);
        }
        .helper-text { display: none; }
        
        .button-group {
          display: flex;
          flex-direction: row; /* DÜZELTME: Butonları yan yana hizalar */
          gap: var(--gap-m);
        }
        .button-group button {
          min-height: 48px;
          font-size: 16px;
          flex: 1;
        }

        /* Orta ve Geniş Ekranlar (Tablet ve Üstü) */
        @media (min-width: 768px) {
          .ozet-page {
            --gap-l: 20px;
            --gap-xl: 24px;
            --chart-height: 180px;
          }

          .kpis { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--gap-l); }
          .kpi { border-radius: var(--radius-l); }
          .kpi .icon { font-size: 22px; }
          .kpi .title { font-size: 12px; margin-bottom: 2px; }
          .kpi .val { font-size: 18px; }
          
          .cols-2 { grid-template-columns: 1fr 1fr; gap: var(--gap-xl); }
          .card .card-title { font-size: 20px; margin-bottom: var(--gap-l); }
          
          .chart { gap: var(--gap-m); padding: var(--padding-m) var(--padding-s); }
          .chart-item { flex: 1 1 0; min-width: auto; }
          .chart-bars { gap: var(--gap-s); }
          .chart-bar { width: 18px; border-radius: 8px; }
          .chart-label { font-size: 11px; }

          .list-title { font-size: 15px; }
          .ozet-page li { padding: var(--padding-m) 0; font-size: 14px; }
          
          .cols-3 { grid-template-columns: 1fr auto; align-items: center; gap: var(--gap-l); }
          .helper-text { display: block; align-self: center; }
          .button-group { flex-direction: row; justify-content: flex-end; gap: var(--gap-s); }
          .button-group button { min-height: auto; font-size: 14px; flex: initial; }
        }

        /* Çok Geniş Ekranlar (Desktop) */
        @media (min-width: 1200px) {
          .kpis { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>

      <PageTitle>Özet</PageTitle>

      <div className="kpis">
        {renderKPI("💰", "Toplam Tahsilat", `${fmtTL(toplamTahsilat)} TL`, 0)}
        {renderKPI("💸", "Toplam Ödeme", `${fmtTL(toplamOdeme)} TL`, 1)}
        {renderKPI("📥", "Planlanan Alacak", `${fmtTL(planlananAlacak)} TL`, 2)}
        {renderKPI("📤", "Planlanan Ödenecek", `${fmtTL(planlananOdenecek)} TL`, 3)}
        {renderKPI("🧮", "Net Durum", `${fmtTL(netDurum)} TL`, 4)}
        {renderKPI("⏳", "Önümüzdeki 30 Gün Ödemeleri", `${fmtTL(yaklasan30Toplam)} TL`, 5)}
      </div>

      <Row className="cols-2">
        <Card>
          <div className="card-title">Son 6 Ay – Nakit Akışı</div>
          <div className="chart">
            {monthly.map(m => {
              const chartHeight = isMobile ? 120 : 160;
              const odemeHeight = maxMonthly > 0 ? Math.max(6, (m.odeme / maxMonthly) * chartHeight) : 6;
              const tahsilatHeight = maxMonthly > 0 ? Math.max(6, (m.tahsilat / maxMonthly) * chartHeight) : 6;
              
              return (
                <div key={m.key} className="chart-item">
                  <div className="chart-bars">
                    <div 
                      className="chart-bar"
                      title={`Ödeme: ${fmtTL(m.odeme)} TL`}   
                      style={{ background: "#3b82f6", height: `${odemeHeight}px` }} 
                    />
                    <div 
                      className="chart-bar"
                      title={`Tahsilat: ${fmtTL(m.tahsilat)} TL`} 
                      style={{ background: "#10b981", height: `${tahsilatHeight}px` }} 
                    />
                  </div>
                  <div className="chart-label">{m.label}</div>
                </div>
              );
            })}
          </div>
          <div className="chart-legend">
            Barlar: soldaki <b style={{ color: "#3b82f6" }}>Ödeme</b>, sağdaki <b style={{ color: "#10b981" }}>Tahsilat</b> (TL).
          </div>
        </Card>

        <Card>
          <div className="card-title">İlk 5 – Net Durum (Kişi/Kurum)</div>
          <div className="list">
            <div className="list-title">Bize Borçlu (Alacak)</div>
            {topAlacakli.length === 0 && <div className="empty">Kayıt yok.</div>}
            <ul>
              {topAlacakli.map(x => (
                <li key={x.ad}>
                  <span>{x.ad}</span>
                  <span>{fmtTL(x.net)} TL</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="list">
            <div className="list-title">Bizim Borcumuz (Ödenecek)</div>
            {topBorc.length === 0 && <div className="empty">Kayıt yok.</div>}
            <ul>
              {topBorc.map(x => (
                <li key={x.ad}>
                  <span>{x.ad}</span>
                  <span>{fmtTL(Math.abs(x.net))} TL</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </Row>

      <Card>
        <Row className="cols-3">
          <div className="helper-text">
            Gerçekleşen kalemler <b>kayıt anındaki kurla</b> TL'ye sabittir. Planlı kalemlerde varsa <b>tutar_raw + doviz</b> güncel kurla çevrilir; yoksa snapshot <b>tutar</b> kullanılır.
          </div>
          <div className="button-group">
            <Button variant="secondary" onClick={reloadRates} disabled={loading}>
              {loading ? "Yükleniyor..." : "Kurları Yenile"}
            </Button>
            <Button variant="secondary" onClick={loadAll} disabled={loading}>
              {loading ? "Yükleniyor..." : "Verileri Tazele"}
            </Button>
          </div>
        </Row>
      </Card>
    </div>
  );
}