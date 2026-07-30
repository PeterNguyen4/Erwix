"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing or invalid reset link.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message.startsWith("400")
          ? "This reset link is invalid or has expired."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center w-full h-screen bg-gray-950">
      {success ? (
        <div className="flex flex-col gap-4 w-full max-w-sm p-8 rounded-lg bg-gray-900 border border-gray-800 text-center">
          <h1 className="text-xl font-semibold text-gray-100">Password reset</h1>
          <p className="text-sm text-gray-400">
            Your password has been updated. All existing sessions have been signed out.
          </p>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="px-3 py-2 rounded bg-accent text-white font-medium"
          >
            Sign in
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 w-full max-w-sm p-8 rounded-lg bg-gray-900 border border-gray-800"
        >
          <h1 className="text-xl font-semibold text-gray-100">Choose a new password</h1>

          {!token && (
            <p className="text-sm text-red-400">
              This link is missing a reset token. Request a new one from the login page.
            </p>
          )}

          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="px-3 py-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:border-accent"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="px-3 py-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:border-accent"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !token}
            className="px-3 py-2 rounded bg-accent text-white font-medium disabled:opacity-50"
          >
            {submitting ? "Please wait…" : "Reset password"}
          </button>
        </form>
      )}
    </div>
  );
}
