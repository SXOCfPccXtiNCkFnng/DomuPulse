// Validação de CPF e CNPJ pelos dígitos verificadores.

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isCpf(d: string) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[len])) return false;
  }
  return true;
}

export function isCnpj(d: string) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const len of [12, 13]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i + 13 - len];
    const rest = sum % 11;
    const check = rest < 2 ? 0 : 11 - rest;
    if (check !== Number(d[len])) return false;
  }
  return true;
}

export function isCpfOrCnpj(value: string) {
  const d = onlyDigits(value);
  return isCpf(d) || isCnpj(d);
}
