/**
 * A repeatable add/remove list of plain text rows — used everywhere the
 * authoring workspace needs a bullet-style list (Key Concepts, Examples,
 * Self-Check, Requirements, Evaluation Criteria, Edge Cases, ...) without
 * ever asking the Content Team to type a comma-separated string or paste
 * anything JSON-shaped.
 */
export default function StringListEditor({
  items,
  onChange,
  placeholder = "Add an item",
  addLabel = "+ Add item",
  disabled = false,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  disabled?: boolean;
}) {
  function updateItem(i: number, value: string) {
    const next = [...items];
    next[i] = value;
    onChange(next);
  }

  function removeItem(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  function addItem() {
    onChange([...items, ""]);
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={`${placeholder} ${i + 1}`}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 disabled:bg-slate-50"
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            disabled={disabled}
            aria-label={`Remove item ${i + 1}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-navy-500/40 hover:bg-error/10 hover:text-error disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={addItem} className="self-start text-sm font-semibold text-brand-500 hover:text-brand-600">
          {addLabel}
        </button>
      )}
    </div>
  );
}
