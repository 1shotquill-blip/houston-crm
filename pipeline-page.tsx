// apps/web/app/pipeline/page.tsx
'use client'

import { useState } from 'react'
import { DashboardShell } from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { trpc } from '@/lib/trpc'
import { Plus, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function PipelinePage() {
  const { data: pipelines } = trpc.pipeline.list.useQuery()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)

  const pipelineId = selectedPipelineId || pipelines?.[0]?.id

  const { data: pipelineData, isLoading } = trpc.deal.byStage.useQuery(
    { pipelineId: pipelineId! },
    { enabled: !!pipelineId }
  )

  const moveDealMutation = trpc.deal.moveStage.useMutation({
    onSuccess: () => {
      // Refetch pipeline data
    }
  })

  if (!pipelines || pipelines.length === 0) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <h2 className="text-2xl font-bold">No pipelines yet</h2>
          <p className="text-muted-foreground">Create your first pipeline to start tracking deals</p>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Pipeline
          </Button>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
            <p className="text-muted-foreground">
              Manage your deals and opportunities
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Deal
          </Button>
        </div>

        {/* Pipeline Selector */}
        {pipelines.length > 1 && (
          <div className="flex gap-2">
            {pipelines.map((pipeline) => (
              <Button
                key={pipeline.id}
                variant={pipelineId === pipeline.id ? 'default' : 'outline'}
                onClick={() => setSelectedPipelineId(pipeline.id)}
              >
                {pipeline.name}
              </Button>
            ))}
          </div>
        )}

        {/* Pipeline Stats */}
        {pipelineData && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Deals</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pipelineData.totalDeals}</div>
                <p className="text-xs text-muted-foreground">
                  ${pipelineData.totalValue.toLocaleString()} total value
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Kanban Board */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {pipelineData?.stages.map((stageData) => (
              <div key={stageData.stage.id} className="flex-shrink-0 w-80">
                <Card className="h-full">
                  <CardHeader
                    className="pb-4"
                    style={{
                      borderBottom: `3px solid ${stageData.stage.color}`
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {stageData.stage.name}
                      </CardTitle>
                      <Badge variant="secondary">
                        {stageData.deals.length}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ${stageData.totalValue.toLocaleString()}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2 max-h-[600px] overflow-y-auto">
                    {stageData.deals.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No deals in this stage
                      </p>
                    ) : (
                      stageData.deals.map((deal) => (
                        <Card
                          key={deal.id}
                          className="p-3 hover:shadow-md transition-shadow cursor-pointer"
                        >
                          <div className="space-y-2">
                            <div>
                              <p className="font-medium text-sm">{deal.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {deal.contact.firstName} {deal.contact.lastName}
                              </p>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">
                                ${Number(deal.value).toLocaleString()}
                              </p>
                              {deal.probability && (
                                <Badge variant="outline" className="text-xs">
                                  {deal.probability}% likely
                                </Badge>
                              )}
                            </div>
                            {deal.expectedCloseDate && (
                              <p className="text-xs text-muted-foreground">
                                Close: {new Date(deal.expectedCloseDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </Card>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
