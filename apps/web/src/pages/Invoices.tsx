import { useMemo, useState } from "react"
import { Dialog } from "radix-ui"
import { AlertCircle, CheckCircle2, Clock, CreditCard, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { INVOICES, PATIENTS, type Invoice, type InvoiceStatus } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import { downloadTextFile } from "@/lib/download"

type Filter = "all" | InvoiceStatus

const STATUS_META: Record<InvoiceStatus, { icon: React.ElementType; color: string; bg: string; labelKey: "invoiceStatusPaid" | "invoiceStatusPending" | "invoiceStatusOverdue" }> = {
  paid: { icon: CheckCircle2, color: "#227a44", bg: "#e3f3e6", labelKey: "invoiceStatusPaid" },
  pending: { icon: Clock, color: "#c2882c", bg: "#fdf1de", labelKey: "invoiceStatusPending" },
  overdue: { icon: AlertCircle, color: "#b03a2e", bg: "#fbe7e5", labelKey: "invoiceStatusOverdue" },
}

const peso = (n: number) => `$${n.toLocaleString("en-US")} MXN`

function InvoiceDetailDialog({
  invoice,
  patientName,
  onOpenChange,
  onMarkPaid,
}: {
  invoice: Invoice | null
  patientName: string
  onOpenChange: (v: boolean) => void
  onMarkPaid: (id: string) => void
}) {
  const { t } = useLang()
  const toast = useToast()
  if (!invoice) return null
  const meta = STATUS_META[invoice.status]

  function handleDownload() {
    if (!invoice) return
    const lines = [
      `Invoice ${invoice.id}`,
      `Bill to: ${patientName}`,
      `Date: ${invoice.date}  Due: ${invoice.dueDate}`,
      "",
      ...invoice.items.map((it) => `${it.desc} x${it.qty} — ${peso(it.price)}`),
      "",
      `Total: ${peso(invoice.amount)}`,
      `Method: ${invoice.method ?? "Not paid"}`,
    ]
    downloadTextFile(`${invoice.id}.txt`, lines.join("\n"))
    toast("Invoice downloaded")
  }

  return (
    <Dialog.Root open={!!invoice} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="font-heading text-xl font-bold">
                {t.invDetailTitle} {invoice.id}
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
              <div className="mt-0.5 font-bold">{patientName}</div>
            </div>
            <div className="rounded-[10px] bg-muted px-3 py-2.5">
              <div className="text-muted-foreground">{t.invoicesColDue}</div>
              <div className="mt-0.5 font-bold">{invoice.dueDate}</div>
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
              {invoice.items.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2">{item.desc}</td>
                  <td className="py-2 text-center">{item.qty}</td>
                  <td className="py-2 text-right font-bold">{peso(item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mb-4 flex items-center justify-between rounded-[10px] bg-accent px-3.5 py-3">
            <span className="text-[13px] font-bold text-accent-foreground">{t.invDetailTotal}</span>
            <span className="font-heading text-[19px] font-bold text-accent-foreground">{peso(invoice.amount)}</span>
          </div>

          <div className="text-[12.5px] text-muted-foreground">
            {t.invDetailMethod}: <span className="font-bold text-foreground">{invoice.method ?? t.invDetailNotPaid}</span>
          </div>

          <div className="mt-6 flex justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-lg font-bold">
                {t.invDetailClose}
              </Button>
            </Dialog.Close>
            {invoice.status !== "paid" ? (
              <Button
                onClick={() => {
                  onMarkPaid(invoice.id)
                  onOpenChange(false)
                }}
                className="rounded-lg font-bold"
              >
                {t.invDetailMarkPaid}
              </Button>
            ) : (
              <Button onClick={handleDownload} className="rounded-lg font-bold">
                {t.invDetailDownload}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Invoices() {
  const { t } = useLang()
  const toast = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>(INVOICES)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [viewing, setViewing] = useState<Invoice | null>(null)

  const patientById = useMemo(() => new Map(PATIENTS.map((p) => [p.id, p])), [])

  const filtered = useMemo(
    () =>
      invoices.filter((inv) => filter === "all" || inv.status === filter).filter((inv) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        const patient = patientById.get(inv.patientId)
        return inv.id.toLowerCase().includes(q) || patient?.name.toLowerCase().includes(q)
      }),
    [invoices, query, filter, patientById],
  )

  const stats = useMemo(() => {
    const revenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0)
    const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amount, 0)
    const paidCount = invoices.filter((i) => i.status === "paid").length
    const overdueCount = invoices.filter((i) => i.status === "overdue").length
    return { revenue, outstanding, paidCount, overdueCount }
  }, [invoices])

  function markPaid(id: string) {
    setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, status: "paid", method: "Cash" } : inv)))
    toast("Invoice marked as paid")
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t.invoicesPageTitle}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.invoicesPageSub}</p>
        </div>
        <Button
          onClick={() => {
            const patient = PATIENTS[Math.floor(Math.random() * PATIENTS.length)]
            const id = `INV-${3000 + invoices.length + 30}`
            setInvoices((prev) => [
              { id, patientId: patient.id, date: new Date().toLocaleDateString(), dueDate: new Date().toLocaleDateString(), amount: 0, status: "pending", method: null, items: [] },
              ...prev,
            ])
            toast(`Draft invoice ${id} created for ${patient.name}`)
          }}
          className="gap-1.5 rounded-[10px] font-bold"
        >
          <Plus className="size-3.5" strokeWidth={2.4} />
          {t.invoicesNewBtn}
        </Button>
      </div>

      <div className="mb-4.5 grid grid-cols-4 gap-4">
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px] bg-accent">
            <CreditCard className="size-[19px] text-primary" strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.invoicesStatRevenue}</div>
          <div className="font-heading mt-0.5 text-[22px] font-bold">{peso(stats.revenue)}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#fdf1de" }}>
            <Clock className="size-[19px]" style={{ color: "#c2882c" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.invoicesStatOutstanding}</div>
          <div className="font-heading mt-0.5 text-[22px] font-bold text-[#c2882c]">{peso(stats.outstanding)}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#e3f3e6" }}>
            <CheckCircle2 className="size-[19px]" style={{ color: "#227a44" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.invoicesStatPaidCount}</div>
          <div className="font-heading mt-0.5 text-[26px] font-bold text-[#227a44]">{stats.paidCount}</div>
        </Card>
        <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
          <div className="mb-3 flex size-9.5 items-center justify-center rounded-[10px]" style={{ background: "#fbe7e5" }}>
            <AlertCircle className="size-[19px]" style={{ color: "#b03a2e" }} strokeWidth={1.8} />
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground">{t.invoicesStatOverdueCount}</div>
          <div className="font-heading mt-0.5 text-[26px] font-bold text-[#b03a2e]">{stats.overdueCount}</div>
        </Card>
      </div>

      <Card className="gap-0 rounded-2xl border p-4.5 shadow-none">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative max-w-90 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.invoicesSearchPh}
              className="h-9 rounded-full border-border pl-10 text-[13px]"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border p-[3px]">
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

        {filtered.length === 0 ? (
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
                  const patient = patientById.get(inv.patientId)
                  const meta = STATUS_META[inv.status]
                  return (
                    <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                      <td className="py-3 pr-2 pl-0 text-[13.5px] font-bold whitespace-nowrap">{inv.id}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-7.5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: patient?.color }}>
                            {patient?.initials}
                          </div>
                          <span className="text-[13px]">{patient?.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[13px] whitespace-nowrap">{inv.date}</td>
                      <td className="px-2 py-3 text-[13px] whitespace-nowrap">{inv.dueDate}</td>
                      <td className="px-2 py-3 text-[13.5px] font-bold whitespace-nowrap">{peso(inv.amount)}</td>
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

      <InvoiceDetailDialog
        invoice={viewing}
        patientName={viewing ? (patientById.get(viewing.patientId)?.name ?? "") : ""}
        onOpenChange={(open) => !open && setViewing(null)}
        onMarkPaid={markPaid}
      />
    </div>
  )
}
