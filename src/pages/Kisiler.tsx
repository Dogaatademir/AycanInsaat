// src/pages/Kisiler.tsx
import { useEffect, useState } from "react";
import { getDb, q, run, uid, type Kisi } from "../db";
import { subscribeKisiler } from "../db";
import { Card, Row, Input, Select, Button, PageTitle, Table } from "../components/UI";

const ROLE_LABEL: Record<string, string> = {
  musteri: "Müşteri",
  tedarikci: "Tedarikçi",
  banka: "Banka",
  taseron: "Taşeron",
  sahis: "Şahıs",
};

export default function Kisiler(){
  const [rows, setRows] = useState<Kisi[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ ad: string; rol: string; telefon: string; notu: string; }>({
    ad: "", rol: "", telefon: "", notu: ""
  });

  async function load(){
    await getDb();
    const r = await q("SELECT * FROM kisiler ORDER BY created_at DESC");
    setRows(r);
  }

  useEffect(()=>{ 
    (async()=>{
      await load();
      const unsub = subscribeKisiler(() => { load(); });
      return () => { unsub?.(); };
    })();
  },[]);

  async function add(){
    if(!form.ad?.trim()) return alert("Ad gerekli");
    const id = uid();
    await run("INSERT INTO kisiler(id,ad,rol,telefon,notu) VALUES (?,?,?,?,?)",
      [id, form.ad, form.rol||null, form.telefon||null, form.notu||null]);
    setForm({ ad: "", rol: "", telefon: "", notu: "" });
    await load();
  }

  async function del(id:string){
    try{
      if(!id) return;
      if(deletingId) return;
      setDeletingId(id);
      setRows(prev=> prev.filter(r=> r.id!==id));
      await run("DELETE FROM kisiler WHERE id=?", [String(id)]);
    }catch(err:any){
      alert("Silinemedi: " + (err?.message||String(err)));
      await load();
    }finally{
      setDeletingId(null);
    }
  }

  return (
    <div>
      <PageTitle>Kişiler</PageTitle>

      <Card>
        <Row className="cols-3">
          <Input
            placeholder="Ad/Unvan"
            value={form.ad}
            onChange={e=>setForm({...form, ad:e.target.value})}
            className="input"
          />

          <div className="select-wrap" style={{minWidth:180}}>
            <Select
              value={form.rol}
              onChange={e=>setForm({...form, rol:e.target.value})}
              className="select no-muted-placeholder"
              aria-label="Rol"
            >
              <option value="" disabled>Kişi Tipi Seçiniz</option>
              <option value="musteri">Müşteri</option>
              <option value="tedarikci">Tedarikçi</option>
              <option value="banka">Banka</option>
              <option value="taseron">Taşeron</option>
              <option value="sahis">Şahıs</option>
            </Select>
          </div>

          <Button variant="primary" onClick={add}>Ekle</Button>
        </Row>
        <div className="helper" style={{marginTop:8}}>
          Sadece ad zorunludur. Rol isteğe bağlıdır.
        </div>
      </Card>

      <div style={{height:12}}/>

      <Card>
        <Table
          head={<>
            <th align="left">Ad</th>
            <th align="left">Rol</th>
            <th align="left">Not</th>
            <th align="center">İşlem</th>
          </>}
        >
          {rows.map(r=>(
            <tr key={r.id}>
              <td>{r.ad}</td>
              <td>{r.rol ? (ROLE_LABEL[r.rol] ?? r.rol) : "—"}</td>
              <td>{r.notu || "—"}</td>
              <td align="center">
                <Button
                  variant="danger"
                  disabled={deletingId===r.id}
                  onClick={()=>del(r.id)}
                >
                  {deletingId===r.id ? "Siliniyor…" : "Sil"}
                </Button>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={4}><div className="empty">Henüz kişi yok.</div></td></tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
