import { env } from "@/lib/cf";

// Public avatar images from R2 (Supabase's public "avatars" bucket before).
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const key = (await params).path.map(decodeURIComponent).join("/");
  const obj = await env().AVATARS.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body as unknown as ReadableStream, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg",
      // URLs carry a ?t= cache-buster, so they can be cached hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
