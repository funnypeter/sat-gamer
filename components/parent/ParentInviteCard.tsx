"use client";

import { useState } from "react";

export default function ParentInviteCard({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false);

  const joinUrl = `sat-gamer.vercel.app/join-parent/${inviteCode}`;

  function handleCopy() {
    navigator.clipboard.writeText(`https://${joinUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card-glass p-6 border border-purple-500/20 bg-purple-500/5">
      <h3 className="text-lg font-semibold text-white mb-2">
        Invite a Co-Parent
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        Share this link with your partner so they can create their own parent account and help manage the family.
      </p>

      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-lg bg-navy-900/80 border border-white/10 px-4 py-3 font-mono text-lg text-purple-400 tracking-wider select-all">
          {joinUrl}
        </div>
        <button
          onClick={handleCopy}
          className="btn-primary shrink-0 flex items-center gap-2"
        >
          {copied ? (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Link
            </>
          )}
        </button>
      </div>
    </div>
  );
}
