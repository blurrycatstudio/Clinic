import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { usePatientSearch } from "@/hooks/usePatientSearch"
import { useToast } from "@/lib/toast"

type LineItem = { description: string; quantity: number; unitPrice: number }
const emptyItem = (): LineItem => ({ description: "", quantity: 1, unitPrice: 0 })

export function NewInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [patientId, setPatientId] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [items, setItems] = useState<LineItem[]>([emptyItem()])

  const patients = usePatientSearch("")

  function reset() {
    setPatientId("")
    setDueDate("")
    setItems([emptyItem()])
  }

  function updateItem(i: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  function removeItem(i: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))
  }

  const total = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
  const canSave = patientId !== "" && items.every((it) => it.description.trim() && it.quantity > 0 && it.unitPrice >= 0)

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/invoices", {
        patientId,
        dueDate: dueDate || undefined,
        items: items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      onCreated()
      reset()
      onOpenChange(false)
      toast("Invoice created")
    },
    onError: () => toast("Failed to create invoice"),
  })

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="font-heading text-xl font-bold">New Invoice</Dialog.Title>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold">Patient</label>
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Select a patient…</option>
                  {(patients.data?.rows ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} · {p.phone_e164}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold">Due date</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold">Line items</label>
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, emptyItem()])}
                  className="flex items-center gap-1 text-xs font-bold text-primary"
                >
                  <Plus className="size-3.5" strokeWidth={2.4} />
                  Add item
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(i, { description: e.target.value })}
                      placeholder="Description"
                      className="h-9 flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                      placeholder="Qty"
                      className="h-9 w-16"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                      placeholder="Price"
                      className="h-9 w-24"
                    />
                    {items.length > 1 ? (
                      <button type="button" onClick={() => removeItem(i)} className="text-destructive">
                        <Trash2 className="size-4" strokeWidth={2} />
                      </button>
                    ) : (
                      <span className="size-4" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[10px] bg-accent px-3.5 py-3">
              <span className="text-[13px] font-bold text-accent-foreground">Total</span>
              <span className="text-[17px] font-bold text-accent-foreground">${total.toLocaleString("en-US")} MXN</span>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                Cancel
              </Button>
            </Dialog.Close>
            <Button onClick={() => createMutation.mutate()} disabled={!canSave || createMutation.isPending} className="rounded-lg font-bold">
              Save
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
