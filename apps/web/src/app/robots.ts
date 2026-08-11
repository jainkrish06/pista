import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_WEB_APP_ORIGIN || "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/age-gate", "/chat", "/login", "/register", "/reset-password", "/forgot-password"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
