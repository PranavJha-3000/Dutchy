import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createBill, createMember, getBalances, getBills, payShare } from '../../lib/api'
import type { Balance, Bill } from '../../lib/types'

export const Route = createFileRoute('/home/$homeId')({
  component: HomeDashboard,
})

function HomeDashboard() {
  const { homeId } = Route.useParams()
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [memberName, setMemberName] = useState('')
  const [memberLoading, setMemberLoading] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)

  const [billTitle, setBillTitle] = useState('')
  const [billTotal, setBillTotal] = useState('')
  const [billLoading, setBillLoading] = useState(false)
  const [billError, setBillError] = useState<string | null>(null)

  const [payingShareIds, setPayingShareIds] = useState<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, bal] = await Promise.all([getBills(homeId), getBalances(homeId)])
      setBills(b)
      setBalances(bal)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [homeId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleAddMember = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = memberName.trim()
    if (!trimmed) {
      setMemberError('Member name is required')
      return
    }
    setMemberLoading(true)
    setMemberError(null)
    try {
      await createMember(homeId, trimmed)
      setMemberName('')
      await loadData()
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setMemberLoading(false)
    }
  }

  const handleAddBill = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const title = billTitle.trim()
    const total = Number(billTotal)
    if (!title) {
      setBillError('Title is required')
      return
    }
    if (!Number.isSafeInteger(total) || total <= 0) {
      setBillError('Total must be a positive whole number (cents)')
      return
    }
    setBillLoading(true)
    setBillError(null)
    try {
      await createBill(homeId, title, total)
      setBillTitle('')
      setBillTotal('')
      await loadData()
    } catch (err) {
      setBillError(err instanceof Error ? err.message : 'Failed to create bill')
    } finally {
      setBillLoading(false)
    }
  }

  const payKeysRef = useRef<Record<string, string>>({})

  const handlePay = async (billId: string, shareId: string) => {
    setPayingShareIds((prev) => new Set([...prev, shareId]))
    try {
      const key = payKeysRef.current[shareId] ?? crypto.randomUUID()
      payKeysRef.current[shareId] = key
      await payShare(billId, shareId, key)
      await loadData()
      // Clear only this share's key after confirmed 200
      delete payKeysRef.current[shareId]
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed'
      setError(message)
      // HTTP 409: refresh server data; clear key only if share is already paid
      if (message.includes('already paid')) {
        await loadData()
        delete payKeysRef.current[shareId]
      }
      // Otherwise retain the key for uncertain network failures
    } finally {
      setPayingShareIds((prev) => {
        const next = new Set(prev)
        next.delete(shareId)
        return next
      })
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <p>Loading...</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Home {homeId}</h1>
      <a href="/">Homes</a>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <section style={{ marginBottom: 24 }}>
        <h2>Add member</h2>
        <form onSubmit={handleAddMember}>
          <input
            type="text"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            placeholder="Member name"
            minLength={1}
            style={{ padding: 8, fontSize: 16 }}
          />
          <button
            type="submit"
            disabled={memberLoading}
            style={{ marginLeft: 8, padding: '8px 12px', fontSize: 16 }}
          >
            Add
          </button>
        </form>
        {memberError && <p style={{ color: 'red' }}>{memberError}</p>}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Create bill</h2>
        <form onSubmit={handleAddBill}>
          <input
            type="text"
            value={billTitle}
            onChange={(e) => setBillTitle(e.target.value)}
            placeholder="Title"
            style={{ padding: 8, fontSize: 16, marginRight: 8 }}
          />
          <input
            type="number"
            value={billTotal}
            onChange={(e) => setBillTotal(e.target.value)}
            placeholder="Total cents"
            style={{ padding: 8, fontSize: 16, marginRight: 8 }}
          />
          <button
            type="submit"
            disabled={billLoading}
            style={{ padding: '8px 12px', fontSize: 16 }}
          >
            Create bill
          </button>
        </form>
        {billError && <p style={{ color: 'red' }}>{billError}</p>}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Bills</h2>
        {bills.length === 0 ? (
          <p>No bills yet.</p>
        ) : (
          <ul>
            {bills.map((bill) => (
              <li key={bill.id} style={{ marginBottom: 16 }}>
                <strong>{bill.title}</strong> — {bill.totalCents} cents
                <ul>
                  {bill.shares.map((share) => (
                    <li key={share.id}>
                      {share.memberName ?? 'Member'}: {share.amountCents} cents
                      {share.paidAt ? (
                        <span> (paid)</span>
                      ) : (
                        <button
                          type="button"
                          disabled={payingShareIds.has(share.id)}
                          onClick={() => void handlePay(bill.id, share.id)}
                          style={{ marginLeft: 8 }}
                        >
                          Pay
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Balances</h2>
        <button type="button" onClick={() => void loadData()} style={{ marginBottom: 8 }}>
          Refresh
        </button>
        {balances.length === 0 ? (
          <p>No members yet.</p>
        ) : (
          <ul>
            {balances.map((b) => (
              <li key={b.memberId}>
                {b.name}: {b.outstandingCents} cents outstanding
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
