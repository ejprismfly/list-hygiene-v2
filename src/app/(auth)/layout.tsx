export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      {children}
    </main>
  )
}
