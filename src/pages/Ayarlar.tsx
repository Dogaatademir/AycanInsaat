// src/pages/Ayarlar.tsx
import { useEffect, useState, type ChangeEvent } from "react";
import { getSetting, setSetting } from "../db";
import { Card, Row, Input, Button, PageTitle } from "../components/UI";
import { updateRatesAndPersist } from "../services/rates";

/** number → "x.yyyy" */
function toFixedStr(v: string | number, digits: number) {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(digits) : "0";
}
function fmtShow(v: string | number, digits = 4) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(digits) : "0";
}

export default function Ayarlar() {
  const [usd, setUsd] = useState("0");
  const [eur, setEur] = useState("0");
  const [altin, setAltin] = useState("0"); // gram altın (TRY)

  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [source, setSource] = useState<string>("Manuel");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  async function reloadSaved() {
    setUsd(await getSetting("doviz_usd", "0"));
    setEur(await getSetting("doviz_eur", "0"));
    setAltin(await getSetting("doviz_altin_gram", "0"));
    setUpdatedAt(await getSetting("doviz_updated_at", ""));
    setSource(await getSetting("doviz_source", "Manuel"));
  }

  useEffect(() => {
    (async () => {
      try { await reloadSaved(); }
      catch (e: any) { setError(`Ayarlar yüklenemedi: ${e?.message || String(e)}`); }
    })();
  }, []);

  async function save() {
    setError(""); setBusy(true);
    try {
      await setSetting("doviz_usd", toFixedStr(usd, 4));
      await setSetting("doviz_eur", toFixedStr(eur, 4));
      await setSetting("doviz_altin_gram", toFixedStr(altin, 2));
      await setSetting("doviz_source", "Manuel");
      await setSetting("doviz_updated_at", new Date().toISOString());
      await reloadSaved();
      alert("Kurlar kaydedildi.");
    } catch (e: any) {
      setError(`Kaydetme hatası: ${e?.message || String(e)}`);
    } finally { setBusy(false); }
  }

  // 🔄 İnternetten stabil güncelleme (Frankfurter + exchangerate.host)
  async function updateFromInternet() {
    setError(""); setBusy(true);
    try {
      await updateRatesAndPersist("Manual Refresh: Frankfurter + exchangerate.host");
      await reloadSaved();
      alert("Kurlar güncellendi (Frankfurter + exchangerate.host).");
    } catch (e: any) {
      setError(`Güncellenemedi: ${e?.message || String(e)}`);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageTitle>Ayarlar – Döviz Kurları</PageTitle>

      <Card>
        <div className="helper" style={{ marginBottom: 12 }}>
          Kurlar <b>Frankfurter (ECB)</b> üzerinden, yedek olarak <i>exchangerate.host</i> kullanılarak çekilir. Gram altın, XAU/TRY kurundan gram’a çevrilir. İsterseniz manuel de girebilirsiniz.
        </div>

        <Row className="cols-3">
          <div>
            <label className="helper">USD / TRY</label>
            <Input
              type="text"
              placeholder="ör. 41.0520"
              value={usd}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUsd(e.target.value)}
            />
            <div className="helper" style={{ marginTop: 6 }}>
              Kayıtlı: <b>{fmtShow(usd, 4)}</b>
            </div>
          </div>

          <div>
            <label className="helper">EUR / TRY</label>
            <Input
              type="text"
              placeholder="ör. 47.5970"
              value={eur}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEur(e.target.value)}
            />
            <div className="helper" style={{ marginTop: 6 }}>
              Kayıtlı: <b>{fmtShow(eur, 4)}</b>
            </div>
          </div>

          <div>
            <label className="helper">Gram Altın (TRY)</label>
            <Input
              type="text"
              placeholder="ör. 4450.00"
              value={altin}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAltin(e.target.value)}
            />
            <div className="helper" style={{ marginTop: 6 }}>
              Kayıtlı: <b>{fmtShow(altin, 2)}</b>
            </div>
          </div>
        </Row>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <Button onClick={updateFromInternet} disabled={busy}>İnternetten Güncelle</Button>
          <Button onClick={save} disabled={busy}>Manuel Kaydet</Button>
        </div>

        <div style={{ height: 10 }} />
        <Row className="cols-2">
          <div>
            <div className="helper">Son Güncelleme</div>
            <div><b>{updatedAt ? new Date(updatedAt).toLocaleString("tr-TR") : "—"}</b></div>
          </div>
          <div>
            <div className="helper">Kaynak</div>
            <div><b>{source || "—"}</b></div>
          </div>
        </Row>

        {error && (
          <>
            <div style={{ height: 10 }} />
            <div style={{ color: "#BC0202", fontWeight: 700, whiteSpace: "pre-wrap" }}>
              Hata: {error}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
