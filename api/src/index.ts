import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

app.onError((_err, c) => c.json({ error: 'internal server error' }, 500))

app.notFound((c) => c.json({ error: 'not found' }, 404))

function jsonError(
  c: { json: (body: unknown, status?: number) => Response },
  message: string,
  status: number,
) {
  return c.json({ error: message }, status)
}

function parseNameBody(body: unknown): { name: string } | null {
  if (body && typeof body === 'object' && 'name' in body) {
    const name = (body as { name: unknown }).name
    if (typeof name === 'string' && name.trim().length > 0) {
      return { name: name.trim() }
    }
  }
  return null
}

app.post('/api/homes', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return jsonError(c, 'invalid request body', 400)
  }

  const parsed = parseNameBody(body)
  if (!parsed) {
    return jsonError(c, 'name is required', 422)
  }

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  const result = await c.env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(id, parsed.name, createdAt)
    .run()

  if (result.meta?.changes !== 1) {
    return jsonError(c, 'failed to create home', 500)
  }

  return c.json({ id, name: parsed.name }, 201)
})

app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return jsonError(c, 'invalid request body', 400)
  }

  const parsed = parseNameBody(body)
  if (!parsed) {
    return jsonError(c, 'name is required', 422)
  }

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  const result = await c.env.DB.prepare(`
      INSERT INTO members (id, home_id, name, position, created_at)
      SELECT ?, ?, ?,
        COALESCE(
          (SELECT MAX(position) + 1 FROM members WHERE home_id = ?),
          0
        ),
        ?
      WHERE EXISTS (SELECT 1 FROM homes WHERE id = ?)
    `)
    .bind(id, homeId, parsed.name, homeId, createdAt, homeId)
    .run()

  if (result.meta?.changes !== 1) {
    return jsonError(c, 'home not found', 404)
  }

  return c.json({ id, homeId, name: parsed.name }, 201)
})

function parseBillBody(body: unknown): { title: string; totalCents: number } | null {
  if (body && typeof body === 'object' && 'title' in body && 'totalCents' in body) {
    const title = (body as { title: unknown }).title
    const totalCents = (body as { totalCents: unknown }).totalCents
    if (
      typeof title === 'string' &&
      title.trim().length > 0 &&
      typeof totalCents === 'number' &&
      Number.isSafeInteger(totalCents) &&
      totalCents > 0
    ) {
      return { title: title.trim(), totalCents }
    }
  }
  return null
}

app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return jsonError(c, 'invalid request body', 400)
  }

  const parsed = parseBillBody(body)
  if (!parsed) {
    return jsonError(c, 'title and totalCents are required', 422)
  }

  const homeExists = await c.env.DB.prepare('SELECT 1 FROM homes WHERE id = ?').bind(homeId).all()
  if (!homeExists.results || homeExists.results.length === 0) {
    return jsonError(c, 'home not found', 404)
  }

  const membersResult = await c.env.DB.prepare(
    'SELECT id, name FROM members WHERE home_id = ? ORDER BY position ASC, id ASC',
  )
    .bind(homeId)
    .all()
  const members = membersResultsOrEmpty(membersResult)
  if (members.length === 0) {
    return jsonError(c, 'home has no members', 422)
  }

  const billId = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  const { shares, statements } = buildBillStatements(
    c.env.DB,
    billId,
    homeId,
    parsed.title,
    parsed.totalCents,
    members,
    createdAt,
  )

  const batchResults = await c.env.DB.batch(statements)
  const allSucceeded = batchResults.every(
    (r) => r.meta?.changes !== undefined && r.meta.changes >= 0,
  )
  if (!allSucceeded) {
    return jsonError(c, 'failed to create bill', 500)
  }

  return c.json(
    {
      id: billId,
      homeId,
      title: parsed.title,
      totalCents: parsed.totalCents,
      shares: shares.map((s) => ({
        id: s.id,
        memberId: s.memberId,
        amountCents: s.amountCents,
        paidAt: null,
      })),
    },
    201,
  )
})

app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const homeExists = await c.env.DB.prepare('SELECT 1 FROM homes WHERE id = ?').bind(homeId).all()
  if (!homeExists.results || homeExists.results.length === 0) {
    return jsonError(c, 'home not found', 404)
  }

  const billsResult = await c.env.DB.prepare(
    'SELECT id, home_id, title, total_cents, created_at FROM bills WHERE home_id = ? ORDER BY created_at ASC, id ASC',
  )
    .bind(homeId)
    .all()
  const bills = billsResultsOrEmpty(billsResult)

  const resultBills = []
  for (const bill of bills) {
    const sharesResult = await c.env.DB.prepare(
      'SELECT s.id, s.member_id, m.name AS memberName, s.amount_cents, s.paid_at FROM shares s JOIN members m ON s.member_id = m.id WHERE s.bill_id = ? ORDER BY m.position ASC, m.id ASC',
    )
      .bind(bill.id)
      .all()
    const shares = sharesResultsOrEmpty(sharesResult)
    resultBills.push({
      id: bill.id,
      homeId: bill.home_id,
      title: bill.title,
      totalCents: bill.total_cents,
      shares: shares.map((s) => ({
        id: s.id,
        memberId: s.member_id,
        memberName: s.memberName,
        amountCents: s.amount_cents,
        paidAt: s.paid_at,
      })),
    })
  }

  return c.json({ bills: resultBills }, 200)
})

app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')

  const key = c.req.header('Idempotency-Key')
  if (!key || key.trim().length === 0) {
    return jsonError(c, 'idempotency key is required', 400)
  }

  const paidAt = new Date().toISOString()

  const db = c.env.DB.withSession('first-primary')

  const updateResult = await db
    .prepare(
      'UPDATE shares SET paid_at = ?, paid_by_key = ? WHERE id = ? AND bill_id = ? AND paid_at IS NULL',
    )
    .bind(paidAt, key, shareId, billId)
    .run()

  if (updateResult.meta?.changes === 1) {
    const shareResult = await db
      .prepare('SELECT s.member_id, s.amount_cents FROM shares s WHERE s.id = ? AND s.bill_id = ?')
      .bind(shareId, billId)
      .all()
    const shares = shareResult.results
    if (!shares || shares.length === 0) {
      return jsonError(c, 'share not found', 404)
    }
    const share = shares[0] as { member_id: string; amount_cents: number }
    return c.json(
      { id: shareId, memberId: share.member_id, amountCents: share.amount_cents, paidAt },
      200,
    )
  }

  const shareResult = await db
    .prepare(
      'SELECT s.member_id, s.amount_cents, s.paid_at, s.paid_by_key FROM shares s WHERE s.id = ? AND s.bill_id = ?',
    )
    .bind(shareId, billId)
    .all()

  const shares = shareResult.results
  if (!shares || shares.length === 0) {
    return jsonError(c, 'share not found', 404)
  }

  const share = shares[0] as {
    member_id: string
    amount_cents: number
    paid_at: string | null
    paid_by_key: string | null
  }

  if (share.paid_at === null) {
    return jsonError(c, 'share not found', 404)
  }

  if (share.paid_by_key === key) {
    return c.json(
      {
        id: shareId,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: share.paid_at,
      },
      200,
    )
  }

  return jsonError(c, 'share already paid', 409)
})

app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const homeExists = await c.env.DB.prepare('SELECT 1 FROM homes WHERE id = ?').bind(homeId).all()
  if (!homeExists.results || homeExists.results.length === 0) {
    return jsonError(c, 'home not found', 404)
  }

  const balanceResult = await c.env.DB.prepare(`
      SELECT
        m.id AS memberId,
        m.name,
        COALESCE(
          SUM(
            CASE
              WHEN s.paid_at IS NULL THEN s.amount_cents
              ELSE 0
            END
          ),
          0
        ) AS outstandingCents
      FROM members m
      LEFT JOIN bills b ON b.home_id = m.home_id
      LEFT JOIN shares s ON s.bill_id = b.id AND s.member_id = m.id
      WHERE m.home_id = ?
      GROUP BY m.id, m.name, m.position
      ORDER BY m.position ASC, m.id ASC
    `)
    .bind(homeId)
    .all()

  const balances = balancesResultsOrEmpty(balanceResult)

  return c.json({ balances }, 200)
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))

export default app

function balancesResultsOrEmpty(result: { results: unknown[] | null }): {
  memberId: string
  name: string
  outstandingCents: number
}[] {
  if (!result.results) {
    return []
  }
  return result.results as {
    memberId: string
    name: string
    outstandingCents: number
  }[]
}

function membersResultsOrEmpty(result: {
  results: unknown[] | null
}): { id: string; name: string }[] {
  if (!result.results) {
    return []
  }
  return result.results as { id: string; name: string }[]
}

function billsResultsOrEmpty(result: { results: unknown[] | null }): {
  id: string
  home_id: string
  title: string
  total_cents: number
  created_at: string
}[] {
  if (!result.results) {
    return []
  }
  return result.results as {
    id: string
    home_id: string
    title: string
    total_cents: number
    created_at: string
  }[]
}

function sharesResultsOrEmpty(result: { results: unknown[] | null }): {
  id: string
  member_id: string
  memberName: string
  amount_cents: number
  paid_at: string | null
}[] {
  if (!result.results) {
    return []
  }
  return result.results as {
    id: string
    member_id: string
    memberName: string
    amount_cents: number
    paid_at: string | null
  }[]
}

type ShareSplit = { id: string; memberId: string; amountCents: number }

function buildBillStatements(
  db: D1Database,
  billId: string,
  homeId: string,
  title: string,
  totalCents: number,
  members: { id: string; name: string }[],
  createdAt: string,
): { shares: ShareSplit[]; statements: D1PreparedStatement[] } {
  const memberCount = members.length
  const base = Math.floor(totalCents / memberCount)
  const remainder = totalCents % memberCount

  const shares: ShareSplit[] = []
  const statements: D1PreparedStatement[] = []

  statements.push(
    db
      .prepare(
        'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(billId, homeId, title, totalCents, createdAt),
  )

  members.forEach((member, index) => {
    const amountCents = index < remainder ? base + 1 : base
    const shareId = crypto.randomUUID()
    shares.push({ id: shareId, memberId: member.id, amountCents })
    statements.push(
      db
        .prepare(
          'INSERT INTO shares (id, bill_id, member_id, amount_cents, paid_at, paid_by_key) VALUES (?, ?, ?, ?, NULL, NULL)',
        )
        .bind(shareId, billId, member.id, amountCents),
    )
  })

  return { shares, statements }
}
