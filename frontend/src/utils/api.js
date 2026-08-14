import axios from 'axios'

const USER_API =
  import.meta.env.VITE_USER_API || 'http://localhost:8081'

const PRODUCT_API =
  import.meta.env.VITE_PRODUCT_API || 'http://localhost:8082'

const ORDER_API =
  import.meta.env.VITE_ORDER_API || 'http://localhost:8083'


export const userApi = axios.create({
  baseURL: USER_API,
})

export const productApi = axios.create({
  baseURL: PRODUCT_API,
})

export const orderApi = axios.create({
  baseURL: ORDER_API,
})


const addAuthInterceptor = (api) => {
  api.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token')

      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }

      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  return api
}


addAuthInterceptor(userApi)
addAuthInterceptor(productApi)
addAuthInterceptor(orderApi)