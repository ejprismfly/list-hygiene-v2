"use client"

import { useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"

const storageKey = "list-hygiene-theme"
const themeChangeEvent = "list-hygiene-theme-change"
type ThemeMode = "light" | "dark"

function currentTheme(): ThemeMode {
  if (typeof document === "undefined") {
    return "light"
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(themeChangeEvent, onStoreChange)

  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(themeChangeEvent, onStoreChange)
  }
}

function serverTheme(): ThemeMode {
  return "light"
}

export function ThemeModeButtonGroup() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    currentTheme,
    serverTheme
  )

  function updateTheme(nextTheme: ThemeMode) {
    document.documentElement.classList.toggle("dark", nextTheme === "dark")
    localStorage.setItem(storageKey, nextTheme)
    window.dispatchEvent(new Event(themeChangeEvent))
  }

  return (
    <ButtonGroup aria-label="Color mode">
      <Button
        type="button"
        variant={theme === "light" ? "secondary" : "outline"}
        aria-pressed={theme === "light"}
        onClick={() => updateTheme("light")}
      >
        <Sun className="size-4" />
        Light
      </Button>
      <Button
        type="button"
        variant={theme === "dark" ? "secondary" : "outline"}
        aria-pressed={theme === "dark"}
        onClick={() => updateTheme("dark")}
      >
        <Moon className="size-4" />
        Dark
      </Button>
    </ButtonGroup>
  )
}
