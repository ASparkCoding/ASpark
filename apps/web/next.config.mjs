/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ai-app/shared-types'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // scaffold-base.ts uses require('fs') guarded by typeof window check,
      // but webpack still warns. Tell it to ignore fs on client.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
