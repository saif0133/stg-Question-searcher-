import { useMemo, useState } from "react";
import { Badge, Button, Card } from "./ui";
import type { Customer } from "../types";

export function CustomerSelect({
  customers,
  selectedIds,
  onChange,
  disabled,
}: {
  customers: Customer[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, query]);

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(customers.map((c) => c.id)));
  }

  function clear() {
    onChange(new Set());
  }

  return (
    <Card
      title="Customers"
      subtitle="Choose which customers to search inside."
      actions={
        <Badge tone="accent">
          {selectedIds.size} of {customers.length} selected
        </Badge>
      }
    >
      <div className="stack">
        <div className="row-between">
          <input
            className="field__input search-input"
            type="search"
            placeholder="Search customers by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            aria-label="Search customers by name"
          />
          <div className="row-gap">
            <Button variant="ghost" onClick={selectAll} disabled={disabled}>
              Select all
            </Button>
            <Button variant="ghost" onClick={clear} disabled={disabled}>
              Clear
            </Button>
          </div>
        </div>

        <div className="customer-list" role="listbox" aria-multiselectable>
          {filtered.length === 0 && (
            <div className="empty-mini">No customers match “{query}”.</div>
          )}

          {filtered.map((customer) => {
            const checked = selectedIds.has(customer.id);
            return (
              <label
                key={customer.id}
                className={`customer-row ${checked ? "is-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(customer.id)}
                  disabled={disabled}
                />
                <span className="customer-row__name">{customer.name}</span>
                <span className="customer-row__id">{customer.id}</span>
              </label>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
