import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './Layout'
import { AssetsPage } from './pages/AssetsPage'
import { AssetScannerPage } from './pages/AssetScannerPage'
import { AssetAnalyticsPage } from './pages/AssetAnalyticsPage'
import { DashboardPage } from './pages/DashboardPage'
import { CmdbPage } from './features/cmdb/pages/CmdbPage'
import { FormDesignerEditorPage } from './pages/FormDesignerEditorPage'
import { FormDesignerListPage } from './pages/FormDesignerListPage'
import { GamificationPage } from './pages/GamificationPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { MyCatalogRequestsPage } from './pages/MyCatalogRequestsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { PortalHomePage } from './pages/PortalHomePage'
import { ReportBuilderPage } from './pages/ReportBuilderPage'
import { ReportsListPage } from './pages/ReportsListPage'
import { ServiceCatalogPage } from './pages/ServiceCatalogPage'
import { ProblemsPage } from './features/problems/pages/ProblemsPage'
import { ChangesPage } from './features/changes/pages/ChangesPage'
import { RequestsPage } from './features/requests/pages/RequestsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SlaPage } from './pages/SlaPage'
import { TicketDetailPage } from './pages/TicketDetailPage'
import { VirtualAgentPage } from './pages/VirtualAgentPage'
import { WarRoomPage } from './pages/WarRoomPage'
import { WorkQueuePage } from './pages/WorkQueuePage'
import { WorkflowsListPage } from './pages/WorkflowsListPage'
import { WorkflowEditorPage } from './pages/WorkflowEditorPage'
import { AIAgentsPage } from './features/ai/pages/AIAgentsPage'
import { SearchPage } from './pages/SearchPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
      <Route path="/guest/war-room/:id/:token" element={<WarRoomPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="incidents" element={<WorkQueuePage kind="INCIDENT" />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="problems" element={<ProblemsPage />} />
        <Route path="changes" element={<ChangesPage />} />
        <Route path="tickets" element={<Navigate to="/incidents" replace />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="incidents/:id/war-room" element={<WarRoomPage />} />
        <Route path="portal" element={<PortalHomePage />} />
        <Route path="portal/catalog" element={<ServiceCatalogPage />} />
        <Route path="portal/requests" element={<MyCatalogRequestsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="virtual-agent" element={<VirtualAgentPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="assets/scanner" element={<AssetScannerPage />} />
        <Route path="assets/analytics" element={<AssetAnalyticsPage />} />
        <Route path="cmdb" element={<CmdbPage />} />
        <Route path="sla" element={<SlaPage />} />
        <Route path="reports" element={<ReportsListPage />} />
        <Route path="reports/:id" element={<ReportBuilderPage />} />
        <Route path="workflows" element={<WorkflowsListPage />} />
        <Route path="workflows/:id" element={<WorkflowEditorPage />} />
        <Route path="gamification" element={<GamificationPage />} />
        <Route path="form-designer" element={<FormDesignerListPage />} />
        <Route path="form-designer/:id" element={<FormDesignerEditorPage />} />
        <Route path="ai-agents" element={<AIAgentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

export default App
