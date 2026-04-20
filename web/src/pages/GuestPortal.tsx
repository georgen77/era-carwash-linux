import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const APT_NAMES: Record<string, string> = {
  piral_1: "Oasis 1",
  piral_2: "Oasis 2",
  grande: "Grande",
  salvador: "Salvador",
};

const APT_ADDRESS: Record<string, string> = {
  piral_1: "Carrer del Pintor Pinazo 1, Valencia",
  piral_2: "Carrer del Pintor Pinazo 1, Valencia",
  grande: "Carrer del Pintor Pinazo 1, Valencia",
  salvador: "Avinguda del Salvador 12, Valencia",
};

const ATTRACTIONS = [
  { emoji: "🔭", name: "Ciudad de las Artes y las Ciencias", desc: "Futuristic complex by Calatrava — aquarium, planetarium, opera.", time: "15 min by metro" },
  { emoji: "🏛️", name: "Mercado Central", desc: "Europe's largest fresh market (1928). Amazing tapas & local produce.", time: "10 min walk" },
  { emoji: "🌊", name: "Playa de la Malvarrosa", desc: "4km golden sand beach with great seafood restaurants.", time: "20 min by tram" },
  { emoji: "⛪", name: "Cathedral & El Miguelete", desc: "Gothic cathedral with the Holy Grail. Panoramic views from the tower.", time: "Historic centre" },
  { emoji: "🌿", name: "Jardín del Turia", desc: "9km green park in the old river bed. Cycling, jogging, picnics.", time: "5 min walk" },
];

const LINKS = [
  { emoji: "🚲", name: "Valenbisi", desc: "Bike rental", url: "https://www.valenbisi.es" },
  { emoji: "🚇", name: "Metro Valencia", desc: "Routes & times", url: "https://www.metrovalencia.es" },
  { emoji: "🗺️", name: "Visit Valencia", desc: "Official guide", url: "https://www.visitvalencia.com" },
  { emoji: "🚕", name: "Cabify", desc: "Taxi & rides", url: "https://www.cabify.com" },
  { emoji: "🍽️", name: "TheFork", desc: "Restaurants", url: "https://www.thefork.es" },
  { emoji: "🎭", name: "Palau Música", desc: "Concerts", url: "https://www.palauvalencia.com" },
];

function fmtDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function nightsBetween(a: string, b: string) {
  if (!a || !b) return 0;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export default function GuestPortal() {
  const { token } = useParams<{ token: string }>();
  const [portal, setPortal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", country: "", guests: "", arrival: "15:00", notes: "" });

  useEffect(() => {
    async function load() {
      if (!token) { setExpired(true); setLoading(false); return; }
      const { data, error } = await supabase
        .from("guest_portals")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !data) { setExpired(true); setLoading(false); return; }

      const today = new Date();
      const checkin = new Date(data.checkin_date);
      const checkout = new Date(data.checkout_date);
      const dayBefore = new Date(checkin); dayBefore.setDate(dayBefore.getDate() - 1);

      if (today < dayBefore || today > checkout || data.status === "expired") {
        setExpired(true); setLoading(false); return;
      }

      setPortal(data);
      setLoading(false);
    }
    load();
  }, [token]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    });
  }

  async function submitCheckin() {
    if (!portal) return;
    await supabase.from("guest_checkins").insert({
      portal_token: token,
      apartment: portal.apartment,
      guest_name: form.name,
      country: form.country,
      guests_count: parseInt(form.guests) || portal.guests_count,
      arrival_time: form.arrival,
      notes: form.notes,
    });
    setSubmitted(true);
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#F7F3EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>✨</div>
        <p style={{ fontFamily: "Georgia, serif", color: "#6B5D4F" }}>Loading your stay...</p>
      </div>
    </div>
  );

  if (expired) return (
    <div style={{ minHeight: "100vh", background: "#1A2535", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
      <h1 style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: "1.8rem", marginBottom: "0.5rem", fontWeight: 300 }}>Page unavailable</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", maxWidth: "300px", lineHeight: 1.6 }}>This guest portal is no longer active. Please contact ERA Apartments.</p>
      <a href="https://wa.me/34600000000" style={{ marginTop: "2rem", background: "#25D366", color: "#fff", padding: "0.75rem 1.5rem", borderRadius: "12px", textDecoration: "none", fontWeight: 500 }}>Contact us on WhatsApp</a>
    </div>
  );

  if (!portal) return null;

  const apt = APT_NAMES[portal.apartment] || portal.apartment;
  const addr = APT_ADDRESS[portal.apartment] || "";
  const nights = nightsBetween(portal.checkin_date, portal.checkout_date);
  const code = portal.door_code || "----";
  const digits = code.split("");

  const formFields: Array<[string, string, string, keyof typeof form]> = [
    ["Name", "text", "Maria Garcia", "name"],
    ["Country", "text", "Germany", "country"],
    ["Guests", "number", "2", "guests"],
    ["Arrival", "time", "15:00", "arrival"],
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#F7F3EE", minHeight: "100vh" }}>

      {/* HERO */}
      <div style={{ background: "#1A2535", minHeight: "85vh", display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "url('https://images.unsplash.com/photo-1599854601073-4ec5c8fd4d49?w=1200&q=80') center/cover", opacity: 0.3 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, rgba(26,37,53,0.97) 100%)" }} />
        <div style={{ position: "relative", padding: "3rem 1.5rem 4rem", maxWidth: 640, margin: "0 auto", width: "100%" }}>
          <div style={{ fontSize: "0.7rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "#D4B06A", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ display: "block", width: 32, height: 1, background: "#D4B06A" }} />
            ERA Apartments Valencia
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(2.2rem,8vw,4rem)", fontWeight: 300, color: "#fff", lineHeight: 1.1, marginBottom: "0.75rem" }}>
            Welcome to<br /><em style={{ fontStyle: "italic", color: "#E8A07A" }}>{apt}</em>
          </h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.9rem" }}>📍 {addr}</p>
          <div style={{ display: "flex", gap: "1.5rem", marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {([["Check-in", fmtDate(portal.checkin_date) + " · 15:00"], ["Check-out", fmtDate(portal.checkout_date) + " · 11:00"], ["Stay", nights + " night" + (nights !== 1 ? "s" : "")]] as const).map(([label, val]) => (
              <div key={label} style={{ flex: 1 }}>
                <div style={{ fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "#D4B06A", marginBottom: "0.25rem" }}>{label}</div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: "clamp(0.8rem,2.5vw,1.1rem)", color: "#fff", fontWeight: 300 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 1.25rem 5rem" }}>

        {/* ACCESS CODE */}
        <div style={{ background: "#1A2535", borderRadius: 20, padding: "2rem", margin: "-2.5rem 0 1.5rem", position: "relative", zIndex: 10, boxShadow: "0 20px 60px rgba(26,37,53,0.25)" }}>
          <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "#D4B06A", marginBottom: "1rem" }}>🔑 Your door code</div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {digits.map((d: string, i: number) => (
              <div key={i} style={{ width: 52, height: 64, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif", fontSize: "2rem", color: "#fff" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {([["Valid from", fmtDate(portal.checkin_date) + ", 15:00"], ["Valid until", fmtDate(portal.checkout_date) + ", 11:00"]] as const).map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.8)" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* WIFI */}
        <div style={{ background: "#FDFAF6", borderRadius: 16, padding: "1.5rem", border: "1px solid #E2D8CE", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ width: 36, height: 36, background: "#F7F3EE", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>📶</div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.2rem", fontWeight: 500, color: "#1A2535" }}>WiFi</h2>
          </div>
          {([["Network", portal.wifi_name || "ERA_WiFi"], ["Password", portal.wifi_pass || "era12345"]] as const).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid #E2D8CE" }}>
              <div>
                <div style={{ fontSize: "0.65rem", color: "#6B5D4F", textTransform: "uppercase", letterSpacing: "0.1em" }}>{k}</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{v}</div>
              </div>
              <button onClick={() => copy(v, k)} style={{ background: copied === k ? "#4CAF50" : "#F7F3EE", border: "1px solid #E2D8CE", borderRadius: 8, padding: "0.3rem 0.75rem", fontSize: "0.75rem", cursor: "pointer", color: copied === k ? "#fff" : "#C4714A", fontWeight: 500, transition: "all 0.2s" }}>
                {copied === k ? "✓ Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>

        {/* CHECK-IN FORM */}
        {!submitted ? (
          <div style={{ background: "linear-gradient(135deg, #C4714A 0%, #A05035 100%)", borderRadius: 20, padding: "1.75rem", marginBottom: "1.25rem" }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.5rem", fontWeight: 300, color: "#fff", marginBottom: "0.4rem" }}>Quick check-in ✨</h2>
            <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", marginBottom: "1.25rem", lineHeight: 1.5 }}>Help us prepare your arrival. Takes 30 seconds.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {formFields.map(([label, type, ph, key]) => (
                <div key={key}>
                  <div style={{ fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{label}</div>
                  <input type={type} placeholder={ph} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: "100%", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "0.6rem 0.875rem", color: "#fff", fontFamily: "inherit", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Special requests (optional)</div>
              <input type="text" placeholder="Baby cot, early check-in..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                style={{ width: "100%", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "0.6rem 0.875rem", color: "#fff", fontFamily: "inherit", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }} />
            </div>
            <button onClick={submitCheckin} style={{ width: "100%", background: "#fff", color: "#C4714A", border: "none", borderRadius: 12, padding: "0.875rem", fontFamily: "inherit", fontSize: "0.95rem", fontWeight: 500, cursor: "pointer", marginTop: "1rem" }}>
              Confirm my arrival →
            </button>
          </div>
        ) : (
          <div style={{ background: "#F0FFF4", borderRadius: 16, padding: "1.5rem", border: "1px solid #C8E6C9", marginBottom: "1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✅</div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: "1.2rem", color: "#2E7D32" }}>We're expecting you!</div>
            <div style={{ fontSize: "0.85rem", color: "#4CAF50", marginTop: "0.25rem" }}>Check-in confirmed. See you soon.</div>
          </div>
        )}

        {/* SERVICES */}
        <div style={{ background: "#FDFAF6", borderRadius: 16, padding: "1.5rem", border: "1px solid #E2D8CE", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ width: 36, height: 36, background: "#F7F3EE", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>✨</div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.2rem", fontWeight: 500, color: "#1A2535" }}>Our services</h2>
          </div>
          {(portal.apartment === "piral_1" || portal.apartment === "piral_2" || portal.apartment === "grande") && (
            <div style={{ background: "linear-gradient(135deg, #1A2535, #2D3F55)", borderRadius: 12, padding: "1.25rem", marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "1.75rem", marginBottom: "0.4rem" }}>🌊</div>
              <div style={{ color: "#D4B06A", fontWeight: 500, marginBottom: "0.25rem" }}>Spa & Jacuzzi</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.8rem", lineHeight: 1.5 }}>Jacuzzi for 4 guests · Infrared sauna for 2. By prior arrangement with your host.</div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            {([["🛏️", "Linen & Towels", "Fresh set included"], ["☕", "Full Kitchen", "Coffee maker & essentials"], ["❄️", "A/C & Heating", "Climate control"], ["📺", "Smart TV", "Netflix ready"]] as const).map(([e, n, d]) => (
              <div key={n} style={{ background: "#F7F3EE", borderRadius: 10, padding: "0.875rem", border: "1px solid #E2D8CE" }}>
                <div style={{ fontSize: "1.25rem", marginBottom: "0.3rem" }}>{e}</div>
                <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{n}</div>
                <div style={{ fontSize: "0.72rem", color: "#6B5D4F", marginTop: 2 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ATTRACTIONS */}
        <div style={{ background: "#FDFAF6", borderRadius: 16, padding: "1.5rem", border: "1px solid #E2D8CE", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ width: 36, height: 36, background: "#F7F3EE", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>🗺️</div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.2rem", fontWeight: 500, color: "#1A2535" }}>Must-visit Valencia</h2>
          </div>
          {ATTRACTIONS.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: "0.875rem", padding: "0.875rem 0", borderBottom: i < ATTRACTIONS.length - 1 ? "1px solid #E2D8CE" : "none", alignItems: "flex-start" }}>
              <div style={{ width: 52, height: 52, background: "#F7F3EE", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", flexShrink: 0 }}>{a.emoji}</div>
              <div>
                <div style={{ fontWeight: 500, fontSize: "0.9rem", marginBottom: "0.2rem" }}>{a.name}</div>
                <div style={{ fontSize: "0.75rem", color: "#6B5D4F", lineHeight: 1.4, marginBottom: "0.3rem" }}>{a.desc}</div>
                <span style={{ display: "inline-block", background: "#F7F3EE", border: "1px solid #E2D8CE", borderRadius: 20, padding: "0.1rem 0.5rem", fontSize: "0.65rem", color: "#C4714A", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{a.time}</span>
              </div>
            </div>
          ))}
        </div>

        {/* USEFUL LINKS */}
        <div style={{ background: "#FDFAF6", borderRadius: 16, padding: "1.5rem", border: "1px solid #E2D8CE", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ width: 36, height: 36, background: "#F7F3EE", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>🔗</div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.2rem", fontWeight: 500, color: "#1A2535" }}>Useful in Valencia</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            {LINKS.map(l => (
              <a key={l.name} href={l.url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.75rem", background: "#F7F3EE", borderRadius: 10, border: "1px solid #E2D8CE", textDecoration: "none", color: "#2C2416" }}>
                <span style={{ fontSize: "1.2rem" }}>{l.emoji}</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: "0.8rem" }}>{l.name}</div>
                  <div style={{ fontSize: "0.68rem", color: "#6B5D4F" }}>{l.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* CONTACT */}
        <div style={{ background: "#1A2535", borderRadius: 16, padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem" }}>
          <div>
            <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Any questions?</div>
            <div style={{ color: "#fff", fontSize: "0.9rem" }}>We're here 24/7 for you</div>
          </div>
          <a href="https://wa.me/34600000000" style={{ background: "#25D366", color: "#fff", padding: "0.7rem 1.1rem", borderRadius: 12, textDecoration: "none", fontWeight: 500, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}>
            💬 WhatsApp
          </a>
        </div>

        <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#6B5D4F", paddingTop: "1rem", borderTop: "1px solid #E2D8CE" }}>
          Made with ❤️ by <span style={{ color: "#C4714A" }}>ERA Apartments Valencia</span>
        </div>
      </div>
    </div>
  );
}
