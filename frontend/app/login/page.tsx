"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await api.register({ username, email, password });
      }
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center w-full h-screen bg-gray-950">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-sm p-8 rounded-lg bg-gray-900 border border-gray-800"
      >
        <h1 className="text-xl font-semibold text-gray-100">
          {mode === "login" ? "Sign in" : "Create an account"}
        </h1>

        {mode === "register" && (
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="px-3 py-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:border-accent"
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="px-3 py-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:border-accent"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="px-3 py-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:border-accent"
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-2 rounded bg-accent text-white font-medium disabled:opacity-50"
        >
          {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="text-sm text-gray-400 hover:text-gray-200"
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
