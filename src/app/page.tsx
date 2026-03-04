"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AuthScreen() {
  const [passcode, setPasscode] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "authenticating" | "granted" | "denied">("idle");
  const router = useRouter();

  useEffect(() => {
    // Initial cool sequence
    const bootSequence = [
      "GÜVENLİ PROTOKOL BAŞLATILIYOR...",
      "BAĞLANTI KURULUYOR...",
      "YETKİ KODU BEKLENİYOR"
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < bootSequence.length) {
        setLogs(prev => [...prev, bootSequence[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 600);

    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "idle" && status !== "denied") return;

    setStatus("authenticating");
    setLogs(prev => [...prev, "> KİMLİK DOĞRULANIYOR..."]);

    try {
      // 1. Minimum 500ms fake delay for the "hacking" effect
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. Query Supabase for the entered passcode
      const { data, error } = await supabase
        .from('operatives')
        .select('codename')
        .eq('passcode', passcode)
        .single();

      if (error || !data) {
        setLogs(prev => [...prev, "> HATA: GEÇERSİZ YETKİ KODU veya ERİŞİM REDDEDİLDİ"]);
        setStatus("denied");
        setPasscode("");
      } else {
        const codename = data.codename;
        localStorage.setItem("operative_id", codename);

        // Pretty print the codename (e.g. agent_alpha -> Ajan Alpha)
        const displayName = codename.replace("agent_", "Ajan ");
        const formattedDisplay = displayName.charAt(0).toUpperCase() + displayName.slice(1);

        // Keep a log of the login
        await supabase.from('login_logs').insert([{ codename: codename }]);

        setLogs(prev => [...prev, `> YETKİ ONAYLANDI (${formattedDisplay})`, "> İLETİŞİM AĞINA BAĞLANILIYOR..."]);
        setStatus("granted");
        setTimeout(() => router.push("/chat"), 1500);
      }
    } catch (err) {
      console.error(err);
      setLogs(prev => [...prev, "> HATA: SİSTEM BAĞLANTISI KOPTU"]);
      setStatus("denied");
      setPasscode("");
    }
  };

  return (
    <div className="auth-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '2rem', justifyContent: 'center' }}>

      <div className="glass-panel" style={{ padding: '2rem', borderRadius: '12px', maxWidth: '400px', width: '100%', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Lock size={48} className="text-neon-green" style={{ margin: '0 auto', marginBottom: '1rem', filter: 'drop-shadow(0 0 10px rgba(0, 255, 65, 0.5))' }} />
          <h1 className="mono-text text-neon-green" style={{ fontSize: '1.5rem', margin: 0 }}>YETKİLENDİRME GEREKLİ</h1>
        </div>

        <div className="terminal-logs mono-text" style={{ fontSize: '0.85rem', color: 'var(--neon-green)', marginBottom: '2rem', minHeight: '80px', opacity: 0.8 }}>
          {logs.map((log, idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>{log}</div>
          ))}
          {status === "idle" && <div className="cursor-blink" style={{ display: 'inline-block', width: '8px', height: '15px', background: 'var(--neon-green)', marginTop: '4px' }} />}
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            disabled={status === "authenticating" || status === "granted"}
            className="mono-text"
            style={{
              background: 'rgba(0,0,0,0.5)',
              border: `1px solid ${status === 'denied' ? 'var(--alert-red)' : 'var(--neon-green)'}`,
              color: status === 'denied' ? 'var(--alert-red)' : 'var(--neon-green)',
              padding: '1rem',
              outline: 'none',
              textAlign: 'center',
              letterSpacing: '0.5em',
              fontSize: '1.2rem',
              borderRadius: '4px',
              textShadow: status === 'denied' ? 'var(--glow-red)' : 'var(--glow-green)',
              boxShadow: `inset 0 0 10px ${status === 'denied' ? 'rgba(255,0,60,0.2)' : 'rgba(0,255,65,0.1)'}`
            }}
            placeholder="****"
            maxLength={10}
            autoFocus
          />
          <button
            type="submit"
            disabled={!passcode || status === "authenticating" || status === "granted"}
            className="mono-text"
            style={{
              background: 'transparent',
              border: '1px solid var(--neon-green)',
              color: 'var(--neon-green)',
              padding: '1rem',
              cursor: passcode ? 'pointer' : 'not-allowed',
              opacity: passcode ? 1 : 0.5,
              textShadow: 'var(--glow-green)',
              textTransform: 'uppercase',
              borderRadius: '4px'
            }}
          >
            {status === "authenticating" ? "DOĞRULANIYOR..." : "GİRİŞ"}
          </button>
        </form>
      </div>
    </div>
  );
}
