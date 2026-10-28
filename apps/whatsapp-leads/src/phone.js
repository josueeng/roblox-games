/**
 * Normaliza um telefone para o formato usado pelo WhatsApp: só dígitos, com DDI.
 * "(11) 98765-4321" -> "5511987654321"
 */
export function normalizePhone(input, defaultCountryCode = '55') {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (!digits) return '';
  digits = digits.replace(/^00/, '');
  // Número nacional brasileiro com zero de tronco: 011987654321
  if (defaultCountryCode === '55' && digits.length === 12 && digits.startsWith('0')) digits = digits.slice(1);
  if (defaultCountryCode === '55' && (digits.length === 10 || digits.length === 11)) digits = '55' + digits;
  if (digits.length < 10 || digits.length > 15) return '';
  return digits;
}

/**
 * Chave de comparação. O WhatsApp às vezes informa celulares brasileiros sem o nono dígito
 * (55 11 8765-4321 em vez de 55 11 98765-4321), então os dois formatos precisam casar.
 */
export function phoneKey(phone) {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') return d.slice(0, 4) + d.slice(5);
  return d;
}

export function formatPhone(phone) {
  const d = String(phone ?? '');
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : '';
}
