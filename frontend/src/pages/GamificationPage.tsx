import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type {
  Achievement,
  BadgeAward,
  GamificationBalance,
  GamificationLeaderboard,
  HallOfFame,
  Reward,
  RewardRedemption,
  TeamChallenge,
} from '../itsmTypes'
import { Badge, Button, Panel, StatCard, Tabs } from '../components/ui'
import { isAgent } from '../auth/roles'

type GamificationTab = 'leaderboard' | 'badges' | 'achievements' | 'hall-of-fame' | 'rewards' | 'team-battle'

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function GamificationPage() {
  const auth = useAuth()
  const [tab, setTab] = useState<GamificationTab>('leaderboard')
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly')

  const [leaderboard, setLeaderboard] = useState<GamificationLeaderboard | null>(null)
  const [badges, setBadges] = useState<BadgeAward[]>([])
  const [challenges, setChallenges] = useState<TeamChallenge[]>([])
  const [challengeProgress, setChallengeProgress] = useState<Record<string, { count: number; goal: number; percent: number }>>({})
  const [balance, setBalance] = useState<GamificationBalance | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [hallOfFame, setHallOfFame] = useState<HallOfFame | null>(null)
  const [rewards, setRewards] = useState<Reward[]>([])
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!auth.accessToken) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const [lb, myBadges, ch, bal, ach, hof, rw, myRedemptions] = await Promise.all([
        apiFetch<GamificationLeaderboard>(`/api/gamification/leaderboard/?period=${period}`, { token: auth.accessToken }),
        apiFetch<BadgeAward[]>('/api/gamification/my-badges/', { token: auth.accessToken }),
        apiFetch<TeamChallenge[]>('/api/challenges/', { token: auth.accessToken }),
        apiFetch<GamificationBalance>('/api/gamification/balance/', { token: auth.accessToken }),
        apiFetch<{ items: Achievement[] }>('/api/gamification/achievements/', { token: auth.accessToken }),
        apiFetch<HallOfFame>('/api/gamification/hall-of-fame/', { token: auth.accessToken }),
        apiFetch<Reward[]>('/api/rewards/', { token: auth.accessToken }),
        apiFetch<RewardRedemption[]>('/api/rewards/my-redemptions/', { token: auth.accessToken }),
      ])
      setLeaderboard(lb)
      setBadges(myBadges)
      setChallenges(ch)
      setChallengeProgress({})
      setBalance(bal)
      setAchievements(ach.items)
      setHallOfFame(hof)
      setRewards(rw)
      setRedemptions(myRedemptions)
    } catch {
      setError('Failed to load gamification data')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, period])

  useEffect(() => {
    void load()
  }, [load])

  const leaders = useMemo(() => leaderboard?.leaders ?? [], [leaderboard])
  const periodLabel = period === 'daily' ? 'Daily' : period === 'monthly' ? 'Monthly' : 'Weekly'
  const weeklyChampion = leaders[0]?.user?.username ?? '—'
  const totalPoints = useMemo(() => leaders.reduce((sum, l) => sum + l.points, 0), [leaders])
  const hallOfFameMembers = Math.max(0, Math.min(12, leaders.length))
  const pointsBalance = balance?.balance ?? 0

  return (
    <div className="snPage">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">Agent Gamification</h1>
          <div className="snSubtle">Recognize top performers and track achievements.</div>
        </div>
        <div className="snRowWrap">
          <Badge tone="info">{isAgent(auth.user) ? 'Agent view' : 'Read-only'}</Badge>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <div className="snCardGrid">
        <StatCard label="Hall of Fame members" value={hallOfFameMembers} meta={`Top performers (${periodLabel})`} />
        <StatCard label="Badges earned" value={badges.length} meta="Knowledge contributions" />
        <StatCard label="Total points" value={totalPoints} meta={`Awarded (${periodLabel})`} />
        <StatCard label={`${periodLabel} champion`} value={weeklyChampion} meta="Highest points" />
      </div>

      <Panel
        title="Leaderboard"
        actions={
          <Tabs
            value={tab}
            options={[
              { value: 'leaderboard', label: 'Leaderboard' },
              { value: 'badges', label: 'Badges' },
              { value: 'achievements', label: 'Achievements' },
              { value: 'hall-of-fame', label: 'Hall of Fame' },
              { value: 'rewards', label: 'Rewards' },
              { value: 'team-battle', label: 'Team Battle' },
            ]}
            onChange={setTab}
          />
        }
      >
        {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
        {!isLoading && tab === 'leaderboard' ? (
          <div className="snGrid2">
            <Panel title="Top Performers">
              <div style={{ display: 'grid', gap: 10 }}>
                {leaders.slice(0, 3).map((l, idx) => (
                  <div
                    key={l.user.username}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.07)',
                      background:
                        idx === 0
                          ? 'linear-gradient(180deg, rgba(255,176,32,0.18), rgba(255,176,32,0.06))'
                          : idx === 1
                            ? 'linear-gradient(180deg, rgba(139,123,255,0.16), rgba(139,123,255,0.06))'
                            : 'linear-gradient(180deg, rgba(31,210,255,0.12), rgba(31,210,255,0.05))',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 999,
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 780,
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.10)',
                        }}
                      >
                        {initials(l.user.username)}
                      </div>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ fontWeight: 760 }}>{l.user.username}</div>
                        <div className="snSubtle">{l.events} events</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 820, letterSpacing: -0.2 }}>{l.points}</div>
                      <div className="snSubtle">points</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="snRowWrap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <Button type="button" onClick={() => setPeriod('daily')} disabled={period === 'daily'}>
                  Daily
                </Button>
                <Button type="button" onClick={() => setPeriod('weekly')} disabled={period === 'weekly'}>
                  Weekly
                </Button>
                <Button type="button" onClick={() => setPeriod('monthly')} disabled={period === 'monthly'}>
                  Monthly
                </Button>
              </div>
            </Panel>

            <Panel title="Full Rankings">
              <div style={{ display: 'grid', gap: 10 }}>
                {leaders.map((l, idx) => (
                  <div
                    key={l.user.username}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.06)',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Badge tone={idx === 0 ? 'warning' : idx === 1 ? 'info' : idx === 2 ? 'success' : 'neutral'}>
                        #{idx + 1}
                      </Badge>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ fontWeight: 720 }}>{l.user.username}</div>
                        <div className="snSubtle">{l.events} events</div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 820 }}>{l.points}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {!isLoading && tab === 'badges' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {badges.length === 0 ? <div style={{ color: 'var(--muted)' }}>No badges yet.</div> : null}
            {badges.map((b) => (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{ display: 'grid', gap: 2 }}>
                  <div style={{ fontWeight: 760 }}>{b.title}</div>
                  <div className="snSubtle">{b.key}</div>
                </div>
                <div className="snSubtle">{new Date(b.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        ) : null}

        {!isLoading && tab === 'team-battle' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {challenges.length === 0 ? <div style={{ color: 'var(--muted)' }}>No challenges configured.</div> : null}
            {challenges.map((c) => {
              const p = challengeProgress[c.id]
              return (
                <div key={c.id} className="snPanel" style={{ padding: 12 }}>
                  <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontWeight: 820 }}>{c.title}</div>
                      <div className="snSubtle">{c.team.name} · {c.kind === 'RESOLVE_SLA' ? 'Resolve within SLA' : 'Knowledge'}</div>
                    </div>
                    <div className="snRowWrap">
                      <Badge tone={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
                      <Button
                        type="button"
                        onClick={async () => {
                          if (!auth.accessToken) return
                          const data = await apiFetch<{ count: number; goal: number; percent: number }>(`/api/challenges/${c.id}/progress/`, {
                            token: auth.accessToken,
                          })
                          setChallengeProgress((prev) => ({ ...prev, [c.id]: data }))
                        }}
                      >
                        Refresh progress
                      </Button>
                    </div>
                  </div>
                  {c.description ? <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.82)' }}>{c.description}</div> : null}
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ width: `${p?.percent ?? 0}%`, height: '100%', background: 'rgba(31,210,255,0.85)' }} />
                    </div>
                    <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                      <div className="snSubtle">
                        {p ? `${p.count}/${p.goal}` : `Goal: ${c.goal}`}
                      </div>
                      <div className="snSubtle">
                        {new Date(c.start_at).toLocaleDateString()} → {new Date(c.end_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {!isLoading && tab === 'achievements' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {achievements.length === 0 ? <div style={{ color: 'var(--muted)' }}>No achievements configured.</div> : null}
            {achievements.map((a) => (
              <div key={a.key} className="snPanel" style={{ padding: 12 }}>
                <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ fontWeight: 820 }}>{a.title}</div>
                    <div className="snSubtle">{a.description}</div>
                  </div>
                  <Badge tone={a.achieved ? 'success' : 'neutral'}>{a.achieved ? 'Achieved' : `${a.progress}/${a.goal}`}</Badge>
                </div>
                <div style={{ marginTop: 10, height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${a.percent}%`, height: '100%', background: a.achieved ? 'rgba(88,255,149,0.8)' : 'rgba(31,210,255,0.85)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!isLoading && tab === 'hall-of-fame' ? (
          <div className="snGrid2">
            <Panel title="All-time Top 10">
              {!hallOfFame || hallOfFame.all_time.length === 0 ? <div className="snSubtle">No data.</div> : null}
              {hallOfFame && hallOfFame.all_time.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {hallOfFame.all_time.map((l, idx) => (
                    <div key={l.user.username} className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                      <div className="snRowWrap">
                        <Badge tone={idx === 0 ? 'warning' : idx === 1 ? 'info' : idx === 2 ? 'success' : 'neutral'}>#{idx + 1}</Badge>
                        <div style={{ fontWeight: 760 }}>{l.user.username}</div>
                        <div className="snSubtle">{l.events} events</div>
                      </div>
                      <div style={{ fontWeight: 820 }}>{l.points}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
            <Panel title="Monthly Champions">
              {!hallOfFame || hallOfFame.monthly_champions.length === 0 ? <div className="snSubtle">No data.</div> : null}
              {hallOfFame && hallOfFame.monthly_champions.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {hallOfFame.monthly_champions.map((m) => (
                    <div key={m.month} className="snPanel" style={{ padding: 12 }}>
                      <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 780 }}>{m.month}</div>
                        <Badge tone="warning">{m.winner.user.username}</Badge>
                      </div>
                      <div className="snSubtle" style={{ marginTop: 6 }}>
                        {m.winner.points} points · {m.winner.events} events
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          </div>
        ) : null}

        {!isLoading && tab === 'rewards' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Panel title="My Balance">
              <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                <div className="snSubtle">Points available for redemptions.</div>
                <Badge tone={pointsBalance > 0 ? 'success' : 'neutral'}>{pointsBalance} points</Badge>
              </div>
            </Panel>
            <div className="snGrid2">
              <Panel title="Rewards Catalog">
                {rewards.length === 0 ? <div className="snSubtle">No rewards configured.</div> : null}
                {rewards.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {rewards.filter((r) => r.is_active).slice(0, 20).map((r) => (
                      <div key={r.id} className="snPanel" style={{ padding: 12 }}>
                        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                          <div style={{ display: 'grid', gap: 2 }}>
                            <div style={{ fontWeight: 820 }}>{r.name}</div>
                            <div className="snSubtle">{r.description}</div>
                          </div>
                          <Badge tone="info">{r.cost_points} pts</Badge>
                        </div>
                        <div className="snRowWrap" style={{ justifyContent: 'space-between', marginTop: 10 }}>
                          <div className="snSubtle">Stock: {r.stock == null ? '∞' : r.stock}</div>
                          <Button
                            type="button"
                            variant="primary"
                            disabled={pointsBalance < r.cost_points || (r.stock != null && r.stock <= 0)}
                            onClick={async () => {
                              if (!auth.accessToken) return
                              await apiFetch(`/api/rewards/${r.id}/redeem/`, { method: 'POST', token: auth.accessToken })
                              await load()
                              setTab('rewards')
                            }}
                          >
                            Redeem
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Panel>
              <Panel title="My Redemptions">
                {redemptions.length === 0 ? <div className="snSubtle">No redemptions.</div> : null}
                {redemptions.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {redemptions.slice(0, 20).map((r) => (
                      <div key={r.id} className="snPanel" style={{ padding: 12 }}>
                        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 780 }}>{r.reward.name}</div>
                          <Badge tone={r.status === 'FULFILLED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}>{r.status}</Badge>
                        </div>
                        <div className="snSubtle" style={{ marginTop: 6 }}>
                          {r.cost_points} points · {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Panel>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
