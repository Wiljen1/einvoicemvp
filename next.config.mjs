/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "tesseract.js"]
};

export default nextConfig;
