/** @type {import('next').NextConfig} */
 
const nextConfig = {
  experimental: {
    ppr: 'incremental', // Enable Partial Prerendering (PPR) with the 'incremental' mode. The 'incremental' value allows you to adopt PPR for specific routes.
  },
};
 
export default nextConfig;
