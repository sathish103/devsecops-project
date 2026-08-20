import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Products from './pages/Products'
import MyOrders from './pages/MyOrders'
import { logout } from './utils/auth'

function App(){
  const token = localStorage.getItem('token')
  return (
    <BrowserRouter>
      <nav style={{padding:10}}>
        <Link to="/">Products</Link> | <Link to="/login">Login</Link> | <Link to="/register">Register</Link> | <Link to="/my-orders">My Orders</Link>
        <div>Frontend Release: v39</div>
        {token && <button onClick={() => { logout(); window.location.href = '/login' }}>Logout</button>}
      </nav>
      <Routes>
        <Route path="/" element={<Products/>} />
        <Route path="/login" element={<Login/>} />
        <Route path="/register" element={<Register/>} />
        <Route path="/my-orders" element={<MyOrders/>} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(<App />)
