import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { AdminLayout } from '@/components/dashboard/AdminLayout'
import { ProtectedRoute, AdminRoute } from '@/routes/ProtectedRoute'

import Home from '@/pages/public/Home'
import Courts from '@/pages/public/Courts'
import Booking from '@/pages/public/Booking'
import Login from '@/pages/public/Login'
import Signup from '@/pages/public/Signup'
import MyBookings from '@/pages/public/MyBookings'
import Contact from '@/pages/public/Contact'
import NotFound from '@/pages/public/NotFound'

const AdminOverview = lazy(() => import('@/pages/admin/AdminOverview'))
const AdminAgenda = lazy(() => import('@/pages/admin/AdminAgenda'))
const AdminBookings = lazy(() => import('@/pages/admin/AdminBookings'))
const AdminCourts = lazy(() => import('@/pages/admin/AdminCourts'))
const AdminPayments = lazy(() => import('@/pages/admin/AdminPayments'))
const AdminCustomers = lazy(() => import('@/pages/admin/AdminCustomers'))
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'))

function AdminFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/quadras" element={<Courts />} />
        <Route path="/agendar" element={<Booking />} />
        <Route path="/contato" element={<Contact />} />
        <Route path="/entrar" element={<Login />} />
        <Route path="/cadastrar" element={<Signup />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/minha-conta" element={<MyBookings />} />
        </Route>
      </Route>

      <Route element={<AdminRoute />}>
        <Route
          path="/admin"
          element={
            <Suspense fallback={<AdminFallback />}>
              <AdminLayout />
            </Suspense>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminOverview />
              </Suspense>
            }
          />
          <Route
            path="agenda"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminAgenda />
              </Suspense>
            }
          />
          <Route
            path="reservas"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminBookings />
              </Suspense>
            }
          />
          <Route
            path="quadras"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminCourts />
              </Suspense>
            }
          />
          <Route
            path="pagamentos"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminPayments />
              </Suspense>
            }
          />
          <Route
            path="clientes"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminCustomers />
              </Suspense>
            }
          />
          <Route
            path="configuracoes"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminSettings />
              </Suspense>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
