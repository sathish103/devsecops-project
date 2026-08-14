import React, { useState } from 'react'
import { userApi } from '../utils/api'
import { saveToken } from '../utils/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()

    setErr(null)
    setLoading(true)

    try {
      const res = await userApi.post(
        '/api/auth/login',
        {
          email,
          password,
        }
      )

      saveToken(res.data.token)

      window.location.href = '/'
    } catch (err) {
      console.error('Login error:', err)

      setErr(
        err?.response?.data?.message ||
        'Login failed'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Login</h2>

      <form onSubmit={submit}>
        <div>
          <input
            placeholder="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <input
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      {err && (
        <div style={{ color: 'red' }}>
          {err}
        </div>
      )}
    </div>
  )
}