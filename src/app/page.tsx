import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>List Hygiene</CardTitle>
          <CardDescription>Sign in or create an account to continue.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Link href="/login" className={buttonVariants()}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonVariants({ variant: "outline" })}>
            Create account
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
