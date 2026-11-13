// Provides module declarations and business logic for next.config.mjs.

import os from "node:os";

// Executes documented symbol logic in next.config.mjs.
function buildAllowedDevOrigins() {
  const origins = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "192.168.1.181",
    "192.168.1.182",
    "*.local",
  ]);

  for (let i = 1; i <= 254; i += 1) {
    origins.add(`192.168.1.${i}`);
    origins.add(`192.168.0.${i}`);
  }

  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const iface of list || []) {
      if (iface?.address) {
        origins.add(iface.address);
      }
    }
  }

  if (process.env.ALLOWED_DEV_ORIGINS) {
    for (const item of process.env.ALLOWED_DEV_ORIGINS.split(",")) {
      const trimmed = item.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  return Array.from(origins);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: buildAllowedDevOrigins(),
  experimental: {
    proxyClientMaxBodySize: "500mb",
  },
};

export default nextConfig;
