"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import "./dashboard.css";

const POLL_MS = 3000;

function badgeClass(type) {
  if (type === "browser") return "badge normal";
  if (type === "vps" || type === "proxy") return "badge flag";
  if (type === "unknown-bot" || type === "no-user-agent") return "badge flag";
  return "badge tool";
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// Short beep via WebAudio — no audio file needed.
function playPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {
    // ignore if audio isn't available
  }
}

export default function DashboardPage() {
  const [tab, setTab] = useState("requests");
  const [records, setRecords] = useState([]);
  const [blocklist, setBlocklist] = useState([]);
  const [ispBlocklist, setIspBlocklist] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [flash, setFlash] = useState(false);
  const [pingCount, setPingCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const seenIds = useRef(new Set());
  const isFirstLoad = useRef(true);

  const pushToast = useCallback((record) => {
    const id = `${record.id}-toast`;
    setToasts((t) => [...t.slice(-4), { id, record }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/records");
      if (!res.ok) return;
      const data = await res.json();
      const list = data.records || [];

      if (isFirstLoad.current) {
        list.forEach((r) => seenIds.current.add(r.id));
        isFirstLoad.current = false;
      } else {
        const fresh = list.filter((r) => !seenIds.current.has(r.id));
        if (fresh.length > 0) {
          fresh.forEach((r) => seenIds.current.add(r.id));
          setPingCount((c) => c + fresh.length);
          setFlash(true);
          playPing();
          setTimeout(() => setFlash(false), 900);
          // newest first — toast the most recent one
          pushToast(fresh[0]);
        }
      }

      setRecords(list);
      setLoaded(true);
    } catch (e) {
      // network hiccup — next poll will retry
    }
  }, [pushToast]);

  const fetchBlocklist = useCallback(async () => {
    try {
      const res = await fetch("/api/blocklist");
      if (!res.ok) return;
      const data = await res.json();
      setBlocklist(data.blocklist || []);
    } catch (e) {
      // ignore
    }
  }, []);

  const fetchIspBlocklist = useCallback(async () => {
    try {
      const res = await fetch("/api/isp-blocklist");
      if (!res.ok) return;
      const data = await res.json();
      setIspBlocklist(data.ispBlocklist || []);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchBlocklist();
    fetchIspBlocklist();
    const t1 = setInterval(fetchRecords, POLL_MS);
    const t2 = setInterval(fetchBlocklist, POLL_MS);
    const t3 = setInterval(fetchIspBlocklist, POLL_MS);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
    };
  }, [fetchRecords, fetchBlocklist, fetchIspBlocklist]);

  async function handleBlock(ip) {
    setBlocklist((b) => [{ ip, blockedAt: Date.now() }, ...b]);
    await fetch("/api/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
    });
    fetchBlocklist();
  }

  async function handleUnblock(ip) {
    setBlocklist((b) => b.filter((x) => x.ip !== ip));
    await fetch("/api/unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
    });
    fetchBlocklist();
  }

  async function handleBlockIsp(isp) {
    setIspBlocklist((b) => [{ isp, blockedAt: Date.now() }, ...b]);
    await fetch("/api/isp-block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isp }),
    });
    fetchIspBlocklist();
  }

  async function handleUnblockIsp(isp) {
    setIspBlocklist((b) => b.filter((x) => x.isp !== isp));
    await fetch("/api/isp-unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isp }),
    });
    fetchIspBlocklist();
  }

  const blockedIps = new Set(blocklist.map((b) => b.ip));
  const blockedIsps = new Set(ispBlocklist.map((b) => b.isp.toLowerCase()));

  return (
    <div className="wrap">
      <div className="toastLayer">
        {toasts.map(({ id, record }) => (
          <div className="toast" key={id}>
            <div className="toastTitle">NEW REQUEST</div>
            <div className="mono">{record.ip}</div>
            <div className="dim">
              {record.geo?.city || "Unknown"}, {record.geo?.country || "Unknown"} ·{" "}
              {record.type}
            </div>
          </div>
        ))}
      </div>

      <div className="topbar">
        <div className="brand">
          <span className="brandMark">SENTINEL</span>
          <span className="brandSub">API request monitor</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
          <span className="liveDot" />
          Listening on /api/v1
        </div>
      </div>

      <ForceDefaultBanner />

      <div className={`pulseStrip${flash ? " flash" : ""}`}>
        <span className="pulseLabel">Live traffic</span>
        <span className="pulseCount">{pingCount} pings this session</span>
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="pulseBar"
            style={{
              animationDelay: `${(i % 12) * 0.18}s`,
              background: flash ? "var(--accent-normal)" : undefined,
            }}
          />
        ))}
      </div>

      <div className="tabs">
        <button
          className={`tab${tab === "requests" ? " active" : ""}`}
          onClick={() => setTab("requests")}
        >
          Requests
          <span className="tabCount">{records.length}</span>
        </button>
        <button
          className={`tab${tab === "blocklist" ? " active" : ""}`}
          onClick={() => setTab("blocklist")}
        >
          IP Block List
          <span className="tabCount">{blocklist.length}</span>
        </button>
        <button
          className={`tab${tab === "ispblocklist" ? " active" : ""}`}
          onClick={() => setTab("ispblocklist")}
        >
          ISP Block List
          <span className="tabCount">{ispBlocklist.length}</span>
        </button>
        <button
          className={`tab${tab === "payload" ? " active" : ""}`}
          onClick={() => setTab("payload")}
        >
          Response
        </button>
      </div>

      <div className="tableWrap">
        {tab === "requests" ? (
          <RequestsTable
            records={records}
            blockedIps={blockedIps}
            blockedIsps={blockedIsps}
            onBlock={handleBlock}
            onBlockIsp={handleBlockIsp}
            loaded={loaded}
          />
        ) : tab === "blocklist" ? (
          <BlocklistTable blocklist={blocklist} onUnblock={handleUnblock} />
        ) : tab === "ispblocklist" ? (
          <IspBlocklistTable ispBlocklist={ispBlocklist} onBlock={handleBlockIsp} onUnblock={handleUnblockIsp} />
        ) : (
          <ResponseEditors />
        )}
      </div>
    </div>
  );
}

function ForceDefaultBanner() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/force-default");
        const data = await res.json();
        setEnabled(Boolean(data.enabled));
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggle() {
    setBusy(true);
    const next = !enabled;
    setEnabled(next); // optimistic
    try {
      await fetch("/api/force-default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
    } catch (e) {
      setEnabled(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className={`forceBanner${enabled ? " on" : ""}`}>
      <div>
        <div className="forceBannerTitle">
          {enabled ? "Default response is forced for ALL requests" : "Force default response"}
        </div>
        <div className="forceBannerSub">
          {enabled
            ? "Every caller of /api/v1 — blocked or not, browser or not — is getting the default response right now."
            : "Override everything and serve the default response to every caller, regardless of type or block status."}
        </div>
      </div>
      <button className={`btn ${enabled ? "danger" : "safe"}`} onClick={toggle} disabled={busy}>
        {enabled ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}

function RequestsTable({ records, blockedIps, blockedIsps, onBlock, onBlockIsp, loaded }) {
  if (loaded && records.length === 0) {
    return <div className="empty">No requests yet. Call /api/v1 to see it show up here.</div>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>IP</th>
          <th>Location</th>
          <th>ISP</th>
          <th>Type</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => {
          const isp = r.geo?.isp || "";
          const ispIsBlocked = Boolean(r.ispBlocked) || blockedIsps.has(isp.toLowerCase());
          const isBlocked = Boolean(r.blocked) || blockedIps.has(r.ip) || ispIsBlocked;
          return (
            <tr key={r.id}>
              <td className="dim">{timeAgo(r.timestamp)}</td>
              <td className="mono">{r.ip}</td>
              <td>
                {r.geo?.city || "Unknown"}
                <span className="dim">, {r.geo?.country || "Unknown"}</span>
              </td>
              <td className="dim">
                {isp || "—"}
                {ispIsBlocked && <span className="badge block" style={{ marginLeft: 6 }}>ISP blocked</span>}
              </td>
              <td>
                <span className={badgeClass(r.type)}>{r.type}</span>
              </td>
              <td>
                {isBlocked ? (
                  <span className="badge block">
                    blocked{r.autoBlocked ? " (auto)" : ""}
                  </span>
                ) : (
                  <span className="dim">allowed</span>
                )}
              </td>
              <td style={{ display: "flex", gap: 6 }}>
                {!blockedIps.has(r.ip) && !Boolean(r.blocked) && (
                  <button className="btn danger" onClick={() => onBlock(r.ip)}>
                    Block IP
                  </button>
                )}
                {isp && !ispIsBlocked && (
                  <button className="btn danger" onClick={() => onBlockIsp(isp)}>
                    Block ISP
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PayloadEditor({ endpoint, label, description }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(endpoint);
        const data = await res.json();
        setText(JSON.stringify(data.payload, null, 2));
      } catch (e) {
        setError("Couldn't load the current payload.");
      } finally {
        setLoading(false);
      }
    })();
  }, [endpoint]);

  async function handleSave() {
    setError("");
    setSuccess(false);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError("That's not valid JSON — fix the syntax and try again.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error("save failed");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (e) {
      setError("Save failed — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editorPane">
      <div className="editorSectionTitle">{label}</div>
      <div className="editorLabel">{description}</div>
      {loading ? (
        <div className="empty">Loading current response…</div>
      ) : (
        <>
          <textarea
            className={`editorTextarea${error ? " invalid" : ""}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
            }}
            spellCheck={false}
          />
          <div className="editorFooter">
            <button className="btn safe" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            {error && <span className="editorError">{error}</span>}
            {success && <span className="editorSuccess">Saved ✓</span>}
          </div>
        </>
      )}
    </div>
  );
}

function ResponseEditors() {
  return (
    <div>
      <PayloadEditor
        endpoint="/api/payload"
        label="Browser response"
        description={
          <>
            Served to real, unflagged browser traffic. Saving takes effect
            immediately — no redeploy needed. A fresh{" "}
            <span className="mono">timestamp</span> field is added
            automatically on every response.
          </>
        }
      />
      <div className="editorDivider" />
      <PayloadEditor
        endpoint="/api/default-payload"
        label="Default response"
        description={
          <>
            Served to blocked IPs, flagged automated traffic (curl, VPS/VM,
            Postman, etc.), and to everyone when "Force default response" is
            on above. Defaults to an empty object.
          </>
        }
      />
    </div>
  );
}

function IspBlocklistTable({ ispBlocklist, onBlock, onUnblock }) {
  const [input, setInput] = useState("");

  function submitAdd(e) {
    e.preventDefault();
    const isp = input.trim();
    if (!isp) return;
    onBlock(isp);
    setInput("");
  }

  return (
    <div>
      <form onSubmit={submitAdd} className="ispAddRow">
        <input
          className="ispAddInput"
          placeholder='ISP name, e.g. "Amazon.com, Inc."'
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn danger" type="submit" disabled={!input.trim()}>
          Block ISP
        </button>
      </form>

      {ispBlocklist.length === 0 ? (
        <div className="empty">No ISPs blocked.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ISP</th>
              <th>Blocked</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ispBlocklist.map((b) => (
              <tr key={b.isp}>
                <td className="mono">{b.isp}</td>
                <td className="dim">{timeAgo(b.blockedAt)}</td>
                <td>
                  <button className="btn safe" onClick={() => onUnblock(b.isp)}>
                    Unblock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BlocklistTable({ blocklist, onUnblock }) {
  if (blocklist.length === 0) {
    return <div className="empty">No IPs blocked yet.</div>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>IP</th>
          <th>Blocked</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {blocklist.map((b) => (
          <tr key={b.ip}>
            <td className="mono">{b.ip}</td>
            <td className="dim">{timeAgo(b.blockedAt)}</td>
            <td>
              <button className="btn safe" onClick={() => onUnblock(b.ip)}>
                Unblock
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
