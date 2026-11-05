export type Share = {
  id: string
  memberId: string
  memberName?: string
  amountCents: number
  paidAt: string | null
  paidByKey: string | null
}

export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

export type Member = {
  id: string
  homeId: string
  name: string
  position?: number
}

export type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}
export async function apiFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input.url
  const headers = new Headers(init.headers)
  // The Vite proxy handles /api prefix; forward as-is
  const response = await fetch(url, {
    ...init,
    headers,
  })
  return response
}

export async function jsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    const errPayload = text ? JSON.parse(text) : { error: 'Request failed' }
    const message = errPayload.error || errPayload.message || `HTTP ${response.status}`
    throw new Error(message)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Invalid JSON response')
  }
}

// Homes
export async function createHome(name: string): Promise<{ id: string; name: string }> {
  const res = await apiFetch('/api/homes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return jsonResponse<{ id: string; name: string }>(res)
}

export async function createMember(homeId: string, name: string): Promise<Member> {
  const res = await apiFetch(`/api/homes/${homeId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return jsonResponse<Member>(res)
}

export async function createBill(homeId: string, title: string, totalCents: number): Promise<Bill> {
  const res = await apiFetch(`/api/homes/${homeId}/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, totalCents }),
  })
  return jsonResponse<Bill>(res)
}

export async function getBills(homeId: string): Promise<Bill[]> {
  const res = await apiFetch(`/api/homes/${homeId}/bills`)
  const data = await jsonResponse<{ bills: Bill[] }>(res)
  return data.bills
}

export async function getBalances(homeId: string): Promise<Balance[]> {
  const res = await apiFetch(`/api/homes/${homeId}/balances`)
  const data = await jsonResponse<{ balances: Balance[] }>(res)
  return data.balances
}

// Payment
export async function payShare(
  billId: string,
  shareId: string,
  idempotencyKey: string,
): Promise<{ id: string; memberId: string; amountCents: number; paidAt: string }> {
  const res = await apiFetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
  })
  if (res.status === 409) {
    const err = await jsonResponse<{ error: string }>(res)
    throw new Error(err.error || 'Share already paid')
  }
  if (res.status === 404) {
    const err = await jsonResponse<{ error: string }>(res)
    throw new Error(err.error || 'Share or bill not found')
  }
  return jsonResponse<{ id: string; memberId: string; amountCents: number; paidAt: string }>(res)
}
