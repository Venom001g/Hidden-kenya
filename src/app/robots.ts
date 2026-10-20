import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account", "/provider", "/admin", "/checkout", "/api", "/auth", "/newsletter", "/login", "/signup", "/reset-password", "/forgot-password"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
