/** @type {import('next').NextConfig} */

function getConnectSrc() {
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!apiUrl) {
    return "'self' http: https:";
  }
  try {
    const { origin } = new URL(apiUrl);
    return `'self' ${origin}`;
  } catch {
    return "'self' http: https:";
  }
}

const nextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src ${getConnectSrc()}; frame-ancestors 'none'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
