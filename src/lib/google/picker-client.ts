"use client";
// Carrega o Google Picker e devolve a planilha escolhida. O Picker é JS do
// próprio Google; por isso o acesso solto a window.gapi/window.google aqui.
/* eslint-disable @typescript-eslint/no-explicit-any */

let pickerReady: Promise<void> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar o Google Picker."));
    document.head.appendChild(s);
  });
}

async function ensurePicker() {
  if (!pickerReady) {
    pickerReady = (async () => {
      await loadScript("https://apis.google.com/js/api.js");
      await new Promise<void>((resolve) => (window as any).gapi.load("picker", () => resolve()));
    })();
  }
  return pickerReady;
}

export type PickedSheet = { id: string; name: string; url: string };

/** Abre o seletor de planilhas do Google e resolve com a escolhida (ou null se cancelar). */
export async function pickSpreadsheet(token: string, apiKey: string, appId: string): Promise<PickedSheet | null> {
  await ensurePicker();
  const g = (window as any).google;
  return new Promise<PickedSheet | null>((resolve) => {
    const view = new g.picker.DocsView(g.picker.ViewId.SPREADSHEETS)
      .setMimeTypes("application/vnd.google-apps.spreadsheet")
      .setSelectFolderEnabled(false);
    const picker = new g.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setCallback((data: any) => {
        const action = data[g.picker.Response.ACTION];
        if (action === g.picker.Action.PICKED) {
          const doc = data[g.picker.Response.DOCUMENTS][0];
          resolve({ id: doc[g.picker.Document.ID], name: doc[g.picker.Document.NAME], url: doc[g.picker.Document.URL] });
        } else if (action === g.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
