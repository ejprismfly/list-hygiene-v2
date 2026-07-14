import { BrandLogo } from "@/components/app/brand-logo"

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="grid w-full justify-items-center gap-6">
        <BrandLogo className="h-6" />
        {children}
      </div>
    </main>
  )
}
