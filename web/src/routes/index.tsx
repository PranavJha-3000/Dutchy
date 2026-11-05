import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { createHome } from '../lib/api'
import { formatPaise } from '../lib/money'

export const Route = createFileRoute('/')({
  component: HomeEntry,
})

function HomeEntry() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [homeIdInput, setHomeIdInput] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [createLoading, setCreateLoading] = useState(false)
  const [openLoading, setOpenLoading] = useState(false)

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setCreateError('Home name is required')
      return
    }
    setCreateLoading(true)
    setCreateError(null)
    try {
      const data = await createHome(trimmed)
      navigate({ to: '/home/$homeId', params: { homeId: data.id } })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create home')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleOpen = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const id = homeIdInput.trim()
    if (!id) {
      setOpenError('Home ID is required')
      return
    }
    setOpenLoading(true)
    setOpenError(null)
    try {
      const res = await fetch(`/api/homes/${id}/bills`)
      if (res.status === 404) {
        setOpenError('Home not found')
        return
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || 'Failed to open home')
      }
      navigate({ to: '/home/$homeId', params: { homeId: id } })
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Failed to open home')
    } finally {
      setOpenLoading(false)
    }
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
            <a href="#how" className="header-nav-link">
              How it works
            </a>
            <a href="#get-started" className="btn btn-primary">
              Get started
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="home-hero">
          <div className="container">
            <div className="hero-grid">
              <div>
                <div className="hero-eyebrow">Shared Expenses</div>
                <h1 className="hero-title">
                  Split household bills <strong>fairly and easily.</strong>
                </h1>
                <p className="hero-copy">
                  Dutchy helps your shared home track expenses, split them equally among members,
                  and keep payments in check — all in one place.
                </p>
                <div className="hero-actions">
                  <a href="#get-started" className="btn btn-primary btn-block">
                    Create a home
                  </a>
                  <a href="#how" className="btn btn-outline">
                    How it works
                  </a>
                </div>
              </div>

              <div className="illustration" aria-hidden="true">
                <div className="ill-bill-card">
                  <span className="ill-bill-icon">🏠</span>
                  <h3 className="ill-bill-title">Rent</h3>
                  <div className="ill-bill-amount">{formatPaise(1000)}</div>
                </div>
                <div className="ill-arrows">
                  <span>↓</span>
                  <span>↓</span>
                  <span>↓</span>
                </div>
                <div className="ill-member-cards">
                  <div className="ill-member">
                    <span className="ill-member-avatar">A</span>
                    <p className="ill-member-name">Asha</p>
                    <div className="ill-member-amount">{formatPaise(334)}</div>
                  </div>
                  <div className="ill-member">
                    <span className="ill-member-avatar">B</span>
                    <p className="ill-member-name">Ben</p>
                    <div className="ill-member-amount">{formatPaise(333)}</div>
                  </div>
                  <div className="ill-member">
                    <span className="ill-member-avatar">C</span>
                    <p className="ill-member-name">Chitra</p>
                    <div className="ill-member-amount">{formatPaise(333)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="section-block" id="get-started">
          <div className="container">
            <div className="actions-grid">
              <div className="action-card">
                <span className="action-card-icon">🏠</span>
                <h2 className="action-card-title">Create a home</h2>
                <p className="action-card-desc">
                  Start a new shared home and add members to split bills together.
                </p>
                <form className="form" onSubmit={handleCreate}>
                  <div className="field">
                    <label htmlFor="home-name">Home name</label>
                    <input
                      id="home-name"
                      className="input"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      minLength={1}
                      placeholder="e.g. Flat 4B"
                      disabled={createLoading}
                    />
                    {createError && (
                      <p className="field-error" role="alert">
                        {createError}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary btn-block"
                    disabled={createLoading}
                  >
                    {createLoading ? (
                      <>
                        <span className="spinner" /> Creating…
                      </>
                    ) : (
                      'Create home'
                    )}
                  </button>
                </form>
              </div>

              <div className="action-card">
                <span className="action-card-icon">👥</span>
                <h2 className="action-card-title">Join an existing home</h2>
                <p className="action-card-desc">
                  Open a home that someone else has already created.
                </p>
                <form className="form" onSubmit={handleOpen}>
                  <div className="field">
                    <label htmlFor="home-id">Home ID</label>
                    <input
                      id="home-id"
                      className="input"
                      type="text"
                      value={homeIdInput}
                      onChange={(e) => setHomeIdInput(e.target.value)}
                      required
                      minLength={1}
                      placeholder="Paste a home ID"
                      disabled={openLoading}
                    />
                    <p className="field-hint">
                      You can find the ID in the URL of an existing home or from whoever created it.
                    </p>
                    {openError && (
                      <p className="field-error" role="alert">
                        {openError}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary btn-block"
                    disabled={openLoading}
                  >
                    {openLoading ? (
                      <>
                        <span className="spinner" /> Opening…
                      </>
                    ) : (
                      'Open home'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>

        <section className="steps-section" id="how">
          <div className="container">
            <div className="steps-header">
              <h2 className="steps-label">How it works</h2>
              <div className="steps-divider" aria-hidden="true" />
            </div>
            <div className="steps">
              <div className="step">
                <div className="step-num">1</div>
                <h3 className="step-title">Create a home</h3>
                <p className="step-copy">Set up your shared home.</p>
              </div>
              <div className="step">
                <div className="step-num">2</div>
                <h3 className="step-title">Split expenses</h3>
                <p className="step-copy">Add a bill and we divide it equally.</p>
              </div>
              <div className="step">
                <div className="step-num">3</div>
                <h3 className="step-title">Track payments</h3>
                <p className="step-copy">See who has paid and what's still due.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
