import type { NextConfig } from "next"

// When deploying to GitHub Pages under https://<user>.github.io/<repo>, set
// NEXT_PUBLIC_BASE_PATH=/<repo> at build time. Leave empty for local dev or a
// custom/root domain.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""

const nextConfig: NextConfig = {
  // Produce a fully static site in `out/` so it can be served by GitHub Pages.
  output: "export",
  // Pages serves directories, so emit `/bills/index.html` etc.
  trailingSlash: true,
  basePath: basePath || undefined,
  // next/image optimization needs a server; disable it for static export.
  images: { unoptimized: true },
}

export default nextConfig
