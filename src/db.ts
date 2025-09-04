// src/db.ts  — Supabase + Realtime uyarlaması
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type IslemTip = "tahsilat" | "odeme" | "odenecek" | "alacak";
export type Doviz = "TRY" | "USD" | "EUR" | "ALTIN";

export type Kisi = {
  id: string;
  ad: string;
  rol?: string | null;
  telefon?: string | null;
  notu?: string | null;
  created_at?: string;
};

export type Islem = {
  id: string;
  tarih: string | null;
  tutar: number;               // TL snapshot
  tip: IslemTip;
  is_bitiminde?: number | null;
  kisi_id?: string | null;
  aciklama?: string | null;
  doviz?: Doviz | null;
  tutar_raw?: number | null;
  created_at?: string;
};

// ---- Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON as string;
export const sb: SupabaseClient = createClient(supabaseUrl, supabaseAnon);

// ---- Eski API yüzeyini koruyoruz ----
export async function getDb(){ return sb; }
export function uid(){ return crypto.randomUUID(); }

// Settings (Ayarlar sayfası bunları kullanıyor:contentReference[oaicite:2]{index=2})
export async function getSetting(key: string, defaultVal: string): Promise<string> {
  const { data, error } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data?.value ?? defaultVal;
}
export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await sb.from("settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

export const Kisiler = {
  async listSimple(){
    const { data, error } = await sb.from("kisiler").select("id,ad").order("ad", { ascending: true });
    if (error) throw error;
    return data as Array<Pick<Kisi,"id"|"ad">>;
  },
  async listAll(){
    const { data, error } = await sb.from("kisiler").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data as Kisi[];
  },
  async insert(k: Omit<Kisi,"created_at">){
    const { error } = await sb.from("kisiler").insert(k);
    if (error) throw error;
  },
  async remove(id: string){
    const { error } = await sb.from("kisiler").delete().eq("id", id);
    if (error) throw error;
  }
};

export const Islemler = {
  async listAll(){
    const { data, error } = await sb
      .from("islemler")
      .select("*")
      .order("created_at", { ascending: false })
      .order("tarih", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data as Islem[];
  },
  async listForKisi(kisiId: string){
    const { data, error } = await sb
      .from("islemler")
      .select("id,tarih,tutar,aciklama,tip,is_bitiminde,doviz,tutar_raw")
      .eq("kisi_id", kisiId)
      .order("created_at", { ascending: true })
      .order("tarih", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data as Islem[];
  },
  async listOdemeler(){
    const { data, error } = await sb
      .from("islemler")
      .select("id,tarih,tutar,aciklama,tip,kisi_id,doviz,tutar_raw")
      .eq("tip","odeme")
      .order("created_at", { ascending: true })
      .order("tarih", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data as Islem[];
  },
  async listOdenecekBetween(fromISO: string, toISO: string){
    const { data, error } = await sb
      .from("islemler")
      .select("id,tarih,tutar,tip,kisi_id,aciklama,is_bitiminde,doviz,tutar_raw")
      .eq("tip","odenecek")
      .not("tarih","is", null)
      .gte("tarih", fromISO)
      .lte("tarih", toISO)
      .order("tarih", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data as Islem[];
  },
  async insert(row: Islem){
    const { error } = await sb.from("islemler").insert(row);
    if (error) throw error;
  },
  async update(id: string, patch: Partial<Islem>){
    const { error } = await sb.from("islemler").update(patch).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string){
    const { error } = await sb.from("islemler").delete().eq("id", id);
    if (error) throw error;
  }
};

// ---- q/run SHIM (mevcut sayfaları kırmamak için) ----
export async function q(sql: string, params: unknown[] = []): Promise<any[]> {
  const s = sql.replace(/\s+/g, " ").trim().toLowerCase();

  if (s.startsWith("select id, ad from kisiler")) return await Kisiler.listSimple();
  if (s.startsWith("select * from kisiler")) return await Kisiler.listAll();
  if (s.startsWith("select * from islemler")) return await Islemler.listAll();
  if (s.startsWith("select id, tarih, tutar, aciklama, tip, is_bitiminde, doviz, tutar_raw from islemler where kisi_id =")) {
    const kisiId = String(params[0] ?? "");
    return await Islemler.listForKisi(kisiId);
  }
  if (s.includes("from islemler where tip='odeme'")) return await Islemler.listOdemeler();
  if (s.includes("from islemler ") && s.includes("where tip='odenecek'") && s.includes("tarih is not null")) {
    const fromISO = String(params[0]); const toISO = String(params[1]);
    return await Islemler.listOdenecekBetween(fromISO, toISO);
  }
  if (s.includes("from islemler i") && s.includes("left join kisiler k")) {
    const [islemler, kisiler] = await Promise.all([Islemler.listAll(), Kisiler.listAll()]);
    const map = new Map<string, string>();
    kisiler.forEach(k => map.set(k.id, k.ad));
    return islemler.map(i => ({
      kisi_id: i.kisi_id ?? null,
      ad: i.kisi_id ? (map.get(i.kisi_id) ?? "(Kişisiz)") : "(Kişisiz)",
      tip: i.tip,
      tutar: i.tutar
    }));
  }

  throw new Error(`[db.q] Desteklenmeyen sorgu: ${sql}`);
}

export async function run(sql: string, params: unknown[] = []): Promise<void> {
  const s = sql.replace(/\s+/g, " ").trim().toLowerCase();

  if (s.startsWith("insert into kisiler")) {
    const [id, ad, rol, telefon, notu] = params as string[];
    await Kisiler.insert({ id, ad, rol, telefon, notu }); return;
  }
  if (s.startsWith("delete from kisiler where id")) {
    await Kisiler.remove(String(params[0])); return;
  }
  if (s.startsWith("insert into islemler")) {
    const [id, tarih, tutar, tip, is_bitiminde, kisi_id, aciklama, doviz, tutar_raw] = params as any[];
    const row: Islem = {
      id,
      tarih: tarih ?? null,
      tutar: Number(tutar),
      tip,
      is_bitiminde: is_bitiminde ?? null,
      kisi_id: kisi_id ?? null,
      aciklama: aciklama ?? null,
      doviz: (doviz ?? null) as Doviz | null,
      tutar_raw: tutar_raw == null ? null : Number(tutar_raw),
    };
    await Islemler.insert(row); return;
  }
  if (s.startsWith("update islemler set")) {
    const [tarih, tutar, tip, is_bitiminde, kisi_id, aciklama, doviz, tutar_raw, id] = params as any[];
    const patch: Partial<Islem> = {
      tarih: tarih ?? null,
      tutar: Number(tutar),
      tip,
      is_bitiminde: is_bitiminde ?? null,
      kisi_id: kisi_id ?? null,
      aciklama: aciklama ?? null,
      doviz: (doviz ?? null) as Doviz | null,
      tutar_raw: tutar_raw == null ? null : Number(tutar_raw),
    };
    await Islemler.update(String(id), patch); return;
  }
  if (s.startsWith("delete from islemler where id")) {
    await Islemler.remove(String(params[0])); return;
  }

  // SQLite migration/backfill komutları artık gereksiz → yoksay
  if (s.startsWith("alter table") || s.startsWith("update islemler set doviz='try'") || s.startsWith("update islemler set tutar_raw")) {
    return;
  }

  throw new Error(`[db.run] Desteklenmeyen komut: ${sql}`);
}

// ---- Realtime yardımcıları ----
export function subscribeIslemler(onChange: (payload: any)=>void){
  const ch = sb.channel("islemler-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "islemler" }, onChange)
    .subscribe();
  return () => { sb.removeChannel(ch); };
}

export function subscribeKisiler(onChange: (payload: any)=>void){
  const ch = sb.channel("kisiler-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "kisiler" }, onChange)
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
