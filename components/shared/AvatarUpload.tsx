"use client";

import { useRef, useState } from "react";

interface AvatarUploadProps {
  currentUrl: string | null;
  displayName: string;
  size?: "sm" | "lg";
}

export default function AvatarUpload({ currentUrl, displayName, size = "lg" }: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dim = size === "lg" ? "h-20 w-20" : "h-12 w-12";
  const textSize = size === "lg" ? "text-2xl" : "text-lg";

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      // Compress before upload
      const compressed = await compressImage(file, 400, 0.8);
      const formData = new FormData();
      formData.append("file", compressed);
      const res = await fetch("/api/avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setAvatarUrl(data.avatarUrl);
      } else {
        setError(data.error || "Upload failed");
      }
    } catch {
      setError("Upload failed");
    }
    setUploading(false);
  }

  function compressImage(file: File, maxDim: number, quality: number): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
            else reject(new Error("Compression failed"));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  }

  return (
    <><div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} hidden />
      <div className={`${dim} rounded-full overflow-hidden bg-accent-blue/20 flex items-center justify-center`}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span className={`${textSize} font-bold text-accent-blue`}>
            {displayName[0]?.toUpperCase() ?? "?"}
          </span>
        )}
      </div>
      <div className={`absolute inset-0 ${dim} rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}>
        {uploading ? (
          <span className="text-xs text-white animate-pulse">...</span>
        ) : (
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </div>
    </div>
    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </>
  );
}
