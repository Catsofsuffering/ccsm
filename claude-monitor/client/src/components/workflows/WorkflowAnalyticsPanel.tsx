import { useState } from "react";
import { Info } from "lucide-react";
import type { WorkflowData } from "../../lib/types";
import { ToolExecutionFlow } from "./ToolExecutionFlow";
import { AgentCollaborationNetwork } from "./AgentCollaborationNetwork";
import { SubagentEffectiveness } from "./SubagentEffectiveness";
import { WorkflowPatterns } from "./WorkflowPatterns";
import { ModelDelegationFlow } from "./ModelDelegationFlow";
import { ErrorPropagationMap } from "./ErrorPropagationMap";
import { ConcurrencyTimeline } from "./ConcurrencyTimeline";
import { SessionComplexityScatter } from "./SessionComplexityScatter";
import { CompactionImpact } from "./CompactionImpact";

interface WorkflowAnalyticsPanelProps {
  data: WorkflowData;
}

export function WorkflowAnalyticsPanel({ data }: WorkflowAnalyticsPanelProps) {
  return (
    <div className="space-y-6">
      <Section title="Tool Execution Flow" subtitle="How tools chain together across observed runs.">
        <ToolExecutionFlow data={data.toolFlow} />
      </Section>

      <Section title="Agent Type Pipeline Graph" subtitle="Aggregate handoff patterns between subagent roles.">
        <AgentCollaborationNetwork
          effectiveness={data.effectiveness}
          edges={data.cooccurrence}
        />
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Subagent Effectiveness" subtitle="Completion rate, duration, and recent activity by subagent type.">
          <SubagentEffectiveness data={data.effectiveness} />
        </Section>

        <Section title="Detected Workflow Patterns" subtitle="Common multi-step orchestration paths captured across sessions.">
          <WorkflowPatterns data={data.patterns} onPatternClick={() => {}} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Model Delegation Flow" subtitle="How session models fan out across main and subagent execution.">
          <ModelDelegationFlow data={data.modelDelegation} />
        </Section>

        <Section title="Error Propagation Map" subtitle="Where failures cluster across depth and role.">
          <ErrorPropagationMap data={data.errorPropagation} />
        </Section>
      </div>

      <Section title="Agent Concurrency Timeline" subtitle="Relative start and end windows by agent role.">
        <ConcurrencyTimeline data={data.concurrency} />
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Session Complexity Scatter" subtitle="Duration versus team size versus token footprint.">
          <SessionComplexityScatter data={data.complexity} onSessionClick={() => {}} />
        </Section>

        <Section title="Compaction Impact Analysis" subtitle="Compression volume and recovered token budget.">
          <CompactionImpact data={data.compaction} />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="card p-5">
      <div className="mb-5 flex items-center gap-2.5">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        <div className="relative">
          <button
            type="button"
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            className="flex items-center justify-center"
          >
            <Info className="h-3.5 w-3.5 text-gray-600 transition-colors hover:text-gray-400" />
          </button>
          {showTip && (
            <div className="tooltip-panel absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg px-3 py-2 text-[11px]">
              {subtitle}
              <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-[rgb(var(--tooltip-border))]" />
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
