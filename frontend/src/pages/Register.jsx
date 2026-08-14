import React, { useState } from 'react'
import { userApi } from '../utils/api'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()

    setMsg(null)
    setLoading(true)

    try {
      const res = await userApi.post('/api/auth/register', {
        name,
        email,
        password,
      })

      console.log('Registration response:', res.data)

      setMsg('Registered successfully. You can login now.')

      setName('')
      setEmail('')
      setPassword('')
    } catch (err) {
      console.error('Registration error:', err)

      setMsg(
        err?.response?.data?.message ||
        'Registration failed'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Register</h2>

      <form onSubmit={submit}>
        <div>
          <input
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <input
            placeholder="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <input
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>

      {msg && (
        <div style={{ marginTop: 10 }}>
          {msg}
        </div>
      )}
    </div>
  )
}