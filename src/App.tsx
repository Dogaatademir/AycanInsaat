// src/App.tsx
import { useEffect, useState } from "react";
import Kisiler from "./pages/Kisiler";
import Islemler from "./pages/Islemler";
import Hesaplar from "./pages/Hesaplar";
import ToplamAlacaklar from "./pages/ToplamAlacaklar";
import ToplamOdenecekler from "./pages/ToplamOdenecekler";
import ToplamMasraf from "./pages/ToplamMasraf";
import YaklasanOdemeler from "./pages/YaklasanOdemeler";
import Ayarlar from "./pages/Ayarlar";
import Login from "./pages/Login";
import Ozet from "./pages/Ozet";
import { getSetting } from "./db";
import { updateRatesAndPersist } from "./services/rates";

/* ------------------ Sekmeler ------------------ */
export type TabKey =
  | "ozet"
  | "kisiler"
  | "islemler"
  | "hesaplar"
  | "toplam-alacaklar"
  | "toplam-odenecekler"
  | "yaklasan-odemeler"
  | "toplam-masraf"
  | "ayarlar";

const TABS: ReadonlyArray<readonly [TabKey, string]> = [
  ["ozet", "Özet"],
  ["islemler", "İşlemler"],
  ["kisiler", "Kişiler"],
  ["hesaplar", "Hesaplar"],
  ["toplam-alacaklar", "Toplam Alacaklar"],
  ["toplam-odenecekler", "Toplam Ödenecekler"],
  ["yaklasan-odemeler", "Yaklaşan Ödemeler"],
  ["toplam-masraf", "Toplam Masraf"],
  ["ayarlar", "Ayarlar"],
] as const;

const LABELS: Record<TabKey, string> =
  Object.fromEntries(TABS) as Record<TabKey, string>;

const TAB_ICONS: Record<TabKey, string> = {
  ozet: "📊",
  islemler: "🧾",
  kisiler: "👥",
  hesaplar: "📈",
  "toplam-alacaklar": "📈",
  "toplam-odenecekler": "📉",
  "yaklasan-odemeler": "⏳",
  "toplam-masraf": "💸",
  ayarlar: "⚙️",
};

function isTabKey(v: string): v is TabKey {
  return ([
    "ozet",
    "kisiler",
    "islemler",
    "hesaplar",
    "toplam-alacaklar",
    "toplam-odenecekler",
    "yaklasan-odemeler",
    "toplam-masraf",
    "ayarlar",
  ] as const).includes(v as TabKey);
}

export default function App() {
  const [company, setCompany] = useState("Aycan İnşaat");
  const [authed, setAuthed] = useState(false);

  const [tab, setTab] = useState<TabKey>(() => {
    const fromHash =
      (typeof window !== "undefined"
        ? window.location.hash.replace(/^#\/?/, "")
        : "") || "";
    return isTabKey(fromHash) ? (fromHash as TabKey) : "ozet";
  });

  // Mobil cihazlarda overlay menü, desktop'ta rail
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  
  const railWidth = railExpanded ? 220 : 56;

  // Mobil kontrol
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Mobil menü kapanması
  useEffect(() => {
    if (isMobile && mobileMenuOpen) {
      const handleOutsideClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.mobile-menu') && !target.closest('.mobile-menu-btn')) {
          setMobileMenuOpen(false);
        }
      };
      
      document.addEventListener('click', handleOutsideClick);
      return () => document.removeEventListener('click', handleOutsideClick);
    }
  }, [isMobile, mobileMenuOpen]);

  /* ------------------ Başlangıç ------------------ */
  useEffect(() => {
    if (!authed) {
      document.title = `${company} — Giriş`;
      if (typeof window !== "undefined" && window.location.hash) {
        window.location.hash = "";
      }
    }
  }, [authed, company]);

  async function robustRatesRefresh(baseNote: string) {
    try { await updateRatesAndPersist(`${baseNote} #1`); return; }
    catch {
      await new Promise((r) => setTimeout(r, 500));
      try { await updateRatesAndPersist(`${baseNote} #2`); }
      catch (e2) { console.error("Rates refresh failed twice on login:", e2); }
    }
  }

  useEffect(() => {
    if (!authed) return;
    let stop = false;
    const run = async () => {
      try { await updateRatesAndPersist("Auto Refresh: Frankfurter + exchangerate.host"); }
      catch (e) { console.error(e); }
    };
    const id = window.setInterval(() => { if (!stop) run(); }, 10 * 60 * 1000);
    return () => { stop = true; window.clearInterval(id); };
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    (async () => {
      const nm = await getSetting("sirket_adi", "Aycan İnşaat");
      setCompany(nm || "Aycan İnşaat");
      const h =
        (typeof window !== "undefined"
          ? window.location.hash.replace(/^#\/?/, "")
          : "") || "";
      if (!isTabKey(h)) {
        const def = (await getSetting("default_tab", "ozet")) as TabKey;
        setTab(isTabKey(def) ? def : "ozet");
      }
    })();
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    document.title = `${company} — ${LABELS[tab]}`;
    const nextHash = `#/${tab}`;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }, [tab, company, authed]);

  useEffect(() => {
    if (!authed) return;
    const onHashChange = () => {
      const h = window.location.hash.replace(/^#\/?/, "");
      if (isTabKey(h)) setTab(h);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const h = window.location.hash.replace(/^#\/?/, "");
    if (!isTabKey(h)) {
      const next = `#/${tab}`;
      if (window.location.hash !== next) window.location.hash = next;
    }
  }, [authed, tab]);

  const handleTabChange = (newTab: TabKey) => {
    setTab(newTab);
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };

  if (!authed) {
    return (
      <Login
        onAuthed={async () => {
          await robustRatesRefresh("Auto refresh on successful login");
          setAuthed(true);
          setTimeout(() => {
            updateRatesAndPersist("Post-login safety refresh").catch(() => {});
          }, 0);
        }}
      />
    );
  }

  return (
    <div className="container">
      {/* ---- ÜST BAR ---- */}
      <header
        className="header no-print"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: isMobile ? "8px 12px" : "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
          marginLeft: isMobile ? 0 : railWidth,
          transition: "margin-left .18s ease",
          height: isMobile ? "56px" : "auto",
          position: "relative",
          zIndex: 1000,
        }}
      >
        {isMobile && (
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              background: "none",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Menüyü aç"
          >
            ☰
          </button>
        )}
        <div style={{ fontWeight: 800, fontSize: isMobile ? "16px" : "18px" }}>{company}</div>
        <div style={{ marginLeft: "auto" }} />
      </header>

      {/* ---- CSS ---- */}
      <style>{`
        /* Temel reset */
        .container {
          display: block !important;
          grid-template-columns: 1fr !important;
          min-height: 100vh;
          position: relative;
        }
        
        /* Eski layout izlerini öldür */
        .container .sidebar,
        .container .aside,
        .container .left,
        .container > nav:not(.rail):not(.mobile-menu),
        .container > aside:not(.rail):not(.mobile-menu) {
          display: none !important;
        }

        /* DESKTOP RAIL */
        .rail {
          position: fixed; 
          left: 0; 
          top: 0; 
          bottom: 0;
          background: var(--panel);
          border-right: 1px solid var(--border);
          display: flex; 
          flex-direction: column;
          width: ${railWidth}px;
          transition: width .18s ease;
          z-index: 9000;
          padding: 8px 6px;
          gap: 6px;
        }
        
        .rail .menu-btn {
          width: 44px; 
          height: 44px; 
          border-radius: 12px;
          display: flex; 
          align-items: center; 
          justify-content: center;
          border: 1px solid transparent; 
          background: transparent; 
          cursor: pointer;
          font-size: 16px;
        }
        
        .rail .menu-btn:hover { 
          background: rgba(0,0,0,.05); 
        }
        
        .rail .nav {
          display: flex; 
          flex-direction: column; 
          gap: 4px; 
          padding: 6px 0;
          overflow: hidden auto;
        }
        
        .rail .nav .item {
          display: flex; 
          align-items: center; 
          gap: 10px;
          height: 44px; 
          border-radius: 12px; 
          padding: 0 8px;
          border: 1px solid transparent; 
          background: transparent; 
          cursor: pointer;
          text-align: left;
          font-size: 14px;
        }
        
        .rail .nav .item:hover { 
          background: rgba(0,0,0,.05); 
        }
        
        .rail .nav .item.active {
          background: var(--primary-50);
          border-color: var(--primary-200);
        }
        
        .rail .icon {
          width: 32px; 
          min-width: 32px; 
          text-align: center; 
          font-size: 18px;
        }
        
        .rail .label {
          white-space: nowrap; 
          overflow: hidden; 
          text-overflow: ellipsis;
          opacity: ${railWidth > 56 ? 1 : 0};
          width: ${railWidth > 56 ? "auto" : "0"};
          transition: opacity .15s ease;
        }

        /* MOBILE MENU */
        .mobile-menu {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: 280px;
          background: var(--panel);
          border-right: 1px solid var(--border);
          z-index: 10000;
          transform: translateX(${mobileMenuOpen ? '0' : '-100%'});
          transition: transform 0.3s ease;
          display: flex;
          flex-direction: column;
          padding: 16px 12px;
          gap: 8px;
        }
        
        .mobile-menu-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 9999;
          opacity: ${mobileMenuOpen ? 1 : 0};
          visibility: ${mobileMenuOpen ? 'visible' : 'hidden'};
          transition: all 0.3s ease;
        }
        
        .mobile-menu .header {
          padding: 8px 0 16px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 8px;
        }
        
        .mobile-menu .nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow-y: auto;
        }
        
        .mobile-menu .nav .item {
          display: flex;
          align-items: center;
          gap: 12px;
          height: 48px;
          border-radius: 12px;
          padding: 0 12px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-size: 16px;
          -webkit-tap-highlight-color: transparent;
        }
        
        .mobile-menu .nav .item:active {
          background: rgba(0,0,0,.1);
        }
        
        .mobile-menu .nav .item.active {
          background: var(--primary-50);
          border-color: var(--primary-200);
        }
        
        .mobile-menu .icon {
          width: 24px;
          min-width: 24px;
          text-align: center;
          font-size: 20px;
        }

        /* CONTENT AREA */
        .content {
          padding: ${isMobile ? '12px' : '12px 16px'};
          margin-left: ${isMobile ? '0' : `${railWidth}px`};
          transition: margin-left .18s ease;
          min-height: calc(100vh - ${isMobile ? '56px' : '60px'});
        }
        
        .main { 
          max-width: 1200px; 
          margin: 0 auto;
        }

        /* MOBILE RESPONSIVE */
        @media (max-width: 767px) {
          .rail {
            display: none !important;
          }
          
          .content {
            margin-left: 0 !important;
            padding: 8px 12px;
          }
          
          .header {
            padding: 8px 12px !important;
            height: 56px !important;
          }
          
          /* Touch-friendly boyutlar */
          button, .item, input, select, textarea {
            min-height: 44px;
          }
          
          /* Yazı boyutları */
          body {
            font-size: 16px;
            line-height: 1.5;
          }
        }

        @media (min-width: 768px) {
          .mobile-menu,
          .mobile-menu-overlay,
          .mobile-menu-btn {
            display: none !important;
          }
        }

        @media (min-width: 1200px) { 
          .main { 
            max-width: 1280px; 
          } 
        }

        /* iOS Safari düzeltmeleri */
        @supports (-webkit-touch-callout: none) {
          .content {
            padding-bottom: max(120px, env(safe-area-inset-bottom) + 100px) !important;
          }
          
          .header {
            padding-top: max(8px, env(safe-area-inset-top));
          }
          
          .mobile-menu {
            padding-top: max(16px, env(safe-area-inset-top));
            padding-bottom: max(16px, env(safe-area-inset-bottom));
          }
        }
      `}</style>

      {/* ---- MOBILE OVERLAY ---- */}
      {isMobile && mobileMenuOpen && (
        <div
          className="mobile-menu-overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ---- MOBILE MENU ---- */}
      {isMobile && (
        <aside className="mobile-menu" aria-label="Mobil menü">
          <div className="header">
            <div style={{ fontWeight: 800, fontSize: "18px" }}>{company}</div>
          </div>
          <nav className="nav" role="tablist" aria-label="Ana sekmeler">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                aria-controls={`panel-${k}`}
                className={`item ${tab === k ? "active" : ""}`}
                onClick={() => handleTabChange(k)}
              >
                <span className="icon">{TAB_ICONS[k]}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>
      )}

      {/* ---- DESKTOP RAIL ---- */}
      {!isMobile && (
        <aside className="rail no-print" aria-label="Kenar menü">
          <button
            className="menu-btn"
            aria-label={railExpanded ? "Menüyü daralt" : "Menüyü genişlet"}
            title={railExpanded ? "Daralt" : "Genişlet"}
            onClick={() => setRailExpanded((v) => !v)}
          >
            ☰
          </button>

          <nav className="nav" role="tablist" aria-label="Ana sekmeler">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                aria-controls={`panel-${k}`}
                className={`item ${tab === k ? "active" : ""}`}
                onClick={() => setTab(k)}
                title={label}
              >
                <span className="icon">{TAB_ICONS[k]}</span>
                <span className="label">{label}</span>
              </button>
            ))}
          </nav>
        </aside>
      )}

      {/* ---- İÇERİK ---- */}
      <div className="content">
        <main className="main">
          {tab === "ozet" && <section id="panel-ozet"><Ozet /></section>}
          {tab === "kisiler" && <section id="panel-kisiler"><Kisiler /></section>}
          {tab === "islemler" && <section id="panel-islemler"><Islemler /></section>}
          {tab === "hesaplar" && <section id="panel-hesaplar"><Hesaplar /></section>}
          {tab === "toplam-alacaklar" && <section id="panel-toplam-alacaklar"><ToplamAlacaklar /></section>}
          {tab === "toplam-odenecekler" && <section id="panel-toplam-odenecekler"><ToplamOdenecekler /></section>}
          {tab === "yaklasan-odemeler" && <section id="panel-yaklasan-odemeler"><YaklasanOdemeler /></section>}
          {tab === "toplam-masraf" && <section id="panel-toplam-masraf"><ToplamMasraf /></section>}
          {tab === "ayarlar" && <section id="panel-ayarlar"><Ayarlar /></section>}
        </main>
      </div>
    </div>
  );
}