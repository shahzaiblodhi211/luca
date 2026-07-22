"use client";

type Action = { name: string; description?: string };

export function ActionChips({
  actions,
  onAction,
}: {
  actions: Action[];
  onAction?: (name: string) => void;
}) {
  if (!actions.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.name}
          type="button"
          title={action.description}
          onClick={() => onAction?.(action.name)}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          {action.name}
        </button>
      ))}
    </div>
  );
}
