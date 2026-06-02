import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import Layout from '@/pages/Layout';
import Home from '@/pages/Home';
import Playground from '@/pages/Playground';
import Docs from '@/pages/Docs';
import AiGuide from '@/pages/AiGuide';
import Api from '@/pages/Api';
import Tos from '@/pages/Tos';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/playground" element={<Playground />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/ai-guide" element={<AiGuide />} />
              <Route path="/api" element={<Api />} />
              <Route path="/tos" element={<Tos />} />
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