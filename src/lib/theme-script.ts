export const THEME_STORAGE_KEY = "pulse-theme";

// Roda no <head> antes da primeira pintura, para a página já abrir no tema
// escolhido. Conteúdo fixo, sem nenhum dado de usuário.
export const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
