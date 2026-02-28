import axios from 'axios'
import { API_BASE_URL } from '../config'

const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
    console.log(`→ ${config.method?.toUpperCase()} ${config.url}`)
    return config
})

client.interceptors.response.use(
    (response) => response,
    (error) => {
        console.error('API Error:', error.response?.status, error.message)
        return Promise.reject(error)
    }
)

export default client
