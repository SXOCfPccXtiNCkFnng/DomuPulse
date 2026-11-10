export const THEME_STORAGE_KEY = "pulse-theme";
export const ACCENT_STORAGE_KEY = "pulse-accent";

// Roda no <head> antes da primeira pintura, para a página já abrir no tema e
// na cor escolhidos. Conteúdo fixo; a cor salva só é aplicada se for um
// hexadecimal válido (#rrggbb).
//  - pulse-theme: "dark", "system" (segue o aparelho) ou ausente (claro).
//  - pulse-accent: cor principal escolhida; ausente = azul do Pulse.
export const THEME_BOOT_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))d.dataset.theme="dark";var a=localStorage.getItem("${ACCENT_STORAGE_KEY}");if(a&&/^#[0-9a-f]{6}$/i.test(a)){var n=parseInt(a.slice(1),16),l=(0.299*(n>>16)+0.587*(n>>8&255)+0.114*(n&255))/255;d.style.setProperty("--accent",a);d.style.setProperty("--accent-ink",l>0.62?"#0b0d12":"#ffffff");d.dataset.accent=""}}catch(e){}`;
