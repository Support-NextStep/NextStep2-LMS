export default function Divider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-medium uppercase tracking-wide text-navy-500/40">{label}</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
