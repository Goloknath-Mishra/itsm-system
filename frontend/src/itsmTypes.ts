export type Team = {
  id: string
  name: string
  email: string
  is_active: boolean
}

export type UserSummary = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  is_staff: boolean
  is_superuser: boolean
  roles: string[]
}

export type TicketComment = {
  id: string
  ticket: string
  author: UserSummary
  body: string
  created_at: string
}

export type TicketApproval = {
  id: string
  ticket: string
  approver: UserSummary
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  comment: string
  requested_at: string
  responded_at: string | null
}

export type Ticket = {
  id: string
  number: string
  kind: 'INCIDENT' | 'SERVICE_REQUEST' | 'PROBLEM' | 'CHANGE'
  status: 'NEW' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED' | 'CANCELED'
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  category: string
  subcategory: string
  change_type: '' | 'STANDARD' | 'NORMAL' | 'EMERGENCY'
  title: string
  description: string
  resolution_summary: string
  requester: UserSummary
  assignee: UserSummary | null
  assignment_group: Team | null
  affected_service: Service | null
  due_at: string | null
  sla_status: 'ON_TRACK' | 'AT_RISK' | 'BREACHED'
  breached_at: string | null
  sla_remaining_minutes: number | null
  closed_at: string | null
  created_at: string
  updated_at: string
  comments: TicketComment[]
  approvals: TicketApproval[]
}

export type KnowledgeArticle = {
  id: string
  title: string
  body: string
  category: string
  status: 'DRAFT' | 'PUBLISHED'
  author: UserSummary
  rating_avg: number | null
  rating_count: number
  created_at: string
  updated_at: string
  published_at: string | null
}

export type Asset = {
  id: string
  asset_tag: string
  name: string
  description: string
  serial_number: string
  vendor: string
  model: string
  status: 'IN_STOCK' | 'IN_USE' | 'UNDER_REPAIR' | 'RETIRED'
  owner: UserSummary | null
  location: string
  purchase_date: string | null
  warranty_expires_on: string | null
  created_at: string
  updated_at: string
}

export type AssetTransaction = {
  id: string
  asset: string
  action: 'CHECK_OUT' | 'CHECK_IN'
  performed_by: UserSummary
  notes: string
  performed_at: string
}

export type BarcodeTemplate = {
  id: string
  name: string
  template: Record<string, unknown>
  is_active: boolean
  created_by: UserSummary
  created_at: string
  updated_at: string
}

export type AssetMetric = {
  id: string
  asset: string
  captured_at: string
  cpu_pct: number | null
  memory_pct: number | null
  temperature_c: number | null
  data: Record<string, unknown>
  created_at: string
}

export type AssetAlert = {
  id: string
  asset: string
  kind: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  message: string
  is_open: boolean
  created_at: string
  resolved_at: string | null
}

export type AssetRecommendation = {
  id: string
  asset: string
  kind: string
  message: string
  created_at: string
}

export type AssetAnalytics = {
  open_alerts: number
  critical_alerts: number
  metrics_last_24h: number
  recommendations: AssetRecommendation[]
}

export type Workflow = {
  id: string
  name: string
  kind: 'INCIDENT_ESCALATION' | 'SLA_ESCALATION' | 'CATALOG_FULFILLMENT'
  is_active: boolean
  deployed_version: WorkflowVersion | null
  created_by: UserSummary
  created_at: string
  updated_at: string
}

export type WorkflowVersion = {
  id: string
  workflow: string
  version: number
  status: 'DRAFT' | 'DEPLOYED' | 'ARCHIVED'
  schema: Record<string, unknown>
  test_cases: Array<Record<string, unknown>>
  created_by: UserSummary
  created_at: string
}

export type WorkflowRun = {
  id: string
  workflow_version: WorkflowVersion
  sandbox: boolean
  input: Record<string, unknown>
  output: Record<string, unknown>
  logs: string[]
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  error: string
  started_at: string
  finished_at: string | null
}

export type KnowledgeFeedback = {
  id: string
  article: string
  user: UserSummary
  rating: number
  helpful: boolean
  comment: string
  created_at: string
}

export type Notification = {
  id: string
  kind: 'SLA' | 'APPROVAL' | 'INFO' | 'AI'
  title: string
  body: string
  link: string
  is_read: boolean
  created_at: string
}

export type Service = {
  id: string
  name: string
  description: string
  owner_team: Team | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CatalogItem = {
  id: string
  name: string
  description: string
  category: string
  is_active: boolean
  requires_approval: boolean
  fulfillment_instructions: string
  form: { id: string; name: string; status: string; record_type: string; version: number } | null
  created_at: string
  updated_at: string
}

export type CatalogRequest = {
  id: string
  item: CatalogItem
  requester: UserSummary
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'FULFILLING' | 'COMPLETED' | 'CANCELED'
  variables: Record<string, unknown>
  ticket: Ticket | null
  approved_by: number | null
  approved_at: string | null
  requested_at: string
  updated_at: string
}

export type AnalyticsKpis = {
  open: number
  critical_open: number
  breached: number
  created_last_7d: number
  resolved_last_7d: number
  knowledge_articles: number
  catalog_items: number
}

export type WarRoomParticipant = {
  id: string
  user: UserSummary | null
  guest_name: string
  role: 'FACILITATOR' | 'AGENT' | 'OBSERVER' | 'GUEST'
  joined_at: string
  left_at: string | null
}

export type WarRoomMessage = {
  id: string
  author: UserSummary | null
  guest_name: string
  body: string
  parent: string | null
  created_at: string
}

export type WarRoom = {
  id: string
  ticket: Ticket
  is_active: boolean
  slack_webhook_url: string
  teams_webhook_url: string
  participants: WarRoomParticipant[]
  created_at: string
  updated_at: string
}

export type LeaderboardEntry = {
  user: UserSummary
  points: number
  events: number
}

export type GamificationLeaderboard = {
  period: 'daily' | 'weekly' | 'monthly'
  leaders: LeaderboardEntry[]
}

export type BadgeAward = {
  id: string
  key: string
  title: string
  created_at: string
}

export type TeamChallenge = {
  id: string
  team: Team
  kind: 'RESOLVE_SLA' | 'KNOWLEDGE'
  title: string
  description: string
  goal: number
  start_at: string
  end_at: string
  is_active: boolean
  created_at: string
}

export type ReportDataset = 'TICKETS' | 'ASSETS' | 'KNOWLEDGE' | 'CATALOG_REQUESTS'

export type ReportDefinition = {
  id: string
  name: string
  dataset: ReportDataset
  selected_fields: string[]
  conditions: unknown
  is_public: boolean
  created_by: UserSummary
  created_at: string
  updated_at: string
}

export type ReportSchedule = {
  id: string
  report: ReportDefinition
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  format: 'CSV' | 'PDF' | 'XLSX'
  recipients: string[]
  is_active: boolean
  next_run_at: string | null
  last_run_at: string | null
  created_at: string
}

export type ServiceRelationship = {
  id: string
  rel_type: 'DEPENDS_ON' | 'RUNS_ON'
  source_service: Service
  target_service: Service | null
  target_asset: { id: string; asset_tag: string; name: string } | null
}

export type KnownError = {
  id: string
  problem_ticket: Ticket
  symptoms: string
  workaround: string
  related_article: KnowledgeArticle | null
  created_at: string
  updated_at: string
}

export type CabMeeting = {
  id: string
  title: string
  start_at: string
  end_at: string
  location: string
  notes: string
  changes: Ticket[]
  created_at: string
}

export type SlaPolicy = {
  id: string
  kind: Ticket['kind']
  priority: Ticket['priority']
  resolution_minutes: number
  at_risk_minutes: number
  is_active: boolean
  updated_at: string
}

export type TicketNumberConfig = {
  id: number
  prefix: string
  padding: number
  updated_at: string
}

export type SystemSetting = {
  id: string
  key: string
  value: Record<string, unknown>
  updated_by: UserSummary | null
  updated_at: string
}

export type GamificationBalance = {
  earned: number
  spent: number
  balance: number
}

export type Achievement = {
  key: string
  title: string
  description: string
  progress: number
  goal: number
  achieved: boolean
  percent: number
}

export type HallOfFame = {
  all_time: LeaderboardEntry[]
  monthly_champions: Array<{ month: string; winner: LeaderboardEntry }>
}

export type Reward = {
  id: string
  name: string
  description: string
  cost_points: number
  is_active: boolean
  stock: number | null
  created_at: string
  updated_at: string
}

export type RewardRedemption = {
  id: string
  reward: Reward
  user: UserSummary
  cost_points: number
  status: 'REQUESTED' | 'APPROVED' | 'FULFILLED' | 'REJECTED'
  created_at: string
  decided_at: string | null
}

export type ConfigNamespace = {
  id: string
  key: string
  name: string
  description: string
  is_active: boolean
  updated_by: UserSummary | null
  updated_at: string
}

export type ConfigEntry = {
  id: string
  namespace_key: string
  key: string
  label: string
  description: string
  value: Record<string, unknown>
  sort_order: number
  is_active: boolean
  updated_by: UserSummary | null
  updated_at: string
}
