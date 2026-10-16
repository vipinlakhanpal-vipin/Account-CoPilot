/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["exceljs"],
  // Going back to a tab you opened in the last minute reuses it (the data cache on the server is also 60 seconds).
  experimental: { staleTimes: { dynamic: 60, static: 300 } },
};
export default nextConfig;
