import Link from "next/link"

import { BrandLogo } from "@/components/app/brand-logo"
import { AuthVisual } from "@/components/auth/auth-visual"

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-2">
      <section className="flex min-h-svh flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/login" className="flex items-center gap-2">
            <BrandLogo className="h-7" />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </section>
      <AuthVisual />
    </main>
  )
}
