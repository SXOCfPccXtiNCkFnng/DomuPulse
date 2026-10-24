"use client";

import { RotateCcw } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/validation";
import { saveAutomation, saveChecklist } from "./actions";

type Values = { botEnabled: boolean; greeting: string; instructions: string; closing: string };
type Defaults = { greeting: string; closing: string };

const textareaClass =
  "w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none";

const VARS_HINT = (
  <>
    Use <code className="rounded bg-surface-2 px-1">{"{nome}"}</code> para o primeiro nome do candidato e{" "}
    <code className="rounded bg-surface-2 px-1">{"{empresa}"}</code> para o nome da empresa.
  </>
);

/** Campo de mensagem que já vem com o texto padrão e pode voltar a ele. */
function MessageField({
  name,
  label,
  hint,
  initial,
  fallback,
  rows,
  error,
}: {
  name: string;
  label: string;
  hint: React.ReactNode;
  initial: string;
  fallback: string;
  rows: number;
  error?: string;
}) {
  const [value, setValue] = useState(initial || fallback);
  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label} hint={hint} error={error}>
        <textarea name={name} value={value} onChange={(e) => setValue(e.target.value)} rows={rows} maxLength={1000} className={textareaClass} />
      </Field>
      {value.trim() !== fallback ? (
        <button type="button" onClick={() => setValue(fallback)} className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
          <RotateCcw className="size-3.5" />
          Voltar ao texto padrão
        </button>
      ) : null}
    </div>
  );
}

export function AutomationForm({ initial, defaults }: { initial: Values; defaults: Defaults }) {
  const [state, action, pending] = useActionState(saveAutomation, {} as FormState);

  return (
    <form action={action} className="flex flex-col gap-5 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <label className="flex items-start gap-3">
        <input type="checkbox" name="botEnabled" defaultChecked={initial.botEnabled} className="mt-1 size-4 accent-[var(--brand)]" />
        <span>
          <span className="block text-sm font-medium">Atendimento automático ligado</span>
          <span className="block text-[13px] text-muted">Recebe os candidatos no WhatsApp, coleta o currículo e pontua sozinho. Desligue para atender tudo na mão.</span>
        </span>
      </label>

      <MessageField
        name="greeting"
        label="Mensagem de boas-vindas"
        hint={<>Base da primeira mensagem a quem chama. O atendimento conversa naturalmente, entende se a pessoa quer se candidatar ou tirar uma dúvida, e o que ele não souber responder vai para a equipe. {VARS_HINT}</>}
        initial={initial.greeting}
        fallback={defaults.greeting}
        rows={3}
        error={state.fieldErrors?.greeting}
      />

      <Field label="Instruções para o atendimento" hint="Opcional. Contexto da empresa, informações que o atendimento pode passar (horário, local, benefícios) e o que valorizar na avaliação. O que não estiver aqui, ele não inventa: passa para a equipe." error={state.fieldErrors?.instructions}>
        <textarea
          name="instructions"
          defaultValue={initial.instructions}
          rows={4}
          maxLength={2000}
          placeholder="Ex.: somos uma empresa de tecnologia; valorizamos experiência com atendimento; seja cordial e objetiva."
          className={textareaClass}
        />
      </Field>

      <MessageField
        name="closing"
        label="Mensagem de encerramento"
        hint={<>O que o atendimento responde ao receber o currículo. {VARS_HINT}</>}
        initial={initial.closing}
        fallback={defaults.closing}
        rows={2}
        error={state.fieldErrors?.closing}
      />

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar configuração"}
      </Button>
    </form>
  );
}

export function ChecklistForm({ items, usingDefault }: { items: string[]; usingDefault: boolean }) {
  const [state, action, pending] = useActionState(saveChecklist, {} as FormState);

  return (
    <form action={action} className="flex flex-col gap-5 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field
        label="Documentos"
        hint={
          usingDefault
            ? "Um documento por linha. Esta é a lista padrão: ajuste e salve para usar a sua."
            : "Um documento por linha. Na hora de enviar dá para desmarcar o que não precisar."
        }
        error={state.fieldErrors?.items}
      >
        <textarea name="items" defaultValue={items.join("\n")} rows={Math.min(Math.max(items.length + 1, 6), 14)} className={textareaClass} />
      </Field>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar checklist"}
      </Button>
    </form>
  );
}
