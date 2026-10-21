import type { MetadataRoute } from "next"

export const dynamic = "force-static"

// Manifest URLs are not rewritten by Next, so they carry the basePath themselves.
const base = process.env.NEXT_PUBLIC_BASE_PATH || ""

const shortcutIcon = [
  { src: `${base}/icon-96.png`, sizes: "96x96", type: "image/png" },
]

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
    display_override: ["standalone", "minimal-ui"],
    // The Fold turns between a tall cover screen and a near-square inner one.
    orientation: "any",
    categories: ["finance", "productivity"],
    background_color: "#09090b",
    theme_color: "#09090b",
    shortcuts: [
      { name: "Spending", url: `${base}/os/spending/`, icons: shortcutIcon },
      { name: "Budget", url: `${base}/os/budget/`, icons: shortcutIcon },
      { name: "Groups", url: `${base}/os/groups/`, icons: shortcutIcon },
    ],
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
