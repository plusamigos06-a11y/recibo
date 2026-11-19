// Lectura de fecha y lote a partir del texto de una foto (OCR) o de voz.
(function (root) {
  const MESES = {
    ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8,
    SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
    JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9,
    OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
    ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEPT: 9, SEP: 9, SET: 9,
    OCT: 10, NOV: 11, DIC: 12, JAN: 1, APR: 4, AUG: 8, DEC: 12
  };
  const MON = Object.keys(MESES).sort((a, b) => b.length - a.length).join('|');

  const KW_VENC = /(EXPIR\w*|EXP|VENCE|VENC\w*|VTO|VCTO|BEST\s*BEFORE|BBE|BB|USE\s*BY|BEST\s*BY|SELL\s*BY|BEST\s*IF\s*USED\s*BY|EXP\s*DATE|ANTES\s*DE|CADUCIDAD|CAD|CONSUM\w*|EXPIRES?\s*ON|VALID\w*)\W*$/;
  const KW_PROD = /(PRODUCCION|PRODUCCIÓN|PRODUCIDO|PROD|MFG|MFD|MANUFACTURA\w*|FABRICACION|FABRICACIÓN|FAB|ELABORACION|ELABORACIÓN|ELABORADO|ELAB|PACKED|PKG|PKD|ENVASADO)\W*$/;

  const pad = n => String(n).padStart(2, '0');
  function year4(y) { y = parseInt(y, 10); return y < 100 ? 2000 + y : y; }

  function validDate(d, m, y) {
    if (m < 1 || m > 12) return false;
    if (y < 2015 || y > 2045) return false;
    if (d !== null) {
      if (d < 1 || d > 31) return false;
      const dim = new Date(y, m, 0).getDate();
      if (d > dim) return false;
    }
    return true;
  }

  // Para dos números tipo 03/05: si uno pasa de 12 se sabe cuál es el día; si no, manda la preferencia (mdy = formato americano).
  function orden(a, b, mdy) {
    if (a > 12) return { d: a, m: b };
    if (b > 12) return { d: b, m: a };
    return mdy ? { m: a, d: b } : { d: a, m: b };
  }

  function findDates(text, mdy) {
    const found = [];
    const add = (re, build, needsKw) => {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        const r = build(m);
        if (!r) continue;
        found.push({ start: m.index, end: m.index + m[0].length, needsKw: !!needsKw, ...r });
      }
    };
    // 2026-03-15
    add(/\b(20\d{2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\b/g, m => ({ y: +m[1], m: +m[2], d: +m[3] }));
    // 15/03/2027  15-03-27  15.03.27
    add(/\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})\b/g, m => ({ ...orden(+m[1], +m[2], mdy), y: year4(m[3]) }));
    // 15 MAR 2027  15MAR27  15 DE MARZO DE 2027
    add(new RegExp('\\b(\\d{1,2})\\s*[\\/\\-. ]?\\s*(?:DE\\s+)?(' + MON + ')\\.?\\s*[\\/\\-. ,]?\\s*(?:DE\\s+|DEL\\s+)?(\\d{4}|\\d{2})\\b', 'g'),
      m => ({ d: +m[1], m: MESES[m[2]], y: year4(m[3]) }));
    // MAR 15 2027  MARCH 15TH, 2027
    add(new RegExp('\\b(' + MON + ')\\.?\\s*[\\/\\-. ]?\\s*(\\d{1,2})\\s*(?:ST|ND|RD|TH)?\\s*[\\/\\-. ,]\\s*(\\d{4})\\b', 'g'),
      m => ({ d: +m[2], m: MESES[m[1]], y: +m[3] }));
    // 15 03 2027 / 1503 2027 (separador perdido; solo con palabra clave)
    add(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{4}|\d{2})\b/g, m => ({ ...orden(+m[1], +m[2], mdy), y: year4(m[3]) }), true);
    add(/\b(\d{2})(\d{2})\s+(\d{4}|\d{2})\b/g, m => ({ ...orden(+m[1], +m[2], mdy), y: year4(m[3]) }), true);
    // MAR 2027  MAR/27
    add(new RegExp('\\b(' + MON + ')\\.?\\s*[\\/\\-. ,]?\\s*(?:DE\\s+|DEL\\s+)?(\\d{4}|\\d{2})\\b', 'g'),
      m => ({ d: null, m: MESES[m[1]], y: year4(m[2]) }));
    // 26.03 27  /  26 03.27 (OCR suele perder un separador; solo con palabra clave)
    add(/\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s+(\d{4}|\d{2})\b/g, m => ({ ...orden(+m[1], +m[2], mdy), y: year4(m[3]) }), true);
    add(/\b(\d{1,2})\s+(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})\b/g, m => ({ ...orden(+m[1], +m[2], mdy), y: year4(m[3]) }), true);
    // 03/2027
    add(/\b(\d{1,2})\s*[\/\-.]\s*(20\d{2})\b/g, m => ({ d: null, m: +m[1], y: +m[2] }));
    // 03/27 (solo con palabra clave)
    add(/\b(\d{1,2})\s*[\/\-.]\s*(\d{2})\b/g, m => ({ d: null, m: +m[1], y: year4(m[2]) }), true);
    // 150327 / 15032027 (solo con palabra clave)
    add(/\b(\d{2})(\d{2})(\d{4}|\d{2})\b/g, m => ({ ...orden(+m[1], +m[2], mdy), y: year4(m[3]) }), true);

    // validar
    const ok = found.filter(f => validDate(f.d, f.m, f.y));
    // quitar los que están dentro de otro más grande
    const keep = ok.filter(a => !ok.some(b => b !== a && b.start <= a.start && b.end >= a.end && (b.end - b.start) > (a.end - a.start)));
    // quitar duplicados exactos de posición
    const seen = new Set();
    const uniq = [];
    keep.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    for (const k of keep) { const key = k.start + ':' + k.end; if (!seen.has(key)) { seen.add(key); uniq.push(k); } }
    // solapados parciales: conservar el primero
    const out = [];
    for (const u of uniq) { if (!out.length || u.start >= out[out.length - 1].end) out.push(u); }
    return out;
  }

  const MES3 = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  function fmt(d) {
    return d.d === null ? MES3[d.m - 1] + '/' + d.y : pad(d.d) + '/' + MES3[d.m - 1] + '/' + d.y;
  }
  const key = d => d.y * 10000 + d.m * 100 + (d.d || 1);

  function parseLabel(raw, opts) {
    const mdy = !!(opts && opts.mdy);
    let text = String(raw || '').toUpperCase().replace(/[‘’´`]/g, "'").replace(/[,;]/g, ' ');
    // corrige letras que el OCR confunde con números cuando están pegadas a dígitos
    let textNum = text.replace(/(?<=\d)[OQD](?=\d)/g, '0').replace(/(?<=\d)[IL|](?=\d)/g, '1');
    // tokens tipo fecha con O/Q en lugar de 0 (15/O3/2O27) y dígitos sueltos separados (1 5 MAR)
    textNum = textNum.replace(/\b[0-9OQ]{1,4}(?:\s*[\/\-. ]\s*[0-9OQ]{1,4}){1,2}\b/g, t => /\d/.test(t) ? t.replace(/[OQ]/g, '0') : t)
      .replace(/\b(\d) (\d) (?=[A-Z]{3})/g, '$1$2 ');
    const notas = [];

    // ---- lote ----
    let lote = null;
    const reLote = [
      /\b(?:LOTE|LOT|LT|BATCH)\b\s*(?:N[º°O.]?\s*)?[:.\-#]?\s*([A-Z0-9][A-Z0-9\-\/]{2,19})/,
      /\bL\s*[:.]\s*([A-Z0-9][A-Z0-9\-\/]{2,19})/,
      /\bL\s*[:.\-]?\s*([A-Z]?\d{3,}[A-Z0-9\-\/]{0,15})/
    ];
    const mProdNr = text.match(/\bPROD\.?\s*(?:NR|NO|N[º°])\.?\s*[:.]?\s*(\d{5,})/);
    if (mProdNr) lote = mProdNr[1];
    for (const re of reLote) {
      if (lote) break;
      const m = text.match(re);
      if (m && /\d/.test(m[1])) { lote = m[1]; break; }
    }

    // ---- fechas ----
    const dates = findDates(textNum, mdy);
    let venc = null, prod = null;
    const sinEtiqueta = [];
    for (const d of dates) {
      const antes = textNum.slice(Math.max(0, d.start - 32), d.start);
      const kv = antes.match(KW_VENC);
      const kp = antes.match(KW_PROD);
      let tipo = null;
      if (kv && kp) tipo = (antes.lastIndexOf(kv[1]) > antes.lastIndexOf(kp[1])) ? 'v' : 'p';
      else if (kv) tipo = 'v';
      else if (kp) tipo = 'p';
      if (d.needsKw && !tipo) continue;
      if (tipo === 'v' && !venc) venc = d;
      else if (tipo === 'p' && !prod) prod = d;
      else if (!tipo) sinEtiqueta.push(d);
    }
    let revisar = false;
    if (!venc && sinEtiqueta.length) {
      const orden = sinEtiqueta.slice().sort((a, b) => key(a) - key(b));
      if (prod) {
        const mayor = orden.find(d => key(d) > key(prod));
        if (mayor) venc = mayor; else { venc = orden[orden.length - 1]; revisar = true; }
      } else if (orden.length >= 2) {
        prod = orden[0]; venc = orden[orden.length - 1];
        notas.push('Fechas sin etiqueta: se tomó la menor como producción y la mayor como vencimiento.');
        revisar = true;
      } else {
        venc = orden[0];
        notas.push('Una sola fecha sin etiqueta: se tomó como vencimiento.');
        revisar = true;
      }
    }
    if (venc && prod && key(venc) < key(prod)) { revisar = true; notas.push('El vencimiento sale anterior a la producción.'); }

    // Código GS1 impreso debajo del código de barras: (17)/(15) vencimiento, (11) producción, (10) lote. Es lo más confiable.
    const gsDate = re => {
      const m = text.match(re); if (!m) return null;
      const yy = +m[1].slice(0, 2), mm = +m[1].slice(2, 4), dd = +m[1].slice(4, 6), y = 2000 + yy;
      if (!validDate(dd || null, mm, y)) return null;
      return { d: dd || null, m: mm, y };
    };
    const gsV = gsDate(/\(17\)\s*(\d{6})/) || gsDate(/\(15\)\s*(\d{6})/);
    const gsP = gsDate(/\(11\)\s*(\d{6})/);
    const gsL = text.match(/\(10\)\s*([A-Z0-9\-\/]{1,20})/);
    if (gsV) { venc = gsV; revisar = false; notas.length = 0; }
    if (gsP) prod = gsP;
    if (gsL) lote = gsL[1];

    const vencTxt = venc ? fmt(venc) : prod ? 'PROD: ' + fmt(prod) : 'N/A';
    const loteTxt = lote || 'N/A';
    if (!venc && !prod && !lote) { revisar = true; notas.push('No se detectó fecha ni lote.'); }
    return { lote: loteTxt, venc: vencTxt, revisar, notas, hayVenc: !!venc, hayProd: !!prod };
  }

  // Fecha dictada o escrita -> DD/MM/AAAA (o MM/AAAA). Devuelve null si no se entiende.
  function parseFechaSuelta(s, mdy) {
    const t = String(s || '').toUpperCase().replace(/[,;]/g, ' ');
    // Solo números, con o sin espacios: 150327, 15032027, 20270315, 0327, "15 03 27", "03 2027"
    const raw = t.trim();
    if (/^\d[\d ]*$/.test(raw)) {
      const g = raw.split(/\s+/);
      let r = null;
      if (g.length === 3 && g[0].length <= 2 && g[1].length <= 2 && (g[2].length === 2 || g[2].length === 4)) {
        r = { ...orden(+g[0], +g[1], !!mdy), y: year4(g[2]) };
      } else if (g.length === 2 && g[0].length <= 2 && g[1].length === 4) {
        r = { d: null, m: +g[0], y: +g[1] };
      } else if (g.length === 1) {
        const c = g[0];
        if (c.length === 6) r = { ...orden(+c.slice(0, 2), +c.slice(2, 4), !!mdy), y: year4(c.slice(4)) };
        else if (c.length === 8) {
          const y0 = +c.slice(0, 4);
          if (y0 >= 2015 && y0 <= 2045 && validDate(+c.slice(6), +c.slice(4, 6), y0)) r = { d: +c.slice(6), m: +c.slice(4, 6), y: y0 };
          else r = { ...orden(+c.slice(0, 2), +c.slice(2, 4), !!mdy), y: +c.slice(4) };
        } else if (c.length === 4) r = { d: null, m: +c.slice(0, 2), y: year4(c.slice(2)) };
      }
      return r && validDate(r.d === undefined ? null : r.d, r.m, r.y) ? fmt(r) : null;
    }
    const d = findDates(t.replace(/(?<=\d)[OQD](?=\d)/g, '0'), !!mdy);
    const list = d.filter(x => !x.needsKw);
    if (list.length) return fmt(list[0]);
    return null;
  }

  // Deja cualquier fecha escrita (con o sin "PROD:") en formato 15/MAR/2027
  function normalizeFecha(s, mdy) {
    const t = String(s || '').trim().toUpperCase();
    if (!t || t === 'N/A') return t || 'N/A';
    const m = t.match(/^(PROD\w*:?\s*)(.*)$/);
    const pref = m ? 'PROD: ' : '';
    const f = parseFechaSuelta(m ? m[2] : t, mdy);
    return f ? pref + f : t;
  }


  // Convierte las filas de una hoja de inventario (arreglo de arreglos) en [código, descripción, unidad, tipo].
  // tipo: 'A' = lleva fecha y lote (alimentos), 'S' = suministro (sin fecha). modo: 'A', 'S' o 'auto'.
  function parseInventoryRows(rows, modo) {
    const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
    let h = -1;
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const cells = rows[i].map(norm);
      if ((cells.includes('ARTICULO') || cells.includes('CODIGO')) && (cells.includes('DESCRIPCION') || cells.includes('NOMBRE'))) { h = i; break; }
    }
    if (h < 0) return { items: [], error: 'No encontré las columnas "Artículo" y "Descripción".' };
    const head = rows[h].map(norm);
    const cCode = head.findIndex(x => x === 'ARTICULO' || x === 'CODIGO');
    const cDesc = head.findIndex(x => x === 'DESCRIPCION' || x === 'NOMBRE');
    let cUom = head.findIndex(x => x.startsWith('UOM PRINCIPAL'));
    if (cUom < 0) cUom = head.findIndex(x => x === 'UNIDAD' || x.startsWith('UOM'));
    const cCats = head.map((x, i) => x.startsWith('CATALOGO') ? i : -1).filter(i => i >= 0);
    const items = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i];
      const code = String(r[cCode] == null ? '' : r[cCode]).trim();
      const desc = String(r[cDesc] == null ? '' : r[cDesc]).replace(/\s+/g, ' ').trim();
      if (!code || !desc) continue;
      const uom = cUom >= 0 ? String(r[cUom] == null ? '' : r[cUom]).trim().toUpperCase() || 'UNIDAD' : 'UNIDAD';
      let tipo = modo === 'S' ? 'S' : 'A';
      if (modo === 'auto') tipo = cCats.some(c => /ALIMENT|BEBIDA|LACTE|CARNIC|EMBUTIDO|PERECED/.test(norm(r[c]))) ? 'A' : (cCats.length ? 'S' : 'A');
      items.push([code, desc, uom, tipo]);
    }
    return { items, error: items.length ? null : 'La hoja no tiene productos.' };
  }

  const api = { parseInventoryRows, parseLabel, parseFechaSuelta, normalizeFecha, fmtFecha: fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RecParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
