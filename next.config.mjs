/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;

// Gives `next dev` access to the D1/R2 bindings from wrangler.jsonc.
if (process.argv.includes("dev")) {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
