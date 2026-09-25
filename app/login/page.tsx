"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setState("error"); setMsg(error.message); } else { setState("sent"); }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="brand"><b>Account <i>CoPilot</i></b><span>B2B procurement intelligence</span></div>
        {state === "sent" ? (
          <p>Check <b>{email}</b> for a sign-in link. You can close this tab.</p>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email">Work email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            <button className="btn primary" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
            {state === "error" && <p className="error">{msg}</p>}
            <p className="note">Only approved company email domains can sign in.</p>
          </form>
        )}
      </div>
    </main>
  );
}
