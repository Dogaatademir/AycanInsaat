// src/pages/Islemler.tsx
import { useEffect, useMemo, useState } from "react";
import {
  getDb, q, run, uid,
  type Kisi, type Islem, type IslemTip, getSetting,
} from "../db";
import { subscribeIslemler } from "../db";
import { toAmount, formatAmountTR } from "../utils";
import { Card, Input, Select, Button, PageTitle, Table } from "../components/UI";

type Doviz = "TRY" | "USD" | "EUR" | "ALTIN";
type TipAll = IslemTip | "odenecek" | "alacak" | ""; // "" -> placeholder için

interface IslemFormState {
  id: string; tarih: string; tip: TipAll; tutar: string;
  kisi_id: string; aciklama: string; is_bitiminde: boolean; doviz: Doviz;
}

/* 🔒 Scoped CSS: Sadece .islemler-page altında geçerli */
const ComponentStyles = () => (
  <style>{`
    .islemler-page .form-grid {
      display: grid; gap: 16px;
      grid-template-areas:
        "tarih    tip      tutar"
        "kisi     aciklama actions";
      grid-template-columns: 1fr 2fr auto;
    }
    .islemler-page .field-tarih { grid-area:tarih; }
    .islemler-page .field-tip { grid-area:tip; }
    .islemler-page .field-tutar { grid-area:tutar; }
    .islemler-page .field-kisi { grid-area:kisi; }
    .islemler-page .field-aciklama { grid-area:aciklama; }
    .islemler-page .field-actions { grid-area:actions; display:flex; justify-content:flex-end; align-items:flex-end; }

    @media(max-width:992px){
      .islemler-page .form-grid {
        grid-template-columns:1fr auto;
        grid-template-areas:
          "tarih tip"
          "tutar kisi"
          "aciklama actions";
      }
    }
    @media(max-width:768px){
      .islemler-page .form-grid {
        grid-template-columns:1fr;
        grid-template-areas: "tarih" "tip" "tutar" "kisi" "aciklama" "actions";
      }
    }

    /* ❗ Eskiden .label globaldi; artık yalnız bu sayfada .form-label */
    .islemler-page .form-label { margin-bottom:6px; font-size:0.875rem; font-weight:500; color:#4a5568; }
    .islemler-page .amount-line { display:flex; align-items:center; gap:8px; }
    .islemler-page .amount-line .input { flex-grow:1; }
    .islemler-page .amount-line .select-wrap { flex-shrink:0; width:110px; }

    .islemler-page .filter-line { display:flex; gap:16px; align-items:center; }
    .islemler-page .filter-line > * { flex:1; min-width:0; }
    .islemler-page .filter-line .search-wrap { position:relative; display:flex; align-items:center; }
    .islemler-page .filter-line .search-wrap .input { padding-right:80px; }
    .islemler-page .filter-line .search-wrap > .Button { position:absolute; right:5px; height:80%; }
    @media (max-width:768px) {
      .islemler-page .filter-line { flex-direction: column; align-items: stretch; gap: 12px; }
    }

    .islemler-page .btn-wide { width: min(100%, 400px); }
    @media(max-width:768px){ .islemler-page .btn-wide{ width:100%; } }

    /* ===== Modal (scoped) ===== */
    .islemler-page .modal-backdrop {
      position:fixed; inset:0; background:rgba(0,0,0,0.5);
      display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;
    }
    .islemler-page .modal-box {
      background:#fff; padding:20px; border-radius:12px;
      width:min(860px, 100%); box-shadow:0 6px 20px rgba(0,0,0,0.2); animation:fadeIn .2s ease-out;
    }
    .islemler-page .modal-title { font-size:18px; font-weight:700; margin:0 0 12px; color:#111; }
    .islemler-page .modal-actions { display:flex; justify-content:flex-end; gap:12px; margin-top:12px; }

    @keyframes fadeIn { from { opacity:0; transform:translateY(-10px);} to { opacity:1; transform:translateY(0);} }
  `}</style>
);

export default function Islemler(){
  const [rows, setRows] = useState<Islem[]>([]);
  const [kisiler, setKisiler] = useState<Array<Pick<Kisi,"id"|"ad">>>([]);
  const [mode, setMode] = useState<"create"|"edit">("create");

  // Kurlar
  const [rateUsd, setRateUsd] = useState(0);
  const [rateEur, setRateEur] = useState(0);
  const [rateAltin, setRateAltin] = useState(0);

  const emptyForm: IslemFormState = {
    id:"", tarih:"", tip:"", tutar:"", kisi_id:"", aciklama:"", is_bitiminde:false, doviz:"TRY"
  };
  const [form, setForm] = useState<IslemFormState>(emptyForm);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving,setSaving]=useState(false);

  const [query, setQuery] = useState("");
  const [kisiFilter, setKisiFilter] = useState("");

  const DOVIZ_SYMBOL: Record<Doviz, string> = { TRY:"₺", USD:"$", EUR:"€", ALTIN:"🪙" };

  useEffect(()=>{(async()=>{
    await getDb();
    const usd = parseFloat((await getSetting("doviz_usd","0")).replace(",", ".")) || 0;
    const eur = parseFloat((await getSetting("doviz_eur","0")).replace(",", ".")) || 0;
    const alt = parseFloat((await getSetting("doviz_altin_gram","0")).replace(",", ".")) || 0;
    setRateUsd(usd); setRateEur(eur); setRateAltin(alt);

    await reloadAll();
    const unsub = subscribeIslemler(() => { reloadAll(); });
    return () => { unsub?.(); };
  })();},[]);

  async function reloadAll(){
    const list: Islem[] = await q("SELECT * FROM islemler ORDER BY created_at DESC, COALESCE(tarih,'9999-12-31') DESC");
    setRows(list);
    const ks: Array<Pick<Kisi,"id"|"ad">> = await q("SELECT id, ad FROM kisiler ORDER BY ad ASC");
    setKisiler(ks);
  }

  function convertToTRY(amount: number, unit: Doviz): number {
    if (unit === "TRY") return amount;
    if (unit === "USD") { if (rateUsd <= 0) throw new Error("USD kuru Ayarlar'da tanımlı değil."); return amount * rateUsd; }
    if (unit === "EUR") { if (rateEur <= 0) throw new Error("EUR kuru Ayarlar'da tanımlı değil."); return amount * rateEur; }
    if (rateAltin <= 0) throw new Error("Gram Altın fiyatı Ayarlar'da tanımlı değil.");
    return amount * rateAltin;
  }

  const isDateValidForCreate =
    (form.tip === "tahsilat" || form.tip === "odeme")
      ? !!form.tarih
      : (form.tip === "odenecek" || form.tip === "alacak")
        ? (!!form.tarih || !!form.is_bitiminde)
        : false;

  const canSubmit = !!form.kisi_id && !!form.tip && isDateValidForCreate;

  async function add(){
    try{
      setSaving(true);
      if (!form.kisi_id) { alert("Kişi seçimi zorunludur."); return; }
      if (!form.tip) { alert("İşlem tipi seçiniz."); return; }
      if (!isDateValidForCreate) {
        if (form.tip === "tahsilat" || form.tip === "odeme") alert("Tarih seçmeniz gerekiyor.");
        else alert("Tarih seçin veya 'İş bitiminde / İleri tarihte' seçeneğini işaretleyin.");
        return;
      }
      const amountInput = toAmount(form.tutar);
      if (!amountInput) { alert("Tutar gerekli"); return; }
      let amountTRY = amountInput;
      try{ amountTRY = convertToTRY(amountInput, form.doviz); }
      catch(e:any){ alert(e?.message || String(e)); return; }

      const id = uid();
      const isBitiminde = (form.tip === "odenecek" || form.tip === "alacak") && form.is_bitiminde ? 1 : 0;
      const tarihForDb = isBitiminde ? null : (form.tarih || null);

      await run(
        "INSERT INTO islemler(id,tarih,tutar,tip,is_bitiminde,kisi_id,aciklama,doviz,tutar_raw) VALUES (?,?,?,?,?,?,?,?,?)",
        [id, tarihForDb, amountTRY, form.tip, isBitiminde, form.kisi_id, form.aciklama || null, form.doviz, amountInput]
      );

      setForm({...emptyForm}); setMode("create"); await reloadAll();
    } finally { setSaving(false); }
  }

  const [editSnap, setEditSnap] = useState<{ raw: number; doviz: Doviz; tip: TipAll; tutarTL: number; } | null>(null);

  function startEdit(row: Islem){
    const r: any = row as any;
    setMode("edit");
    setForm({
      id: row.id, tarih: row.tarih ?? "", tip: (row.tip as TipAll),
      tutar: String(r.tutar_raw ?? row.tutar ?? ""), kisi_id: row.kisi_id || "",
      aciklama: row.aciklama || "", is_bitiminde: r.is_bitiminde ? (r.is_bitiminde === 1) : false,
      doviz: (r.doviz as Doviz) || "TRY",
    });
    setEditSnap({
      raw: r.tutar_raw != null ? Number(r.tutar_raw) : (Number(row.tutar) || 0),
      doviz: (r.doviz as Doviz) || "TRY", tip: (row.tip as TipAll),
      tutarTL: Number(row.tutar) || 0,
    });
  }

  async function saveEdit(){
    if(!form.id) return;
    try{
      setSaving(true);
      if (!form.kisi_id) { alert("Kişi seçimi zorunludur."); return; }
      if (!form.tip) { alert("İşlem tipi seçiniz."); return; }
      if (!isDateValidForCreate) {
        if (form.tip === "tahsilat" || form.tip === "odeme") alert("Tarih seçmeniz gerekiyor.");
        else alert("Tarih seçin veya 'İş bitiminde / İleri tarihte' seçeneğini işaretleyin.");
        return;
      }
      const amountInput = toAmount(form.tutar);
      if (!amountInput) { alert("Tutar gerekli"); return; }

      const isGerceklesen = form.tip === "tahsilat" || form.tip === "odeme";
      let amountTRY: number;

      if (isGerceklesen && editSnap &&
          editSnap.tip === form.tip && editSnap.doviz === form.doviz &&
          Math.abs(editSnap.raw - amountInput) < 1e-9) {
        amountTRY = editSnap.tutarTL;
      } else {
        amountTRY = convertToTRY(amountInput, form.doviz);
      }

      const isBitiminde = (form.tip === "odenecek" || form.tip === "alacak") && form.is_bitiminde ? 1 : 0;
      const tarihForDb = isBitiminde ? null : (form.tarih || null);

      await run(
        "UPDATE islemler SET tarih=?, tutar=?, tip=?, is_bitiminde=?, kisi_id=?, aciklama=?, doviz=?, tutar_raw=? WHERE id=?",
        [tarihForDb, amountTRY, form.tip, isBitiminde, form.kisi_id, form.aciklama || null, form.doviz, amountInput, form.id]
      );

      setForm({...emptyForm}); setMode("create"); setEditSnap(null); await reloadAll();
    } finally { setSaving(false); }
  }

  function cancelEdit(){ setForm({...emptyForm}); setMode("create"); setEditSnap(null); }

  async function delRow(id:string){
    try{
      setDeletingId(id);
      setRows(prev=>prev.filter(r=>r.id!==id));
      await run("DELETE FROM islemler WHERE id=?", [String(id)]);
      if (mode === "edit" && form.id === id) cancelEdit();
      await reloadAll();
    } finally { setDeletingId(null); }
  }

  function askDelete(id: string){ setConfirmDeleteId(id); }
  function cancelAskDelete(){ setConfirmDeleteId(null); }
  async function confirmDelete(){ if(confirmDeleteId){ const id = confirmDeleteId; setConfirmDeleteId(null); await delRow(id); } }

  const kisiMap: Record<string, string> = useMemo(() => {
    const entries: Array<[string, string]> = kisiler.map(k => [String(k.id), k.ad ?? ""]);
    return Object.fromEntries(entries);
  }, [kisiler]);

  const filteredRows = useMemo(()=>{
    const qText = query.trim().toLocaleLowerCase("tr");
    return rows.filter((r)=>{
      if (kisiFilter && String(r.kisi_id || "") !== kisiFilter) return false;
      if (!qText) return true;

      const tip  = (r.tip || "").toString().toLocaleLowerCase("tr");
      const acik = (r.aciklama || "").toLocaleLowerCase("tr");
      const tar  = ((r as any).is_bitiminde === 1
                    ? (r.tip === "odenecek" ? "iş bitiminde" : (r.tip === "alacak" ? "ileri tarihte" : "—"))
                    : (r.tarih || "—")).toLocaleLowerCase("tr");
      const kisiAd = r.kisi_id ? (kisiMap[String(r.kisi_id)] ?? "") : "";

      return tip.includes(qText) || acik.includes(qText) || tar.includes(qText) || kisiAd.includes(qText);
    });
  }, [rows, query, kisiFilter, kisiMap]);

  return (
    <div className="islemler-page">
      <ComponentStyles />
      <PageTitle>İşlemler</PageTitle>

      {mode === "create" && (
        <Card>
          <div className="form-grid">
            <div className="field field-tarih">
              <label className="form-label">Tarih</label>
              <Input
                type="date"
                value={form.tarih ?? ""}
                placeholder="Tarih Seçiniz"
                onChange={e=>setForm({...form, tarih:e.target.value})}
                disabled={false}
                aria-label="Tarih"
                className="date"
              />
            </div>

            <div className="field field-tip">
              <label className="form-label">İşlem Tipi</label>
              <div className="select-wrap">
                <Select
                  required
                  value={form.tip}
                  onChange={e=>{
                    const nextTip = e.target.value as TipAll;
                    setForm(f=>({
                      ...f,
                      tip: nextTip,
                      is_bitiminde: (nextTip === "odenecek" || nextTip === "alacak") ? f.is_bitiminde : false
                    }));
                  }}
                  aria-label="İşlem Tipi"
                  className="select no-muted-placeholder"
                >
                  <option value="" disabled>İşlem Tipi Seçiniz</option>
                  <option value="tahsilat">Tahsilat</option>
                  <option value="odeme">Ödeme</option>
                  <option value="odenecek">Ödenecek</option>
                  <option value="alacak">Alacak</option>
                </Select>
              </div>
              {(form.tip === "odenecek" || form.tip === "alacak") && (
                <label className="helper" style={{display:"flex", alignItems:"center", gap:6, marginTop:6}}>
                  <input
                    type="checkbox"
                    checked={!!form.is_bitiminde}
                    onChange={e=>setForm({...form, is_bitiminde: e.target.checked})}
                  />
                  {form.tip === "odenecek" ? "İş bitiminde" : "İleri tarihte"}
                </label>
              )}
            </div>

            <div className="field field-tutar">
              <label className="form-label">Tutar / Döviz</label>
              <div className="amount-line">
                <Input
                  placeholder="Tutar"
                  value={form.tutar ?? ""}
                  onChange={e=>setForm({...form, tutar:e.target.value})}
                  onBlur={()=> setForm(f => ({ ...f, tutar: formatAmountTR(f.tutar) }))}
                  onFocus={(e)=> e.currentTarget.select()}
                  inputMode="decimal"
                  autoComplete="off"
                  className="input"
                />
                <div className="select-wrap has-prefix">
                  <span className="prefix">{DOVIZ_SYMBOL[form.doviz]}</span>
                  <Select
                    value={form.doviz}
                    onChange={e=>setForm({...form, doviz: e.target.value as Doviz})}
                    aria-label="Döviz"
                    className="select"
                  >
                    <option value="TRY">TL</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="ALTIN">Altın (gr)</option>
                  </Select>
                </div>
              </div>
            </div>

            <div className="field field-kisi">
              <label className="form-label">Kişi</label>
              <div className="select-wrap">
                <Select
                  required
                  value={form.kisi_id}
                  onChange={e=>setForm({...form, kisi_id:e.target.value})}
                  className="select no-muted-placeholder"
                  aria-label="Kişi"
                >
                  <option value="" disabled>Kişi Seçiniz</option>
                  {kisiler.map(k=> <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
                </Select>
              </div>
            </div>

            <div className="field field-aciklama">
              <label className="form-label">Açıklama</label>
              <Input
                placeholder="(İsteğe bağlı)"
                value={form.aciklama ?? ""}
                onChange={e=>setForm({...form, aciklama:e.target.value})}
                className="input"
              />
            </div>

            <div className="field field-actions">
              <Button variant="primary" onClick={add} disabled={saving || !canSubmit} className="btn-wide" title="İşlemi ekle">
                {saving ? "Kaydediliyor..." : "Ekle"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* —— FİLTRE —— */}
      <div style={{height:12}}/>
      <Card>
        <div className="filter-line">
          <div className="select-wrap">
            <Select
              value={kisiFilter}
              onChange={e=>setKisiFilter(e.target.value)}
              className="select"
              aria-label="Kişiye göre filtrele"
            >
              <option value="">Tüm Kişilere Göre Filtrele</option>
              {kisiler.map(k=> <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
            </Select>
          </div>
          <div className="search-wrap">
            <Input
              placeholder="Tip, tarih, açıklama veya kişi adında ara…"
              value={query}
              onChange={e=>setQuery(e.target.value)}
              className="input"
              aria-label="İşlemler arama"
            />
            {query && (
              <Button variant="ghost" onClick={()=>setQuery("")} title="Temizle">Temizle</Button>
            )}
          </div>
        </div>
      </Card>

      {/* —— TABLO —— */}
      <div style={{height:12}}/>
      <Card>
        <Table
          head={
            <>
              <th align="left">Tarih</th>
              <th align="left">Tip</th>
              <th align="right">Tutar (TL)</th>
              <th align="left">Kişi</th>
              <th align="left">Açıklama</th>
              <th align="center">İşlem</th>
            </>
          }
        >
          {filteredRows.map((r)=> {
            const tarihsizLabel = (r as any).is_bitiminde === 1
              ? (r.tip === "odenecek" ? "İş bitiminde" : (r.tip === "alacak" ? "İleri tarihte" : "—"))
              : null;
            const kisiAd = r.kisi_id ? (kisiMap[String(r.kisi_id)] ?? "") : "";

            return (
              <tr key={r.id}>
                <td>{tarihsizLabel || (r.tarih || "—")}</td>
                <td>{r.tip}</td>
                <td align="right">{Number(r.tutar).toLocaleString('tr-TR',{minimumFractionDigits:2})}</td>
                <td>{kisiAd || "—"}</td>
                <td>{r.aciklama || "—"}</td>
                <td align="center" style={{whiteSpace:"nowrap"}}>
                  <Button onClick={()=>startEdit(r)} disabled={!!deletingId || saving}>Düzenle</Button>
                  <span style={{marginRight:6}}/>
                  <Button variant="danger" disabled={deletingId===r.id} onClick={()=>askDelete(r.id)}>Sil</Button>
                </td>
              </tr>
            );
          })}
          {!filteredRows.length && (
            <tr><td colSpan={6}><div className="empty">Eşleşen kayıt yok.</div></td></tr>
          )}
        </Table>
      </Card>

      {/* —— DÜZENLE MODAL —— */}
      {mode === "edit" && (
        <div className="modal-backdrop" onClick={cancelEdit}>
          <div className="modal-box" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-title">İşlemi Düzenle</div>

            <div className="form-grid">
              <div className="field field-tarih">
                <label className="form-label">Tarih</label>
                <Input
                  type="date"
                  value={form.tarih ?? ""}
                  placeholder="Tarih Seçiniz"
                  onChange={e=>setForm({...form, tarih:e.target.value})}
                  disabled={(form.tip === "odenecek" || form.tip === "alacak") && form.is_bitiminde}
                  aria-label="Tarih"
                  className="date"
                />
                {(form.tip === "odenecek" || form.tip === "alacak") && (
                  <label className="helper" style={{display:"flex", alignItems:"center", gap:6, marginTop:6}}>
                    <input type="checkbox" checked={!!form.is_bitiminde} onChange={e=>setForm({...form, is_bitiminde: e.target.checked})}/>
                    {form.tip === "odenecek" ? "İş bitiminde" : "İleri tarihte"}
                  </label>
                )}
              </div>

              <div className="field field-tip">
                <label className="form-label">İşlem Tipi</label>
                <div className="select-wrap">
                  <Select
                    required
                    value={form.tip}
                    onChange={e=>{
                      const nextTip = e.target.value as TipAll;
                      setForm(f=>({
                        ...f,
                        tip: nextTip,
                        is_bitiminde: (nextTip === "odenecek" || nextTip === "alacak") ? f.is_bitiminde : false
                      }));
                    }}
                    aria-label="İşlem Tipi"
                    className="select no-muted-placeholder"
                  >
                    <option value="" disabled>İşlem Tipi Seçiniz</option>
                    <option value="tahsilat">Tahsilat</option>
                    <option value="odeme">Ödeme</option>
                    <option value="odenecek">Ödenecek</option>
                    <option value="alacak">Alacak</option>
                  </Select>
                </div>
              </div>

              <div className="field field-tutar">
                <label className="form-label">Tutar / Döviz</label>
                <div className="amount-line">
                  <Input
                    placeholder="Tutar"
                    value={form.tutar ?? ""}
                    onChange={e=>setForm({...form, tutar:e.target.value})}
                    onBlur={()=> setForm(f => ({ ...f, tutar: formatAmountTR(f.tutar) }))}
                    onFocus={(e)=> e.currentTarget.select()}
                    inputMode="decimal"
                    autoComplete="off"
                    className="input"
                  />
                  <div className="select-wrap has-prefix">
                    <span className="prefix">{DOVIZ_SYMBOL[form.doviz]}</span>
                    <Select
                      value={form.doviz}
                      onChange={e=>setForm({...form, doviz: e.target.value as Doviz})}
                      aria-label="Döviz"
                      className="select"
                    >
                      <option value="TRY">TL</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="ALTIN">Altın (gr)</option>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="field field-kisi">
                <label className="form-label">Kişi</label>
                <div className="select-wrap">
                  <Select
                    required
                    value={form.kisi_id}
                    onChange={e=>setForm({...form, kisi_id:e.target.value})}
                    className="select no-muted-placeholder"
                    aria-label="Kişi"
                  >
                    <option value="" disabled>Kişi Seçiniz</option>
                    {kisiler.map(k=> <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
                  </Select>
                </div>
              </div>

              <div className="field field-aciklama">
                <label className="form-label">Açıklama</label>
                <Input
                  placeholder="(İsteğe bağlı)"
                  value={form.aciklama ?? ""}
                  onChange={e=>setForm({...form, aciklama:e.target.value})}
                  className="input"
                />
              </div>

              <div className="field field-actions">
                <div style={{display:"flex", gap:8}}>
                  <Button variant="primary" onClick={saveEdit} disabled={saving || !canSubmit}>Güncelle</Button>
                  <Button variant="ghost" onClick={cancelEdit} disabled={saving}>Vazgeç</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* —— SİL MODAL —— */}
      {confirmDeleteId && (
        <div className="modal-backdrop" onClick={cancelAskDelete}>
          <div className="modal-box" onClick={(e)=>e.stopPropagation()}>
            <p>Bu işlemi silmek istediğinize emin misiniz?</p>
            <div className="modal-actions">
              <Button variant="danger" onClick={confirmDelete} disabled={!!deletingId}>Evet, sil</Button>
              <Button variant="ghost" onClick={cancelAskDelete} disabled={!!deletingId}>Vazgeç</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
