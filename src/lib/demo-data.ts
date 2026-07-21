export type WorkspaceOption = {
  id: string
  name: string
  organizationName: string
  hasConnectedAccount: boolean
}

export const demoUser = {
  id: "2e958f40-7ca3-4bce-a881-1eff2ba96c6d",
  email: "efren@prismfly.com",
}

export const demoWorkspaceContext = {
  organizationName: "Prismfly",
  workspaces: [
    {
      id: "8a1b3b27-fd47-4f8e-b4eb-37d47b32d824",
      name: "Main Workspace",
      organizationName: "Prismfly",
      hasConnectedAccount: true,
    },
    {
      id: "e4ab13de-2dc1-463f-ad80-a77525887b96",
      name: "Campaign Testing",
      organizationName: "Prismfly",
      hasConnectedAccount: false,
    },
  ] satisfies WorkspaceOption[],
}

export const dashboardDemoData = {
  monthLabel: "July 2026",
  totalSuppressed: 1640,
  nextMilestoneRemaining: 360,
  kpis: [
    {
      label: "Emails Checked",
      value: "12,420",
    },
    {
      label: "Suppressed Percentage",
      value: "13.2%",
    },
    {
      label: "Emails Removed",
      value: "1,640",
    },
    {
      label: "Typos Fixed",
      value: "87",
    },
  ],
  distribution: [
    {
      label: "Valid",
      value: 8290,
    },
    {
      label: "Invalid",
      value: 1420,
    },
    {
      label: "Risky",
      value: 1810,
    },
    {
      label: "Restricted",
      value: 900,
    },
  ],
  historical: [
    { month: "Aug", valid: 3100, invalid: 390, risky: 480, restricted: 260 },
    { month: "Sep", valid: 3480, invalid: 430, risky: 540, restricted: 290 },
    { month: "Oct", valid: 3710, invalid: 460, risky: 590, restricted: 320 },
    { month: "Nov", valid: 3920, invalid: 500, risky: 660, restricted: 350 },
    { month: "Dec", valid: 4080, invalid: 510, risky: 700, restricted: 390 },
    { month: "Jan", valid: 4160, invalid: 530, risky: 720, restricted: 420 },
    { month: "Feb", valid: 4200, invalid: 520, risky: 730, restricted: 460 },
    { month: "Mar", valid: 5100, invalid: 710, risky: 880, restricted: 520 },
    { month: "Apr", valid: 6200, invalid: 940, risky: 1010, restricted: 610 },
    { month: "May", valid: 7600, invalid: 1180, risky: 1320, restricted: 720 },
    { month: "Jun", valid: 8010, invalid: 1300, risky: 1610, restricted: 810 },
    { month: "Jul", valid: 8290, invalid: 1420, risky: 1810, restricted: 900 },
  ],
}

export const billingDemoData = {
  currentPlan: "Trial",
  monthlyTotal: "$0",
  nextInvoiceDate: "-",
  creditsUsed: 3,
  creditsPlan: 300,
  billingContactEmail: demoUser.email,
  customerId: "cus_demo_efren_prismfly",
  paymentMethod: "Visa ending in 4242",
  plans: [
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
  ],
}

export const integrationDemoData = [
  {
    platform: "Klaviyo",
    connectionName: "Prismfly Development1",
    connectedAt: "March 9, 2026",
    status: "Connected",
    workspaceName: "Main Workspace",
  },
]
