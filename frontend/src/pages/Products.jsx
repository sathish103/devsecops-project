import React, { useEffect, useState } from 'react'
import { productApi, orderApi } from '../utils/api'

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await productApi.get('/api/products')
        setProducts(res.data)
      } catch (err) {
        console.error('Products error:', err)
        setError(
          err?.response?.data?.message ||
          'Failed to load products'
        )
      } finally {
        setLoading(false)
      }
    }

    loadProducts()
  }, [])

  const order = async (id) => {
    const token = localStorage.getItem('token')

    if (!token) {
      window.location.href = '/login'
      return
    }

    try {
      await orderApi.post('/api/orders', {
        productId: id,
        quantity: 1,
      })

      alert('Order placed successfully')
    } catch (err) {
      console.error('Order error:', err)

      alert(
        err?.response?.data?.message ||
        'Failed to place order'
      )
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        Loading products...
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
      <h2>Products</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit,minmax(200px,1fr))',
          gap: 10,
        }}
      >
        {products.map((p) => (
          <div
            key={p.id}
            style={{
              border: '1px solid #ccc',
              padding: 10,
            }}
          >
            <h3>{p.name}</h3>

            <div>₹{p.price}</div>

            <div>
              Quantity: {p.quantity}
            </div>

            <button
              onClick={() => order(p.id)}
              disabled={p.quantity <= 0}
            >
              Order
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}