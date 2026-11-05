import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createBill, createMember, getBalances, getBills, payShare } from '../../lib/api'
import { formatPaise } from '../../lib/money'
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
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null)

  const [billTitle, setBillTitle] = useState('')
  const [billTotal, setBillTotal] = useState('')
  const [billLoading, setBillLoading] = useState(false)
  const [billError, setBillError] = useState<string | null>(null)

  const [payingShareIds, setPayingShareIds] = useState<Set<string>>(new Set())

  const payKeysRef = useRef<Record<string, string>>({})

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
    setMemberSuccess(null)
    try {
      await createMember(homeId, trimmed)
      setMemberName('')
      setMemberSuccess('Member added')
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
      setBillError('Total must be a positive whole number (paise)')
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

  const handlePay = async (billId: string, shareId: string) => {
    setPayingShareIds((prev) => new Set([...prev, shareId]))
    try {
      const key = payKeysRef.current[shareId] ?? crypto.randomUUID()
      payKeysRef.current[shareId] = key
      await payShare(billId, shareId, key)
      await loadData()
      delete payKeysRef.current[shareId]
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed'
      setError(message)
      if (message.includes('already paid')) {
        await loadData()
        delete payKeysRef.current[shareId]
      }
    } finally {
      setPayingShareIds((prev) => {
        const next = new Set(prev)
        next.delete(shareId)
        return next
      })
    }
  }

  const totalOutstanding = balances.reduce((sum, balance) => sum + balance.outstandingCents, 0)
  if (loading) {
    return (
      <>
        <header className="site-header">
          <div className="container">
            <div className="brand">
              <span className="brand-mark">D</span>
              <span>Dutchy</span>
            </div>
            <nav className="header-nav">
              <a href="/">Homes</a>
            </nav>
          </div>
        </header>
        <main className="page">
          <div className="container">
            <div className="loading-block">Loading home…</div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <header className="site-header">
        <div className="container">
          <div className="brand">
            <span className="brand-mark">D</span>
            <span>Dutchy</span>
          </div>
          <nav className="header-nav">
            <a href="/">Homes</a>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void loadData()}
              disabled={loading}
            >
              Refresh
            </button>
          </nav>
        </div>
      </header>

      <main className="page">
        <div className="container">
          <div className="page-header">
            <div>
              <h1 className="page-title">Home</h1>
              <p className="page-subtitle">ID {homeId}</p>
            </div>
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <div className="grid-2 section">
            <div className="card">
              <h2 className="card-title">Add member</h2>
              <p className="card-desc">Add people who share this home.</p>
              <form className="form" onSubmit={handleAddMember}>
                <div className="field">
                  <label htmlFor="member-name">Member name</label>
                  <input
                    id="member-name"
                    className="input"
                    type="text"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Member name"
                    minLength={1}
                    disabled={memberLoading}
                  />
                  {memberError && (
                    <p className="field-error" role="alert">
                      {memberError}
                    </p>
                  )}
                  {memberSuccess && <p className="field-success">{memberSuccess}</p>}
                </div>
                <button type="submit" className="btn btn-primary" disabled={memberLoading}>
                  {memberLoading ? (
                    <>
                      <span className="spinner" /> Adding…
                    </>
                  ) : (
                    'Add member'
                  )}
                </button>
              </form>
            </div>

            <div className="card">
              <h2 className="card-title">Create bill</h2>
              <p className="card-desc">Split a new expense among all members.</p>
              <form className="form" onSubmit={handleAddBill}>
                <div className="field">
                  <label htmlFor="bill-title">Title</label>
                  <input
                    id="bill-title"
                    className="input"
                    type="text"
                    value={billTitle}
                    onChange={(e) => setBillTitle(e.target.value)}
                    placeholder="Title"
                    disabled={billLoading}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bill-total">Total (paise)</label>
                  <input
                    id="bill-total"
                    className="input"
                    type="number"
                    value={billTotal}
                    onChange={(e) => setBillTotal(e.target.value)}
                    placeholder="Total paise"
                    disabled={billLoading}
                  />
                  {billError && (
                    <p className="field-error" role="alert">
                      {billError}
                    </p>
                  )}
                </div>
                <button type="submit" className="btn btn-primary" disabled={billLoading}>
                  {billLoading ? (
                    <>
                      <span className="spinner" /> Creating…
                    </>
                  ) : (
                    'Create bill'
                  )}
                </button>
              </form>
            </div>
          </div>

          <div className="card section">
            <div className="section-header">
              <h2 className="section-title">Outstanding balances</h2>
            </div>
            {balances.length === 0 ? (
              <div className="empty">
                <p className="empty-title">No members yet</p>
                <p className="empty-copy">Add a member to start tracking balances.</p>
              </div>
            ) : (
              <div>
                {balances.map((balance) => (
                  <div className="balance-row" key={balance.memberId}>
                    <span className="balance-name">{balance.name}</span>
                    <span
                      className={
                        balance.outstandingCents === 0
                          ? 'balance-amount balance-amount-zero'
                          : 'balance-amount'
                      }
                    >
                      {formatPaise(balance.outstandingCents)} outstanding
                    </span>
                  </div>
                ))}
                <div className="balance-row balance-total">
                  <span className="balance-name">Total outstanding</span>
                  <span className="balance-amount">{formatPaise(totalOutstanding)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Bills</h2>
              <span className="page-subtitle">{bills.length} total</span>
            </div>
            {bills.length === 0 ? (
              <div className="card empty">
                <p className="empty-title">No bills yet</p>
                <p className="empty-copy">Create a bill to split an expense.</p>
              </div>
            ) : (
              <div className="stack">
                {bills.map((bill) => (
                  <div className="bill-card" key={bill.id}>
                    <div className="bill-head">
                      <h3 className="bill-title">{bill.title}</h3>
                      <span className="bill-total">{formatPaise(bill.totalCents)} total</span>
                    </div>
                    <div>
                      {bill.shares.map((share) => (
                        <div className="share-row" key={share.id}>
                          <div>
                            <div className="share-name">{share.memberName ?? 'Member'}</div>
                            <div className="share-amount">{formatPaise(share.amountCents)}</div>
                          </div>
                          <div className="share-actions">
                            {share.paidAt ? (
                              <span className="badge badge-paid">Paid</span>
                            ) : (
                              <>
                                <span className="badge badge-unpaid">Unpaid</span>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={payingShareIds.has(share.id)}
                                  onClick={() => void handlePay(bill.id, share.id)}
                                >
                                  {payingShareIds.has(share.id) ? (
                                    <>
                                      <span className="spinner" /> Paying…
                                    </>
                                  ) : (
                                    'Pay'
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
