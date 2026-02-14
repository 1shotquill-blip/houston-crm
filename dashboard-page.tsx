// apps/web/app/dashboard/page.tsx
'use client'

import { DashboardShell } from '@/components/dashboard/shell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { trpc } from '@/lib/trpc'
import { Users, DollarSign, Mail, TrendingUp, Phone, Calendar } from 'lucide-react'

export default function DashboardPage() {
  const { data: overview, isLoading } = trpc.analytics.overview.useQuery({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    endDate: new Date()
  })

  const { data: contactStats } = trpc.contact.stats.useQuery()
  const { data: dealStats } = trpc.deal.stats.useQuery({})

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardShell>
    )
  }

  const stats = [
    {
      title: 'Total Contacts',
      value: overview?.contacts.total || 0,
      change: `+${overview?.contacts.new || 0} this month`,
      icon: Users,
      iconColor: 'text-blue-500'
    },
    {
      title: 'Open Deals',
      value: overview?.deals.open || 0,
      change: `$${(overview?.deals.totalValue || 0).toLocaleString()} value`,
      icon: TrendingUp,
      iconColor: 'text-green-500'
    },
    {
      title: 'Revenue (MTD)',
      value: `$${(overview?.deals.wonValue || 0).toLocaleString()}`,
      change: `${overview?.deals.won || 0} deals won`,
      icon: DollarSign,
      iconColor: 'text-emerald-500'
    },
    {
      title: 'Emails Sent',
      value: overview?.communication.emailsSent || 0,
      change: `${overview?.communication.smsSent || 0} SMS sent`,
      icon: Mail,
      iconColor: 'text-purple-500'
    }
  ]

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your business metrics and activities
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.change}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Activity & Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Lead Sources */}
          <Card>
            <CardHeader>
              <CardTitle>Top Lead Sources</CardTitle>
              <CardDescription>Where your contacts are coming from</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {contactStats?.topSources.slice(0, 5).map((source) => (
                  <div key={source.source} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{source.source || 'Unknown'}</span>
                    <span className="text-sm text-muted-foreground">{source.count}</span>
                  </div>
                ))}
                {(!contactStats?.topSources || contactStats.topSources.length === 0) && (
                  <p className="text-sm text-muted-foreground">No lead source data yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contact Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Status</CardTitle>
              <CardDescription>Breakdown by lead status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {contactStats?.byStatus && Object.entries(contactStats.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{status.toLowerCase().replace('_', ' ')}</span>
                    <span className="text-sm text-muted-foreground">{count as number}</span>
                  </div>
                ))}
                {!contactStats?.byStatus && (
                  <p className="text-sm text-muted-foreground">No contact data yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Deal Performance */}
        {dealStats && (
          <Card>
            <CardHeader>
              <CardTitle>Deal Performance</CardTitle>
              <CardDescription>Overview of your sales pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                  <p className="text-2xl font-bold">{dealStats.winRate}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Pipeline Value</p>
                  <p className="text-2xl font-bold">${dealStats.totalValue.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Revenue Won</p>
                  <p className="text-2xl font-bold">${dealStats.wonValue.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  )
}
