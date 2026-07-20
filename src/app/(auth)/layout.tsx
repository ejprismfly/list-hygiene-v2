import { BrandLogo } from "@/components/app/brand-logo"

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <div className="grid w-full justify-items-center gap-8">
        <BrandLogo className="h-8" />
        {children}
      </div>
    </main>
  )
}
