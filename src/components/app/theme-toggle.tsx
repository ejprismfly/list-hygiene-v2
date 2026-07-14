"use client"

import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

const storageKey = "list-hygiene-theme"

export function ThemeToggle() {
  function toggleTheme() {
    const nextIsDark = !document.documentElement.classList.contains("dark")

    document.documentElement.classList.toggle("dark", nextIsDark)
    localStorage.setItem(storageKey, nextIsDark ? "dark" : "light")
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Toggle color mode"
      title="Toggle color mode"
      onClick={toggleTheme}
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  )
}
