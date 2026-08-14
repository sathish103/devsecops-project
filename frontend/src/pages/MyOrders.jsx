import React, { useEffect, useState } from 'react'
import { orderApi } from '../utils/api'

export default function MyOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const res = await orderApi.get('/api/orders/my-orders')

        setOrders(res.data)
      } catch (err) {
        console.error('Orders error:', err)

        if (
          err?.response?.status === 401 ||
          err?.response?.status === 403
        ) {
          window.location.href = '/login'
          return
        }

        setError(
          err?.response?.data?.message ||
          'Failed to load orders'
        )
      } finally {
        setLoading(false)
      }
    }

    loadOrders()
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        Loading orders...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: 'red' }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>My Orders</h2>

      {orders.length === 0 ? (
        <p>No orders found.</p>
      ) : (
        <table border="1" cellPadding="6">
          <thead>
            <tr>
              <th>ID</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Total</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.productId}</td>
                <td>{o.quantity}</td>
                <td>{o.totalPrice}</td>
                <td>{o.status}</td>
                <td>{o.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}