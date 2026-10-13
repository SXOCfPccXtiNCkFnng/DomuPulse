export const THEME_STORAGE_KEY = "pulse-theme";

// Roda no <head> antes da primeira pintura, para a página já abrir no tema
// escolhido. Conteúdo fixo, sem nenhum dado de usuário.
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
