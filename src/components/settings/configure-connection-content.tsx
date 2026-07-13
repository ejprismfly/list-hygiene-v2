import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"

const retrySettings = [
  {
    title: "Full Mailbox Retries",
    description:
      "Retry full mailboxes once per month, up to the number of months you set.",
    value: "12 months (recommended)",
  },
  {
    title: "Greylisted",
    description: "Retry emails blocked due to greylisting.",
    value: "3 retries (recommended)",
  },
  {
    title: "Mail Server Temporary Error",
    description:
      "Set how many times to retry emails after temporary errors like server timeouts.",
    value: "3 retries (recommended)",
  },
  {
    title: "Unexpected Error",
    description: "Retry emails that failed due to unknown issues.",
    value: "3 retries (recommended)",
  },
]

export function ConfigureConnectionContent() {
  return (
    <main className="min-h-svh bg-background p-6 md:p-20">
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <h1 className="mb-4 text-3xl font-semibold tracking-normal">
          Configure Your Connection
        </h1>

        <Card>
          <CardContent className="grid gap-3">
            <Label htmlFor="connection-name" className="text-lg">
              Name This Connection
            </Label>
            <Input
              id="connection-name"
              name="connection-name"
              defaultValue="Prismfly Development1"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manage Klaviyo Segments*</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Select a Klaviyo segment to monitor for new email addresses to
              check.
            </p>
            <p className="text-sm text-muted-foreground">
              No segments found. Create a segment in Klaviyo, then refresh.
            </p>
            <Select defaultValue="all-emails">
              <SelectTrigger className="w-full max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-emails">All Emails</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-6">
            <div className="grid gap-3">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-medium">Fix Typos</h2>
                <Switch defaultChecked aria-label="Fix typos" />
              </div>
              <p className="text-sm text-muted-foreground">
                Fix domain typos with verified corrections that update or merge
                existing records.
              </p>
            </div>

            {retrySettings.map((setting) => (
              <div key={setting.title} className="grid gap-3">
                <Separator />
                <h2 className="text-xl font-medium">{setting.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {setting.description}
                </p>
                <Select defaultValue={setting.value}>
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={setting.value}>{setting.value}</SelectItem>
                    <SelectItem value="1 retry">1 retry</SelectItem>
                    <SelectItem value="Never retry">Never retry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="mt-2 flex items-center justify-between gap-4">
          <Button>Save</Button>
          <Button variant="destructive">Remove Connection</Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Having any issues? Contact{" "}
          <a
            href="mailto:support@listhygiene.com"
            className="font-medium underline underline-offset-4"
          >
            support@listhygiene.com
          </a>
        </p>
      </div>
    </main>
  )
}
