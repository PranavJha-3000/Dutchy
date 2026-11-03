import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { createHome } from '../lib/api'

export const Route = createFileRoute('/')({
  component: HomeEntry,
})

function HomeEntry() {
  const [name, setName] = useState('')
  const [homeIdInput, setHomeIdInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Home name is required')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await createHome(trimmed)
      navigate({ to: '/home/$homeId', params: { homeId: data.id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create home')
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const id = homeIdInput.trim()
    if (!id) {
      setError('Home ID is required')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/homes/${id}/bills`)
      if (res.status === 404) {
        setError('Home not found')
        return
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || 'Failed to open home')
      }
      navigate({ to: '/home/$homeId', params: { homeId: id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open home')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Bill Splitter</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <section style={{ marginBottom: 24 }}>
        <h2>Create a new home</h2>
        <form onSubmit={handleCreate}>
          <label>
            Home name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              style={{ padding: 8, fontSize: 16 }}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            style={{ marginTop: 8, padding: '8px 12px', fontSize: 16 }}
          >
            Create home
          </button>
        </form>
      </section>
      <section style={{ marginBottom: 24 }}>
        <h2>Open an existing home</h2>
        <form onSubmit={handleOpen}>
          <label>
            Home ID
            <input
              type="text"
              value={homeIdInput}
              onChange={(e) => setHomeIdInput(e.target.value)}
              required
              minLength={1}
              style={{ padding: 8, fontSize: 16 }}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            style={{ marginTop: 8, padding: '8px 12px', fontSize: 16 }}
          >
            Open home
          </button>
        </form>
      </section>
    </main>
  )
}
