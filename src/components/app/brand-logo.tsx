import Image from "next/image"

import { cn } from "@/lib/utils"

type BrandLogoProps = {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <Image
      src="/logo.svg"
      alt="List Hygiene"
      width={231}
      height={36}
      priority
      className={cn("h-5 w-auto dark:invert", className)}
    />
  )
}
