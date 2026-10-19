import { callFunction } from '@/lib/api';

import type { Plan } from './Paywall';

type Checkout =
  | { provider: 'razorpay'; kind: 'razorpay'; key_id: string; subscription_id: string }
  | { provider: 'dodo'; kind: 'redirect'; url: string };

type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void };

let scriptPromise: Promise<RazorpayCtor> | null = null;

/** Loads Razorpay Checkout on demand (only when someone actually upgrades). */
function loadRazorpay(): Promise<RazorpayCtor> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve((window as unknown as { Razorpay: RazorpayCtor }).Razorpay);
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Razorpay failed to load'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Starts checkout with whichever provider the server is configured for. Resolves once the checkout UI is
 * open; Pro unlocks when the payment webhook updates the subscription (see useEntitlement).
 */
export async function startCheckout(
  plan: Plan | 'coach',
  o: { email?: string; onDismiss?: () => void },
): Promise<void> {
  const checkout = await callFunction<Checkout>('create-subscription', { plan });
  if (checkout.kind === 'redirect') {
    window.location.href = checkout.url;
    return;
  }
  const Razorpay = await loadRazorpay();
  new Razorpay({
    key: checkout.key_id,
    subscription_id: checkout.subscription_id,
    name: 'Katori',
    description:
      plan === 'coach' ? 'Katori Trainer' : plan === 'yearly' ? 'Katori Pro · Yearly' : 'Katori Pro · Monthly',
    prefill: o.email ? { email: o.email } : undefined,
    theme: { color: '#F26B1D' },
    modal: { ondismiss: o.onDismiss },
  }).open();
}
