/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Public runtime config is intentionally minimal - never place secrets
  // (TURN credentials, admin secrets, DB URLs) in NEXT_PUBLIC_* variables.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
