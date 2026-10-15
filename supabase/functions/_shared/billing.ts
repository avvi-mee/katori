// Billing adapter: one interface, one implementation per provider. PAYMENT_PROVIDER picks which
// one new checkouts use; webhooks from either provider are accepted so switching is safe.
import type { BillingProvider, Plan } from './gen/features/billing/webhook.ts';
import { fail } from './http.ts';

export type Checkout =
  | { provider: 'razorpay'; kind: 'razorpay'; key_id: string; subscription_id: string }
  | { provider: 'dodo'; kind: 'redirect'; url: string };

const env = (k: string) => Deno.env.get(k) ?? '';

export function providerFromEnv(): BillingProvider {
  return env('PAYMENT_PROVIDER') === 'dodo' ? 'dodo' : 'razorpay';
}

export const planIds = () => ({ monthly: env('RAZORPAY_PLAN_MONTHLY'), yearly: env('RAZORPAY_PLAN_YEARLY') });
export const productIds = () => ({ monthly: env('DODO_PRODUCT_MONTHLY'), yearly: env('DODO_PRODUCT_YEARLY') });

const dodoBase = () =>
  env('DODO_ENVIRONMENT') === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

async function call(url: string, init: RequestInit, what: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    console.error(`${what} failed`, res.status, (await res.text()).slice(0, 500));
    fail('INTERNAL', 'Payment provider error. Please try again.');
  }
  return res.status === 204 ? {} : res.json();
}

const razorpayAuth = () => `Basic ${btoa(`${env('RAZORPAY_KEY_ID')}:${env('RAZORPAY_KEY_SECRET')}`)}`;

export async function createCheckout(
  provider: BillingProvider,
  o: { userId: string; email: string | undefined; plan: Plan; returnUrl: string },
): Promise<Checkout> {
  if (provider === 'razorpay') {
    const planId = planIds()[o.plan];
    if (!planId || !env('RAZORPAY_KEY_SECRET')) fail('INTERNAL', 'Payments are not configured yet.');
    const sub = await call(
      'https://api.razorpay.com/v1/subscriptions',
      {
        method: 'POST',
        headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: planId,
          total_count: o.plan === 'yearly' ? 10 : 120,
          quantity: 1,
          customer_notify: 1,
          notes: { user_id: o.userId, plan: o.plan },
        }),
      },
      'razorpay create subscription',
    );
    return { provider, kind: 'razorpay', key_id: env('RAZORPAY_KEY_ID'), subscription_id: sub.id };
  }

  const productId = productIds()[o.plan];
  if (!productId || !env('DODO_API_KEY')) fail('INTERNAL', 'Payments are not configured yet.');
  const session = await call(
    `${dodoBase()}/checkouts`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('DODO_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_cart: [{ product_id: productId, quantity: 1 }],
        ...(o.email ? { customer: { email: o.email } } : {}),
        return_url: o.returnUrl,
        metadata: { user_id: o.userId, plan: o.plan },
      }),
    },
    'dodo create checkout',
  );
  if (!session.checkout_url) fail('INTERNAL', 'Payment provider error. Please try again.');
  return { provider, kind: 'redirect', url: session.checkout_url };
}

/** Stop renewals. atPeriodEnd keeps Pro until the paid period ends (one-tap cancel); false stops now (account deletion). */
export async function cancelSubscription(provider: BillingProvider, ref: string, atPeriodEnd: boolean) {
  if (provider === 'razorpay') {
    await call(
      `https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(ref)}/cancel`,
      {
        method: 'POST',
        headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_at_cycle_end: atPeriodEnd ? 1 : 0 }),
      },
      'razorpay cancel',
    );
    return;
  }
  await call(
    `${dodoBase()}/subscriptions/${encodeURIComponent(ref)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env('DODO_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(atPeriodEnd ? { cancel_at_next_billing_date: true } : { status: 'cancelled' }),
    },
    'dodo cancel',
  );
}
