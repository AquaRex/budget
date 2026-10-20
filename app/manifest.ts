import type { MetadataRoute } from "next"

export const dynamic = "force-static"

// Manifest URLs are not rewritten by Next, so they carry the basePath themselves.
const base = process.env.NEXT_PUBLIC_BASE_PATH || ""

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${base}/os/`,
    name: "Budget OS",
    short_name: "Budget",
    description:
      "Quick-glance view of your monthly spending, pace and savings rate",
    start_url: `${base}/os/`,
    scope: `${base}/os/`,
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      {
        src: `${base}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
