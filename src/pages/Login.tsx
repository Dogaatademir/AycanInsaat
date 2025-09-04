// src/pages/Login.tsx
import { useState, useEffect } from "react";
import logoUrl from "../assets/logo.png"; // <- app-icon.png dosyanızı src/assets içine taşıyın

const ALLOWED_USERS: Record<string, string> = {
  /** kullanıcı adı : şifre */
  adnandemir: "adnandemir",
  aydindemir: "aydindemir", // kullanıcı "aydindemir", şifre "aydindemir"
  dogaatademir: "dogaatademir",
};

function safeGet(key: string) {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeSet(key: string, val: string) {
  try {
    if (typeof window !== "undefined") localStorage.setItem(key, val);
  } catch {}
}
function safeDel(key: string) {
  try {
    if (typeof window !== "undefined") localStorage.removeItem(key);
  } catch {}
}

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Mobil kontrol
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Açılışta hatırlanan kullanıcı adını getir
  useEffect(() => {
    const savedUser = safeGet("rememberedUser");
    if (savedUser) {
      setU(savedUser);
      setRemember(true);
    }
  }, []);

  // "Beni hatırla" açıkken kullanıcı adı değişirse anında kaydet
  useEffect(() => {
    if (remember && u.trim()) safeSet("rememberedUser", u.trim());
  }, [remember, u]);

  async function handleSubmit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const uname = u.trim();
      const ok = !!ALLOWED_USERS[uname] && ALLOWED_USERS[uname] === p;
      if (ok) {
        safeSet("authToken", `ok:${uname}:${Date.now()}`);
        safeSet("authUser", uname);

        if (remember) {
          safeSet("rememberedUser", uname);
        } else {
          safeDel("rememberedUser");
        }

        onAuthed();
      } else {
        setErr("Kullanıcı adı veya şifre hatalı.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <style>{`
        * { 
          box-sizing: border-box; 
          -webkit-tap-highlight-color: transparent;
        }

        .login-wrap {
          min-height: 100vh;
          min-height: 100dvh; /* Dinamik viewport height */
          display: flex; 
          align-items: center; 
          justify-content: center;
          background: var(--brand-700);
          padding: ${isMobile ? '16px' : '24px'};
          font-family: var(--font);
          color: var(--text);
          position: relative;
        }

        .login-card {
          width: min(${isMobile ? '100%' : '440px'}, 100%);
          max-width: ${isMobile ? '400px' : '440px'};
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: ${isMobile ? '20px' : '24px'};
          padding: ${isMobile ? '24px 20px' : '48px 32px'};
          color: var(--text);
          box-shadow: var(--shadow);
          text-align: center;
          position: relative;
          margin: ${isMobile ? '0' : 'auto'};
        }

        .login-card img {
          width: ${isMobile ? '180px' : '250px'}; 
          height: ${isMobile ? '180px' : '250px'};
          object-fit: contain;
          margin-bottom: ${isMobile ? '16px' : '12px'};
          border-radius: ${isMobile ? '12px' : '16px'};
          box-shadow: none;
        }

        .f { 
          display: flex; 
          flex-direction: column; 
          gap: ${isMobile ? '20px' : '16px'}; 
          text-align: left; 
        }
        
        .input-group { 
          position: relative; 
        }

        .input {
          width: 100%; 
          padding: ${isMobile ? '16px 18px' : '14px 16px'}; 
          border-radius: ${isMobile ? '16px' : '14px'};
          border: 1px solid var(--primary);
          background: #fff; 
          color: var(--text);
          font-size: ${isMobile ? '16px' : '15px'}; /* 16px iOS zoom önleme */
          transition: all .2s ease; 
          outline: none;
          min-height: ${isMobile ? '52px' : 'auto'}; /* Touch-friendly */
          -webkit-appearance: none; /* iOS styling reset */
          appearance: none;
        }
        
        .input::placeholder { 
          color: var(--muted); 
          font-weight: 400; 
        }
        
        .input:hover:not(:disabled) { 
          border-color: var(--primary-600); 
        }
        
        .input:focus {
          border-color: var(--primary-600);
          box-shadow: 0 0 0 3px rgba(43,48,75,.15);
          transform: ${isMobile ? 'none' : 'translateY(-1px)'};
        }

        .remember { 
          display: flex; 
          align-items: center; 
          gap: ${isMobile ? '12px' : '8px'}; 
          font-size: ${isMobile ? '16px' : '14px'}; 
          margin-top: ${isMobile ? '0' : '-6px'}; 
          color: var(--text);
          cursor: pointer;
          padding: ${isMobile ? '8px 0' : '0'};
        }
        
        .remember input { 
          width: ${isMobile ? '20px' : '16px'}; 
          height: ${isMobile ? '20px' : '16px'}; 
          cursor: pointer;
          accent-color: var(--primary);
        }

        .btn {
          padding: ${isMobile ? '18px 20px' : '14px 18px'}; 
          border-radius: ${isMobile ? '16px' : '14px'}; 
          border: none; 
          cursor: pointer;
          background: var(--primary); 
          color: #fff; 
          font-weight: 700; 
          font-size: ${isMobile ? '17px' : '15px'};
          transition: all .2s ease; 
          margin-top: ${isMobile ? '12px' : '8px'};
          min-height: ${isMobile ? '52px' : 'auto'}; /* Touch-friendly */
          -webkit-appearance: none; /* iOS styling reset */
          appearance: none;
        }
        
        .btn:hover:not(:disabled) { 
          background: var(--primary-600); 
          transform: ${isMobile ? 'none' : 'translateY(-1px)'}; 
        }
        
        .btn:active:not(:disabled) { 
          transform: ${isMobile ? 'scale(0.98)' : 'translateY(0)'}; 
          background: var(--primary-700);
        }
        
        .btn:disabled { 
          opacity: .7; 
          cursor: not-allowed; 
          transform: none; 
        }

        .loading-spinner {
          display: inline-block; 
          width: ${isMobile ? '20px' : '18px'}; 
          height: ${isMobile ? '20px' : '18px'};
          border: 2px solid rgba(255,255,255,.35); 
          border-radius: 50%;
          border-top-color: #fff; 
          animation: spin 1s linear infinite; 
          margin-right: ${isMobile ? '10px' : '8px'}; 
          vertical-align: ${isMobile ? '-4px' : '-3px'};
        }
        
        @keyframes spin { 
          to { transform: rotate(360deg); } 
        }

        .err {
          background: rgba(188, 2, 2, 0.06);
          color: var(--danger);
          padding: ${isMobile ? '16px 18px' : '12px 14px'}; 
          border-radius: ${isMobile ? '14px' : '12px'}; 
          text-align: center;
          border: 1px solid rgba(188, 2, 2, 0.25);
          font-weight: 600; 
          margin-bottom: ${isMobile ? '8px' : '4px'};
          font-size: ${isMobile ? '15px' : '14px'};
        }

        /* iOS Safe Area */
        @supports (-webkit-touch-callout: none) {
          .login-wrap {
            padding-top: max(${isMobile ? '16px' : '24px'}, env(safe-area-inset-top));
            padding-bottom: max(${isMobile ? '16px' : '24px'}, env(safe-area-inset-bottom));
            padding-left: max(${isMobile ? '16px' : '24px'}, env(safe-area-inset-left));
            padding-right: max(${isMobile ? '16px' : '24px'}, env(safe-area-inset-right));
          }
        }

        /* Ekstra küçük ekranlar */
        @media (max-width: 374px) {
          .login-card {
            padding: 20px 16px;
            margin: 8px;
          }
          
          .login-card img {
            width: 140px;
            height: 140px;
          }
        }

        /* Landscape orientation mobilde */
        @media (max-width: 767px) and (orientation: landscape) {
          .login-wrap {
            padding: 12px;
          }
          
          .login-card {
            padding: 20px 24px;
            max-height: 90vh;
            overflow-y: auto;
          }
          
          .login-card img {
            width: 120px;
            height: 120px;
            margin-bottom: 12px;
          }
          
          .f {
            gap: 16px;
          }
        }

        /* Büyük ekranlar */
        @media (min-width: 768px) {
          .login-card {
            padding: 48px 32px;
          }
        }

        /* Focus görünürlüğü için */
        @media (prefers-reduced-motion: reduce) {
          .input, .btn {
            transition: none;
          }
          
          .input:focus {
            transform: none;
          }
          
          .btn:hover {
            transform: none;
          }
        }

        /* Dark mode desteği */
        @media (prefers-color-scheme: dark) {
          .input {
            background: var(--panel);
            color: var(--text);
          }
        }
      `}</style>

      <div className="login-card">
        <img src={logoUrl} alt="Aycan İnşaat Logo" />

        {err && <div className="err">{err}</div>}

        <form className="f" onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              className="input"
              placeholder="Kullanıcı adı"
              value={u}
              onChange={(e) => setU(e.target.value)}
              disabled={loading}
              autoComplete="username"
              inputMode="text"
              spellCheck="false"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="input-group">
            <input
              className="input"
              type="password"
              placeholder="Şifre"
              value={p}
              onChange={(e) => setP(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <label className="remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={loading}
            />
            Beni hatırla
          </label>

          <button className="btn" type="submit" disabled={loading}>
            {loading && <span className="loading-spinner" />}
            {loading ? "Kontrol ediliyor..." : "Giriş"}
          </button>
        </form>
      </div>
    </div>
  );
}