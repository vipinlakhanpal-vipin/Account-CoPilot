"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function Login() {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("denied")) {
      supabaseBrowser().auth.getUser().then(({ data }) => {
        setState("error");
        setMsg(`Signed in as ${data.user?.email ?? "this account"}, but that email domain is not on the app's allowed list (ALLOWED_EMAIL_DOMAINS in Vercel).`);
        supabaseBrowser().auth.signOut();
      });
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const sb = supabaseBrowser();
    if (mode === "password") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { setState("error"); setMsg(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message); return; }
      const who = await fetch("/api/whoami", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (who?.signedIn && who?.domainAllowed) { window.location.href = "/"; return; }
      setState("error");
      if (!who) setMsg("Signed in, but the app server could not be reached. Refresh and try again.");
      else if (!who.signedIn) setMsg(`Password accepted, but the app server did not receive your session (${who.authCookieSeen ? "cookie present; " + (who.authError || "session rejected") : "no session cookie"}). Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel match this Supabase project.`);
      else setMsg(`Signed in as ${who.email}, but the app only allows: ${who.allowedDomains.join(", ") || "(none set)"}. Update ALLOWED_EMAIL_DOMAINS in Vercel and redeploy.`);
      await sb.auth.signOut();
      return;
    }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false } });
    if (error) { setState("error"); setMsg(error.message); } else { setState("sent"); }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="brand"><b>Account <i>CoPilot</i></b><span>B2B procurement intelligence</span></div>
        {state === "sent" ? (
          <p>If <b>{email}</b> has an account, a sign-in link is on its way. You can close this tab.</p>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email">Work email</label>
            <input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            {mode === "password" && (<>
              <label htmlFor="password">Password</label>
              <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                style={{ font: "14px var(--body)", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "9px 11px" }} />
            </>)}
            <button className="btn primary" style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }} disabled={state === "busy"}>
              {state === "busy" ? "Signing in…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
            </button>
            {state === "error" && <p className="error">{msg}</p>}
            <button type="button" className="btn" onClick={() => { setMode(mode === "password" ? "link" : "password"); setState("idle"); }}>
              {mode === "password" ? "Use an email link instead" : "Use a password instead"}
            </button>
            <p className="note">Only approved company email domains can sign in. Ask your administrator for an account.</p>
          </form>
        )}
      </div>
    </main>
  );
}
