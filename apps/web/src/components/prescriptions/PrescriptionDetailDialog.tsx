import { useMutation } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { Leaf, Loader2, Printer, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { downloadBlob } from "@/lib/download"
import { useToast } from "@/lib/toast"
import type { ApiPrescription } from "@/pages/Prescriptions"

export function PrescriptionDetailDialog({
  rx,
  onOpenChange,
}: {
  rx: ApiPrescription | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const code = rx ? `RX-${1000 + rx.sequence_number}` : ""

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/prescriptions/${rx?.id}/send`),
    onSuccess: () => toast("Prescription sent to patient's WhatsApp"),
    onError: (err: unknown) => toast(err instanceof Error ? err.message : "Failed to send prescription"),
  })

  async function handleDownload() {
    if (!rx) return
    try {
      const blob = await api.getBlob(`/prescriptions/${rx.id}/pdf`)
      downloadBlob(`${code}.pdf`, blob)
    } catch {
      toast("Failed to download prescription")
    }
  }

  return (
    <Dialog.Root open={!!rx} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm print:hidden" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-0 shadow-2xl print:static print:max-h-none print:w-full print:max-w-none print:translate-x-0 print:translate-y-0 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-6 print:hidden">
            <Dialog.Title className="font-heading text-lg font-bold">
              {t.rxDetailRx} · {code}
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 rounded-lg font-bold" onClick={handleDownload}>
                <Printer className="size-3.5" strokeWidth={2} />
                {t.rxPrint}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 rounded-lg font-bold"
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
              >
                {sendMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" strokeWidth={2} />}
                Send to patient
              </Button>
              <Dialog.Close className="flex size-8 items-center justify-center rounded-[9px] border border-border hover:bg-muted">
                <X className="size-4" strokeWidth={2} />
              </Dialog.Close>
            </div>
          </div>

          {rx ? (
            <div className="p-5 sm:p-7 print:p-0">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-10 items-center justify-center rounded-[10px] border border-border bg-accent">
                    <Leaf className="size-5 text-primary" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="font-heading text-[17px] font-bold">{t.rxDetailClinic}</div>
                  </div>
                </div>
                <div className="font-heading text-3xl font-bold text-primary">℞</div>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-3 text-[13px] sm:gap-3">
                <div>
                  <div className="text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase">{t.rxDetailPatientLabel}</div>
                  <div className="font-bold">{rx.patients?.full_name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase">{t.rxDetailDateLabel}</div>
                  <div className="font-bold">{new Date(rx.created_at).toLocaleDateString()}</div>
                </div>
              </div>

              <div className="mb-5">
                <div className="text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase">{t.rxDetailDiagnosisLabel}</div>
                <div className="mt-0.5 text-[13.5px] font-semibold">{rx.diagnosis}</div>
              </div>

              <div className="mb-5 flex flex-col gap-3">
                {rx.prescription_items.map((med, i) => (
                  <div key={med.id} className="rounded-xl border border-border p-3.5">
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <span className="font-heading text-sm font-bold text-primary">{i + 1}.</span>
                      <span className="text-[13.5px] font-bold">{med.name}</span>
                    </div>
                    <div className="pl-5 text-[12.5px] text-foreground">
                      {med.dose} · {med.frequency} · {med.duration} · {med.route}
                    </div>
                  </div>
                ))}
              </div>

              {rx.notes ? (
                <div className="mb-8 rounded-xl border border-border bg-muted px-3.5 py-3 text-[12.5px] leading-relaxed">
                  {rx.notes}
                </div>
              ) : null}

              {rx.sent_at ? (
                <div className="text-[11px] text-muted-foreground">
                  Sent to patient's WhatsApp on {new Date(rx.sent_at).toLocaleString()}
                </div>
              ) : null}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
