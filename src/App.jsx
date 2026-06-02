import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import Layout from '@/pages/Layout';
import Playground from '@/pages/Playground';
import Docs from '@/pages/Docs';
import AiGuide from '@/pages/AiGuide';
import Api from '@/pages/Api';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Playground />} />
              <Route path="/playground" element={<Navigate to="/" replace />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/ai-guide" element={<AiGuide />} />
              <Route path="/api" element={<Api />} />
            </Route>
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
        <SonnerToaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App