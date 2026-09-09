import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { AlertCircle, CheckCircle2, Clock, CreditCard, Loader2, Plus, Search, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NewInvoiceDialog } from "@/components/invoices/NewInvoiceDialog"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { downloadBlob } from "@/lib/download"

type InvoiceStatus = "paid" | "pending" | "overdue"
type Filter = "all" | InvoiceStatus

type ApiInvoiceItem = { id: string; description: string; quantity: number; unit_price: number }
type ApiInvoice = {
  id: string
  sequence_number: number
  patient_id: string
  issue_date: string
  due_date: string | null
  amount_total: number
  status: InvoiceStatus
  payment_method: string | null
  pdf_url: string | null
  sent_at: string | null
  created_at: string
  invoice_items: ApiInvoiceItem[]
  patients: { full_name: string } | null
}

const STATUS_META: Record<InvoiceStatus, { icon: React.ElementType; color: string; bg: string; labelKey: "invoiceStatusPaid" | "invoiceStatusPending" | "invoiceStatusOverdue" }> = {
  paid: { icon: CheckCircle2, color: "#227a44", bg: "#e3f3e6", labelKey: "invoiceStatusPaid" },
  pending: { icon: Clock, color: "#c2882c", bg: "#fdf1de", labelKey: "invoiceStatusPending" },
  overdue: { icon: AlertCircle, color: "#b03a2e", bg: "#fbe7e5", labelKey: "invoiceStatusOverdue" },
}

const peso = (n: number) => `$${n.toLocaleString("en-US")} MXN`

function InvoiceDetailDialog({
  invoice,
  onOpenChange,
  onMarkPaid,
  markPaidPending,
}: {
  invoice: ApiInvoice | null
  onOpenChange: (v: boolean) => void
  onMarkPaid: (id: string) => void
  markPaidPending: boolean
}) {
  const { t } = useLang()
  const toast = useToast()
  const code = invoice ? `INV-${3000 + invoice.sequence_number}` : ""

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${invoice?.id}/send`),
    onSuccess: () => toast("Invoice sent to patient's WhatsApp"),
    onError: (err: unknown) => toast(err instanceof Error ? err.message : "Failed to send invoice"),
  })

  if (!invoice) return null
  const meta = STATUS_META[invoice.status]

  async function handleDownload() {
    if (!invoice) return
    try {
      const blob = await api.getBlob(`/invoices/${invoice.id}/pdf`)
      downloadBlob(`${code}.pdf`, blob)
    } catch {
      toast("Failed to download invoice")
    }
  }

  return (
    <Dialog.Root open={!!invoice} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="font-heading text-xl font-bold">
                {t.invDetailTitle} {code}
              </Dialog.Title>
              <span className="mt-1.5 flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                <meta.icon className="size-3" strokeWidth={2.4} />
                {t[meta.labelKey]}
              </span>
            </div>
            <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2.5 text-[12.5px]">
            <div className="rounded-[10px] bg-muted px-3 py-2.5">
              <div className="text-muted-foreground">{t.invDetailBillTo}</div>
              <div className="mt-0.5 font-bold">{invoice.patients?.full_name ?? "—"}</div>
            </div>
            <div className="rounded-[10px] bg-muted px-3 py-2.5">
              <div className="text-muted-foreground">{t.invoicesColDue}</div>
              <div className="mt-0.5 font-bold">{invoice.due_date ?? "—"}</div>
            </div>
          </div>

          <table className="mb-4 w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b">
                <th className="pb-1.5 text-left font-bold text-muted-foreground">{t.invDetailItem}</th>
                <th className="pb-1.5 text-center font-bold text-muted-foreground">{t.invDetailQty}</th>
                <th className="pb-1.5 text-right font-bold text-muted-foreground">{t.invDetailPrice}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2">{item.description}</td>
                  <td className="py-2 text-center">{item.quantity}</td>
                  <td className="py-2 text-right font-bold">{peso(item.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mb-4 flex items-center justify-between rounded-[10px] bg-accent px-3.5 py-3">
            <span className="text-[13px] font-bold text-accent-foreground">{t.invDetailTotal}</span>
            <span className="text-[19px] font-bold text-accent-foreground">{peso(invoice.amount_total)}</span>
          </div>

          <div className="text-[12.5px] text-muted-foreground">
            {t.invDetailMethod}: <span className="font-bold text-foreground">{invoice.payment_method ?? t.invDetailNotPaid}</span>
          </div>
          {invoice.sent_at ? (
            <div className="mt-1.5 text-[11px] text-muted-foreground">Sent to patient's WhatsApp on {new Date(invoice.sent_at).toLocaleString()}</div>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.invDetailClose}
              </Button>
            </Dialog.Close>
            {invoice.status !== "paid" ? (
              <Button onClick={() => onMarkPaid(invoice.id)} disabled={markPaidPending} className="rounded-lg font-bold">
                {t.invDetailMarkPaid}
              </Button>
            ) : null}
            <Button variant="outline" onClick={handleDownload} className="rounded-lg font-bold">
              {t.invDetailDownload}
            </Button>
            <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} className="gap-1.5 rounded-lg font-bold">
              {sendMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" strokeWidth={2} />}
              Send to patient
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Invoices() {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [viewing, setViewing] = useState<ApiInvoice | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api.get<{ rows: ApiInvoice[]; count: number }>("/invoices?limit=200"),
  })
  const invoices = data?.rows ?? []

  const filtered = useMemo(
    () =>
      invoices.filter((inv) => filter === "all" || inv.status === filter).filter((inv) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return `inv-${3000 + inv.sequence_number}`.includes(q) || (inv.patients?.full_name ?? "").toLowerCase().includes(q)
      }),
    [invoices, query, filter],
  )

  const stats = useMemo(() => {
    const revenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount_total, 0)
    const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amount_total, 0)
    const paidCount = invoices.filter((i) => i.status === "paid").length
    const overdueCount = invoices.filter((i) => i.status === "overdue").length
    return { revenue, outstanding, paidCount, overdueCount }
  }, [invoices])

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/invoices/${id}/paid`, { paymentMethod: "Cash" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      setViewing(null)
      toast("Invoice marked as paid")
    },
    onError: () => toast("Failed to mark invoice as paid"),
  })

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.invoicesPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.invoicesPageSub}</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="self-start gap-1.5 rounded-[10px] font-bold">
          <Plus className="size-3.5" strokeWidth={2.4} />
          {t.invoicesNewBtn}
        </Button>
      </div>

      <div className="mb-4.5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px] bg-accent">
            <CreditCard className="size-[19px] text-primary" strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.invoicesStatRevenue}</div>
          <div className="mt-0.5 text-[22px] font-bold">{peso(stats.revenue)}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#fdf1de" }}>
            <Clock className="size-[19px]" style={{ color: "#c2882c" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.invoicesStatOutstanding}</div>
          <div className="mt-0.5 text-[22px] font-bold text-[#c2882c]">{peso(stats.outstanding)}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e3f3e6" }}>
            <CheckCircle2 className="size-[19px]" style={{ color: "#227a44" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.invoicesStatPaidCount}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#227a44]">{stats.paidCount}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#fbe7e5" }}>
            <AlertCircle className="size-[19px]" style={{ color: "#b03a2e" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.invoicesStatOverdueCount}</div>
          <div className="mt-0.5 text-[26px] font-bold text-[#b03a2e]">{stats.overdueCount}</div>
        </Card>
      </div>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-90 min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.invoicesSearchPh}
              className="h-9 rounded-full border-border pl-10 text-[13px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border p-[3px]">
            {(
              [
                ["all", t.invoicesFilterAll],
                ["paid", t.invoicesFilterPaid],
                ["pending", t.invoicesFilterPending],
                ["overdue", t.invoicesFilterOverdue],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                  filter === key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs font-bold whitespace-nowrap text-muted-foreground">
            {filtered.length} {t.invoicesCount}
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading invoices…</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">Couldn't load invoices. Is the API reachable and are you signed in?</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-accent">
              <CreditCard className="size-6 text-primary" strokeWidth={1.6} />
            </div>
            <p className="text-sm text-muted-foreground">{t.invoicesEmpty}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {[t.invoicesColInvoice, t.invoicesColPatient, t.invoicesColDate, t.invoicesColDue, t.invoicesColAmount, t.invoicesColStatus].map((label, i) => (
                    <th key={i} className="px-2 pb-2.5 text-left text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase first:pl-0">
                      {label}
                    </th>
                  ))}
                  <th className="px-2 pb-2.5 pr-0 text-right text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">{t.invoicesColActions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const meta = STATUS_META[inv.status]
                  return (
                    <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                      <td className="py-3 pr-2 pl-0 text-[13.5px] font-bold whitespace-nowrap">INV-{3000 + inv.sequence_number}</td>
                      <td className="px-2 py-3 text-[13px]">{inv.patients?.full_name ?? "—"}</td>
                      <td className="px-2 py-3 text-[13px] whitespace-nowrap">{inv.issue_date}</td>
                      <td className="px-2 py-3 text-[13px] whitespace-nowrap">{inv.due_date ?? "—"}</td>
                      <td className="px-2 py-3 text-[13.5px] font-bold whitespace-nowrap">{peso(inv.amount_total)}</td>
                      <td className="px-2 py-3">
                        <span className="flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap" style={{ background: meta.bg, color: meta.color }}>
                          <meta.icon className="size-3" strokeWidth={2.4} />
                          {t[meta.labelKey]}
                        </span>
                      </td>
                      <td className="py-3 pr-0 pl-2 text-right whitespace-nowrap">
                        <Button variant="outline" size="sm" className="rounded-lg font-semibold" onClick={() => setViewing(inv)}>
                          {t.invoicesView}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewInvoiceDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["invoices"] })}
      />
      <InvoiceDetailDialog
        invoice={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        onMarkPaid={(id) => markPaidMutation.mutate(id)}
        markPaidPending={markPaidMutation.isPending}
      />
    </div>
  )
}
