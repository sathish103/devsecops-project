
import axios from 'axios'

export const userApi = axios.create({
  baseURL: '',
})

export const productApi = axios.create({
  baseURL: '',
})

export const orderApi = axios.create({
  baseURL: '',
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

