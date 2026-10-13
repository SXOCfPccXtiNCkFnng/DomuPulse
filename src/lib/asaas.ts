import "server-only";
import { asaasEnv } from "@/lib/env.server";

const BASE_URL = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;

export class AsaasError extends Error {
  constructor(
    public status: number,
    public details: unknown,
  ) {
    super(`Asaas respondeu ${status}`);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { env, apiKey } = asaasEnv();
  const res = await fetch(`${BASE_URL[env]}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "DomuPulse/1.0",
      access_token: apiKey,
      ...init.headers,
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new AsaasError(res.status, body);
  return body as T;
}

export type AsaasCustomer = { id: string };
export type AsaasSubscription = { id: string; status: string };
export type AsaasPayment = { id: string; invoiceUrl: string; status: string; value: number };

export function createCustomer(input: { name: string; email: string; cpfCnpj: string; orgId: string }) {
  return request<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpfCnpj,
      externalReference: input.orgId,
    }),
  });
}

export function createSubscription(input: {
  customerId: string;
  valueCents: number;
  orgId: string;
  nextDueDate: string;
  description: string;
}) {
  return request<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      // O cliente escolhe Pix, boleto ou cartão na fatura.
      billingType: "UNDEFINED",
      value: input.valueCents / 100,
      nextDueDate: input.nextDueDate,
      cycle: "MONTHLY",
      description: input.description,
      externalReference: input.orgId,
    }),
  });
}

export function updateSubscriptionValue(subscriptionId: string, valueCents: number) {
  return request<AsaasSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PUT",
    body: JSON.stringify({ value: valueCents / 100, updatePendingPayments: true }),
  });
}

export async function firstPendingPayment(subscriptionId: string) {
  const list = await request<{ data: AsaasPayment[] }>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/payments?status=PENDING`,
  );
  return list.data[0] ?? null;
}

// Formato do corpo que o Asaas envia para o webhook.
export type AsaasWebhook = {
  id: string;
  event: string;
  payment?: { id: string; subscription?: string | null; externalReference?: string | null; value: number; billingType?: string };
  subscription?: { id: string; externalReference?: string | null };
};
