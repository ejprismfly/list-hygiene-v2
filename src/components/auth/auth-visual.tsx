"use client"

import { useState } from "react"
import Image from "next/image"

import loginGraphic from "../../../public/login-graphic.jpg"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function AuthVisual() {
  const [loaded, setLoaded] = useState(false)

  return (
    <section className="relative hidden overflow-hidden bg-muted lg:block">
      {!loaded && (
        <Skeleton className="absolute inset-0 z-10 h-full w-full rounded-none" />
      )}
      <Image
        src={loginGraphic}
        alt="List Hygiene email verification preview"
        fill
        priority
        placeholder="blur"
        quality={85}
        sizes="(min-width: 1024px) 50vw, 0vw"
        onLoad={() => setLoaded(true)}
        className={cn(
          "object-cover transition-all duration-700 ease-out",
          loaded ? "scale-100 opacity-100 blur-0" : "scale-[1.02] opacity-0 blur-sm"
        )}
      />
    </section>
  )
}
