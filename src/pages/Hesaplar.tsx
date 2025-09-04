

// src/pages/Hesaplar.tsx
import { useEffect, useMemo, useState } from "react";
import { getDb, q, getSetting, type Kisi } from "../db";
import { subscribeIslemler, subscribeKisiler } from "../db";
import { Card, Row, Select, PageTitle, Table, Button, Input } from "../components/UI";

type Doviz = "TRY" | "USD" | "EUR" | "ALTIN";

type Hareket = {
  id: string;
  tarih: string | null;
  tutar: number;                // TL snapshot
  aciklama: string | null;
  tip: "tahsilat" | "odeme" | "odenecek" | "alacak";
  is_bitiminde?: number;        // 0/1
  doviz?: Doviz | null;
  tutar_raw?: number | null;
  _tl?: number;                 // hesaplanan TL (görünüm için)
};

export default function Hesaplar(){
  const [kisiler, setKisiler] = useState<Array<Pick<Kisi,'id'|'ad'>>>([]);
  const [seciliKisi, setSeciliKisi] = useState<string>("");
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");

  const [rateUsd, setRateUsd] = useState(0);
  const [rateEur, setRateEur] = useState(0);
  const [rateAltin, setRateAltin] = useState(0);

  useEffect(()=>{(async()=>{
    await loadKisiler();
    await reloadRates();
  })();},[]);

  useEffect(()=>{(async()=>{
    setLoading(true);
    try { await loadHareketler(seciliKisi); } finally { setLoading(false); }
    setQuery("");
  })();},[seciliKisi]);

  useEffect(()=> {
    const unKisiler = subscribeKisiler(() => { loadKisiler(); });
    const unIsl = subscribeIslemler(() => { if (seciliKisi) loadHareketler(seciliKisi); });
    return () => { unKisiler?.(); unIsl?.(); };
  }, [seciliKisi]);

  async function loadKisiler(){
    await getDb();
    setKisiler(await q("SELECT id, ad FROM kisiler ORDER BY ad ASC"));
  }
  async function loadHareketler(kisiId: string){
    if(!kisiId){ setHareketler([]); return; }
    await getDb();
    const rows: Hareket[] = await q(
      "SELECT id, tarih, tutar, aciklama, tip, is_bitiminde, doviz, tutar_raw FROM islemler WHERE kisi_id = ? ORDER BY created_at ASC, tarih ASC",
      [kisiId]
    );
    const normalized = rows.map(r=>({
      ...r,
      tarih: r.tarih ?? null,
      tutar: Number(r.tutar) || 0,
      tutar_raw: r.tutar_raw == null ? null : Number(r.tutar_raw),
      doviz: (r.doviz as Doviz) ?? null
    }));
    setHareketler(normalized);
  }

  async function reloadRates(){
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

  // Görüntülenecek TL: tahsilat/ödeme -> snapshot, planlananlar -> güncel kur
  const displayRows = useMemo(()=> {
    return hareketler.map(h=>{
      if (h.tip === "odeme" || h.tip === "tahsilat") {
        return {...h, _tl: Number(h.tutar || 0)};
      }
      const hasRaw = h.tutar_raw != null && Number.isFinite(h.tutar_raw as number);
      const tl = hasRaw ? convertToTRY(h.tutar_raw as number, h.doviz) : Number(h.tutar || 0);
      return {...h, _tl: tl};
    });
  }, [hareketler, rateUsd, rateEur, rateAltin]);

  const filteredRows = useMemo(()=>{
    const qText = query.trim().toLocaleLowerCase("tr");
    if(!qText) return displayRows;
    return displayRows.filter(r=>{
      const acik = (r.aciklama || "").toLocaleLowerCase("tr");
      const tar  = (r.is_bitiminde ? "iş bitiminde" : (r.tarih || "—")).toLocaleLowerCase("tr");
      const tip  = r.tip.toLocaleLowerCase("tr");
      return acik.includes(qText) || tar.includes(qText) || tip.includes(qText);
    });
  }, [displayRows, query]);

  const toplam = useMemo(()=> {
    const sum = (arr: typeof filteredRows, t: Hareket["tip"]) =>
      arr.filter(h=>h.tip===t).reduce((s,h)=> s + Number(h._tl||0), 0);
    const tahsilat = sum(filteredRows, "tahsilat");
    const odeme    = sum(filteredRows, "odeme");
    const odenecek = sum(filteredRows, "odenecek");
    const alacak   = sum(filteredRows, "alacak");
    const net      = -odenecek + odeme - tahsilat + alacak;
    return { tahsilat, odeme, odenecek, alacak, net };
  }, [filteredRows]);

  const seciliKisiAd = useMemo(
    () => (kisiler.find(k => k.id === seciliKisi)?.ad ?? ""),
    [kisiler, seciliKisi]
  );

  // --- YAZDIRMA: Sadece body içeriği (head/html yok) ---
  function buildPrintBody() {
    const today = new Date().toLocaleDateString('tr-TR');
    return `
      <div class="print-page">
        <div class="print-header">
          <h1>HESAP RAPORU</h1>
          <div class="subtitle">${seciliKisiAd}</div>
          <div class="date">Rapor Tarihi: ${today}</div>
        </div>

        ${filteredRows.length > 0 ? `
          <table class="print-table">
            <thead>
              <tr>
                <th class="col-tarih">Tarih</th>
                <th class="col-tip">İşlem Tipi</th>
                <th class="col-tutar">Tutar (TL)</th>
                <th class="col-aciklama">Açıklama</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRows.map(r => `
                <tr>
                  <td class="col-tarih">${r.is_bitiminde ? "İş bitiminde" : (r.tarih || "—")}</td>
                  <td class="col-tip">${r.tip}</td>
                  <td class="col-tutar">${Number(r._tl).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                  <td class="col-aciklama">${r.aciklama || "—"}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="print-summary">
            <h3>ÖZET</h3>
            <div class="summary-grid">
              <div class="summary-item"><span class="label">Tahsilat:</span><span class="value">${toplam.tahsilat.toLocaleString("tr-TR",{minimumFractionDigits:2})} TL</span></div>
              <div class="summary-item"><span class="label">Ödeme:</span><span class="value">${toplam.odeme.toLocaleString("tr-TR",{minimumFractionDigits:2})} TL</span></div>
              <div class="summary-item"><span class="label">Planlanan Ödenecek:</span><span class="value">${toplam.odenecek.toLocaleString("tr-TR",{minimumFractionDigits:2})} TL</span></div>
              <div class="summary-item"><span class="label">Planlanan Alacak:</span><span class="value">${toplam.alacak.toLocaleString("tr-TR",{minimumFractionDigits:2})} TL</span></div>
            </div>
            <div class="net-total">Net Durum: <span class="net-value">${toplam.net.toLocaleString("tr-TR",{minimumFractionDigits:2})} TL</span></div>
          </div>
        ` : `
          <div class="empty-message">Bu kişi/kurum için henüz işlem kaydı bulunmamaktadır.</div>
        `}
      </div>
    `;
  }

  // --- Yazdırma (aynı pencere, print-only alan; layout garantili + doğru temizlik) ---
  function handlePrint() {
  if (!seciliKisi || !seciliKisiAd) {
    alert("Lütfen önce bir kişi/kurum seçin.");
    return;
  }
  const area = document.getElementById("__print_area__");
  if (!area) {
    alert("Yazdırma alanı bulunamadı.");
    return;
  }

  // İçeriği doldur
  area.innerHTML = buildPrintBody();

  // Temizlik: yalnızca baskı gerçekten bitince
  const cleanup = () => {
    area.innerHTML = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  // Doğrudan yazdır
  window.print();
}


  return (
    <div>
      <style>{`
        .row.resp{ grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); }
        .actions-right{ display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap }
        @media(max-width:768px){ .actions-right{ justify-content:stretch } }

        .table-scroll{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
        .table th,.table td{white-space:nowrap}
        .table .col-aciklama{white-space:normal;word-break:break-word;min-width:220px;max-width:560px}

        /* ---------- PRINT-ONLY ALANININ TEMEL STİLLERİ (ekran için) ---------- */
        #__print_area__ {
          position: absolute;
          
          
        }
        #__print_area__ .print-header {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 2px solid #333;
        }
        #__print_area__ .print-header h1 {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        #__print_area__ .print-header .subtitle { font-size: 14px; color: #666; margin-bottom: 3px; }
        #__print_area__ .print-header .date { font-size: 11px; color: #888; }
        #__print_area__ .print-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 11px; }
        #__print_area__ .print-table th, #__print_area__ .print-table td {
          border: 1px solid #ddd; padding: 8px 6px; text-align: left; vertical-align: top;
        }
        #__print_area__ .print-table th { background-color: #f5f5f5; font-weight: bold; text-align: center; }
        #__print_area__ .col-tarih { width: 15%; text-align: center; }
        #__print_area__ .col-tip { width: 15%; text-align: center; }
        #__print_area__ .col-tutar { width: 18%; text-align: right; font-weight: 600; }
        #__print_area__ .col-aciklama { width: 52%; word-wrap: break-word; }
        #__print_area__ .print-summary { margin-top: 30px; padding: 15px; background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 5px; }
        #__print_area__ .print-summary h3 { font-size: 14px; margin-bottom: 12px; text-align: center; color: #333; }
        #__print_area__ .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px; }
        #__print_area__ .summary-item { display: flex; justify-content: space-between; padding: 5px 8px; background: white; border-radius: 3px; border: 1px solid #e0e0e0; }
        #__print_area__ .summary-item .label { color: #666; }
        #__print_area__ .summary-item .value { font-weight: bold; color: #333; }
        #__print_area__ .net-total { text-align: center; padding: 10px; background: #e8f4f8; border: 2px solid #4a90a4; border-radius: 5px; font-weight: bold; font-size: 13px; }
        #__print_area__ .net-total .net-value { font-size: 16px; color: #2c5530; }
        #__print_area__ .empty-message { text-align: center; padding: 40px 20px; color: #888; font-style: italic; }

        /* ---------- YAZDIRMA ---------- */
        @media print {
          /* Sayfa geometrisi */
          @page { size: A4; margin: 0; }
          html, body {
            width: 210mm !important;
            height: 295mm !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Uygulama kabuğu (sidebar/üstbar vb.) */
          .no-print { display: none !important; }

          /* Yazdırma alanı görünür ve A4 genişliğinde */
          #__print_area__ {
            position: dynamic !important;
            display: block !important;
            width: 210mm !important;
            height: auto !important;
            max-width: none !important;
          }

          /* Gerçek “sayfa” — 15mm kenar boşluğu */
          #__print_area__ .print-page {
            width: calc(210mm - 30mm) !important;
            min-height: calc(297mm - 30mm) !important;
            margin: 15mm auto !important;
            box-sizing: border-box;
          }

          /* Nadir WebKit durumları için tablo görünürlüğünü garanti et */
          #__print_area__ table { display: table !important; width: 100% !important; border-collapse: collapse; }
          #__print_area__ thead { display: table-header-group !important; }
          #__print_area__ tbody { display: table-row-group !important; }
          #__print_area__ tr { display: table-row !important; }
          #__print_area__ th, #__print_area__ td { display: table-cell !important; }
        }
      `}</style>

      {/* ANA İÇERİK -> no-print (sidebar/üstbar bileşenleri de kendi taraflarında no-print almalı) */}
      <div className="no-print">
        <div>
          <PageTitle>Hesaplar</PageTitle>
        </div>

        <div>
          <Card>
            <Row className="resp">
              {/* Kişi seçimi */}
              <div className="select-wrap" style={{minWidth:220}}>
                <Select value={seciliKisi} onChange={e=>setSeciliKisi(e.target.value)} className="select" aria-label="Kişi/Ünvan">
                  <option value="">Kişi/Ünvan seçin…</option>
                  {kisiler.map(k=> <option key={k.id} value={k.id}>{k.ad}</option>)}
                </Select>
              </div>

              {/* Ara */}
              <div>
                {seciliKisi ? (
                  <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
                    <label className="helper">Ara:</label>
                    <Input
                      placeholder="Açıklama, tarih veya işlem tipinde ara…"
                      value={query}
                      onChange={e=>setQuery(e.target.value)}
                      className="input"
                      aria-label="Hesap içi arama"
                      style={{flex:"1 1 220px", minWidth:0}}
                    />
                    {query && (
                      <Button variant="ghost" onClick={()=>setQuery("")} title="Temizle">Temizle</Button>
                    )}
                  </div>
                ) : (
                  <div className="helper" style={{alignSelf:"center"}}>
                    Kişi/kurum seçildiğinde arama yapabilirsin.
                  </div>
                )}
              </div>

              {/* Kurları yenile / Yazdır */}
              <div className="actions-right">
                  <Button
                  variant="secondary"
                  onClick={handlePrint}
                  disabled={!seciliKisi}
                  title={!seciliKisi ? "Önce kişi/kurum seçin" : "Hesap raporunu yazdır"}
                >
                  Yazdır
                </Button>
              </div>
            </Row>
          </Card>
        </div>

        <div style={{height:12}}/>

        <Card>
          <div className="table-scroll">
            <Table
              head={
                <>
                  <th align="left">Tarih</th>
                  <th align="left">Tip</th>
                  <th align="right">Tutar (TL)</th>
                  <th className="col-aciklama" align="left">Açıklama</th>
                </>
              }
            >
              {loading && <tr><td colSpan={4}><div className="empty">Yükleniyor…</div></td></tr>}
              {!loading && filteredRows.map((r)=>(
                <tr key={`${r.tip}-${r.id}`}>
                  <td>{r.is_bitiminde ? "İş bitiminde" : (r.tarih || "—")}</td>
                  <td>{r.tip}</td>
                  <td align="right">{Number(r._tl).toLocaleString('tr-TR',{minimumFractionDigits:2})}</td>
                  <td className="col-aciklama">{r.aciklama || "—"}</td>
                </tr>
              ))}
              {!loading && !filteredRows.length && (
                <tr><td colSpan={4}>
                  <div className="empty">
                    {seciliKisi
                      ? (query ? "Eşleşen kayıt bulunamadı." : "Kayıt bulunamadı.")
                      : "Henüz kişi/kurum seçilmedi."}
                  </div>
                </td></tr>
              )}
            </Table>
          </div>

          {seciliKisi && (
            <div style={{marginTop:16, display:"flex", gap:16, flexWrap:"wrap"}}>
              <span className="helper" style={{fontSize:"0.9rem"}}>
                Tahsilat: <b>{toplam.tahsilat.toLocaleString("tr-TR",{minimumFractionDigits:2})}</b>
              </span>
              <span className="helper" style={{fontSize:"0.9rem"}}>
                Ödeme: <b>{toplam.odeme.toLocaleString("tr-TR",{minimumFractionDigits:2})}</b>
              </span>
              <span className="helper" style={{fontSize:"0.9rem"}}>
                Planlanan Ödenecek: <b>{toplam.odenecek.toLocaleString("tr-TR",{minimumFractionDigits:2})}</b>
              </span>
              <span className="helper" style={{fontSize:"0.9rem"}}>
                Planlanan Alacak: <b>{toplam.alacak.toLocaleString("tr-TR",{minimumFractionDigits:2})}</b>
              </span>
              <span
                className="helper"
                style={{ fontSize:"0.9rem", color:"var(--text)", fontWeight:800 }}
                title="Net = -Planlanan Ödenecek + Ödeme - Tahsilat + Alacak"
              >
                Net: <b>{toplam.net.toLocaleString("tr-TR",{minimumFractionDigits:2})}</b>
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* YAZDIRMA BÖLGESİ: Yazdırma sırasında gösterilecek kopya */}
      <div id="__print_area__" aria-hidden="true" />
    </div>
  );
}
