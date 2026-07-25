"use client";

import { useState } from "react";

interface TimerSettingToggleProps {
  initialEnabled: boolean;
}

export default function TimerSettingToggle({ initialEnabled }: TimerSettingToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showQuestionTimer: next }),
      });
      if (!res.ok) setEnabled(!next);
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-white">Question stopwatch</p>
        <p className="text-xs text-gray-400">
          Show a timer while answering so you can see how long each question takes.
        </p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={saving}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          enabled ? "bg-accent-blue" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
