"use client";

import { useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (mode === "forgot") {
        await api.forgotPassword(email);
        setNotice("If that email is registered, a reset link is on its way.");
      } else {
        if (mode === "register") {
          await api.register({ username, email, password });
        }
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center w-full min-h-[100dvh] bg-auth-bg p-4 gap-4 2xl:p-6 2xl:gap-6">
      <div className="hidden lg:flex relative w-1/2 h-full flex-col justify-between p-6 2xl:p-10 overflow-hidden rounded-3xl">
        <Image
          src="/image-card.jpg"
          alt=""
          fill
          priority
          className="object-cover object-[center_60%] -scale-x-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-auth-panel-via/50" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="relative z-10 flex items-center gap-2">
          <Image src="/erwix-white.svg" alt="Erwix" width={30} height={30} />
          <span className="text-2xl 2xl:text-3xl font-normal text-zinc-100 leading-tight">Erwix</span>
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl 2xl:text-4xl font-normal text-zinc-100 leading-tight">
            Strategize, Test, Trade
          </h2>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mb-6 flex flex-col items-center gap-2 lg:hidden">
          <div className="flex items-center gap-2">
            <Image src="/erwix-white.svg" alt="Erwix" width={30} height={30} />
            <span className="text-3xl font-normal text-zinc-100 leading-tight">Erwix</span>
          </div>
          <span className="text-base text-gray-400">Strategize, Test, Trade</span>
        </div>
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 2xl:gap-4 w-full max-w-xs 2xl:max-w-sm"
          >
            <div className="mb-2 2xl:mb-3">
              <h1 className="text-3xl 2xl:text-4xl font-normal text-zinc-100">
                {mode === "login" ? "Log in" : mode === "register" ? "Create an account" : "Reset your password"}
              </h1>
              {mode === "register" && (
                <p className="text-sm text-gray-400 mt-2">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                      setNotice(null);
                    }}
                    className="underline hover:text-gray-200"
                  >
                    Log in
                  </button>
                </p>
              )}
            </div>

            {mode === "register" && (
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="px-3 py-2 2xl:py-2.5 text-sm 2xl:text-base rounded-lg bg-auth-field text-gray-100 placeholder-gray-500 border border-transparent focus:outline-none focus:border-violet-300"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-3 py-2 2xl:py-2.5 text-sm 2xl:text-base rounded-lg bg-auth-field text-gray-100 placeholder-gray-500 border border-transparent focus:outline-none focus:border-violet-300"
            />
            {mode !== "forgot" && (
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="px-3 py-2 2xl:py-2.5 text-sm 2xl:text-base rounded-lg bg-auth-field text-gray-100 placeholder-gray-500 border border-transparent focus:outline-none focus:border-violet-300"
              />
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            {notice && <p className="text-sm text-emerald-400">{notice}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 px-3 py-2 2xl:py-2.5 text-sm 2xl:text-base rounded-lg bg-auth-button hover:bg-auth-button-hover text-zinc-100 font-medium disabled:opacity-50 transition-colors"
            >
              {submitting
                ? "Please wait…"
                : mode === "login"
                  ? "Log in"
                  : mode === "register"
                    ? "Create account"
                    : "Send reset link"}
            </button>

            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setNotice(null);
                }}
                className="text-sm text-gray-400 hover:text-gray-200"
              >
                Forgot password?
              </button>
            )}

            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setNotice(null);
                }}
                className="text-sm text-gray-400 hover:text-gray-200"
              >
                Back to log in
              </button>
            )}

            {mode === "login" && (
              <p className="text-sm text-gray-400 text-center">
                Need an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                    setNotice(null);
                  }}
                  className="underline hover:text-gray-200"
                >
                  Register
                </button>
              </p>
            )}
        </form>
      </div>
    </div>
  );
}
