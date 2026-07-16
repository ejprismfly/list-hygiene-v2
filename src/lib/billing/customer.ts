import type { BillingContext, StripeAccountRecord } from "@/lib/billing/scope"
import {
  getBillingTenantFields,
  getScopedBillingAccount,
  updateStripeAccountById,
} from "@/lib/billing/scope"
import {
  createStripeCustomer,
  getOrCreateStripeCustomerByEmail,
} from "@/lib/billing/stripe"

export async function ensureScopedStripeCustomer(context: BillingContext) {
  const { supabase, user, organizationId, workspaceId } = context
  if (!user.email) {
    throw new Error("Not authenticated")
  }

  let stripeAccount = getScopedBillingAccount(context)
  if (stripeAccount?.customer_id) {
    return {
      customerId: stripeAccount.customer_id,
      stripeAccount,
    }
  }

  const metadata = {
    user_id: user.id,
    user_email: user.email,
    billing_scope: workspaceId ? "workspace" : "user",
    ...(organizationId ? { organization_id: organizationId } : {}),
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
  }

  const customer = workspaceId
    ? await createStripeCustomer(
        user.email,
        metadata,
        `customer_create_workspace_${workspaceId}`
      )
    : await getOrCreateStripeCustomerByEmail(user.email, metadata)

  if (stripeAccount) {
    const { error } = await updateStripeAccountById(supabase, stripeAccount, {
      customer_id: customer.id,
      ...getBillingTenantFields(context),
    })
    if (error) {
      throw new Error(error.message)
    }

    stripeAccount = { ...stripeAccount, customer_id: customer.id }
  } else {
    const { data, error } = await supabase
      .from("stripe_accounts")
      .insert({
        user_id: user.id,
        customer_id: customer.id,
        ...getBillingTenantFields(context),
      })
      .select("id, user_id, customer_id, subscription_id, organization_id, workspace_id")
      .single()

    if (error) {
      throw new Error(error.message)
    }

    stripeAccount =
      (data as StripeAccountRecord | null) || {
        user_id: user.id,
        customer_id: customer.id,
        subscription_id: null,
        ...getBillingTenantFields(context),
      }
  }

  return {
    customerId: customer.id,
    stripeAccount,
  }
}
