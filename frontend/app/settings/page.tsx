"use client";

export default function SettingsPage() {
  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-white">Settings</div>
      </header>

      <div className="flex-1 overflow-auto p-3">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-lg border border-border bg-bg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Application Settings</h2>
            <p className="text-muted">Settings coming soon...</p>
          </div>
        </div>
      </div>
    </main>
  );
}
