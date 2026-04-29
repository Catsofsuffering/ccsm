import { Activity, ArrowRightLeft, CheckCircle, Clock, Layers, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorkflowStats } from "../../lib/types";

function formatDurationSec(sec: number): string {
  if (sec <= 0) return "0s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

function successRateColor(rate: number): string {
  if (rate > 90) return "text-accent";
  if (rate > 70) return "text-gray-300";
  return "text-gray-400";
}

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accentClass?: string;
}

function StatCard({ label, value, detail, icon: Icon, accentClass = "text-accent" }: StatCardProps) {
  return (
    <div className="glass-panel flex min-h-[104px] flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase leading-none tracking-wider text-gray-500">
          {label}
        </span>
        <Icon className={`h-4 w-4 flex-shrink-0 ${accentClass}`} />
      </div>
      <span className={`truncate text-2xl font-semibold leading-none ${accentClass}`}>{value}</span>
      <span className="text-[11px] leading-snug text-gray-500">{detail}</span>
    </div>
  );
}

export interface WorkflowStatsProps {
  stats: WorkflowStats;
}

export function WorkflowStats({ stats }: WorkflowStatsProps) {
  const topFlowLabel = stats.topFlow
    ? `${stats.topFlow.source} \u2192 ${stats.topFlow.target}`
    : "None";
  const srColor = successRateColor(stats.successRate);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Work Sessions"
        value={String(stats.totalSessions)}
        detail={`${stats.totalAgents} visible agents`}
        icon={Activity}
        accentClass="text-accent"
      />
      <StatCard
        label="Team Agents"
        value={String(stats.totalSubagents)}
        detail={`${stats.avgSubagents.toFixed(1)} per work session`}
        icon={Users}
        accentClass="text-gray-400"
      />
      <StatCard
        label="Healthy Runs"
        value={`${stats.successRate.toFixed(1)}%`}
        detail="completed vs errored agents"
        icon={CheckCircle}
        accentClass={srColor}
      />
      <StatCard
        label="Hot Tool Path"
        value={topFlowLabel}
        detail={stats.topFlow ? `${stats.topFlow.count} transitions` : "no tool transitions"}
        icon={ArrowRightLeft}
        accentClass="text-gray-400"
      />
      <StatCard
        label="Compaction Events"
        value={String(stats.totalCompactions)}
        detail={`${stats.avgCompactions.toFixed(1)} per work session`}
        icon={Layers}
        accentClass="text-gray-400"
      />
      <StatCard
        label="Typical Duration"
        value={formatDurationSec(stats.avgDurationSec)}
        detail={`agent depth ${stats.avgDepth.toFixed(1)}`}
        icon={Clock}
        accentClass="text-gray-400"
      />
    </div>
  );
}
