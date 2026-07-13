import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Progress,
  ProgressLabel,
} from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const plans = [
  {
    credits: "1,000",
    price: "$30",
    unit: "$0.03",
    savings: null,
  },
  {
    credits: "2,000",
    price: "$50",
    unit: "$0.025",
    savings: "Save 17%",
  },
  {
    credits: "4,000",
    price: "$90",
    unit: "$0.0225",
    savings: "Save 25%",
  },
]

export function BillingContent() {
  return (
    <div className="grid gap-12">
      <section className="grid gap-8">
        <h1 className="text-3xl font-semibold tracking-normal">Your Plan</h1>
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Current Plan: Trial</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Progress value={1}>
              <ProgressLabel>Trial Usage (1.00%)</ProgressLabel>
              <span className="ml-auto text-sm text-muted-foreground">
                3 of 300
              </span>
            </Progress>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Monthly total:</span>
                <span>$0</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Next Invoice date:</span>
                <span>-</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 className="text-3xl font-semibold tracking-normal">Manage Plan</h2>
            <p className="text-muted-foreground">
              Each credit represents an email verification.
            </p>
          </div>
          <Button>Manage</Button>
        </div>

        <Tabs defaultValue="under-10k">
          <TabsList>
            <TabsTrigger value="under-10k">{"<10k"}</TabsTrigger>
            <TabsTrigger value="10k-50k">10k to 50k</TabsTrigger>
            <TabsTrigger value="50k-1m">50k to 1m</TabsTrigger>
            <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credits</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Per Unit</TableHead>
                  <TableHead className="w-40">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.credits}>
                    <TableCell>{plan.credits}</TableCell>
                    <TableCell>{plan.price}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span>{plan.unit}</span>
                        {plan.savings && (
                          <Badge variant="secondary">{plan.savings}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button className="w-32">Upgrade</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-semibold tracking-normal">
            Billing Contact
          </h2>
          <Button>Edit</Button>
        </div>
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">efren@prismfly.com</p>
            </div>
            <div className="grid gap-1">
              <p className="text-sm font-medium">Payment method</p>
              <p className="text-sm text-muted-foreground">No card on file</p>
            </div>
          </CardContent>
        </Card>
        <Separator />
      </section>
    </div>
  )
}
