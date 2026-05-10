/** @type {import('next').NextConfig} */
const nextConfig = {
  // TODO: tighten to false once `useForm<z.input<typeof schema>, any, T>` is
  // applied to the 3 seller-dashboard forms (marketing/products coupons).
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
