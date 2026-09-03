// ---- light / dark theme ----
const THEME_KEY = 'calendarioMaterias.theme';
function getPreferredTheme(){
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) { /* storage unavailable */ }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
}
function setTheme(theme){
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* storage unavailable */ }
}
applyTheme(getPreferredTheme());
document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
});

const events = JSON.parse(document.getElementById('events-data').textContent);
const discMeta = JSON.parse(document.getElementById('disc-meta').textContent);
const totalCourses = 5;
const loadedCourses = 5;
const activeDiscs = new Set(Object.keys(discMeta));

// "concluído" days — persisted to localStorage when available (falls back
// to in-memory only, e.g. inside a sandboxed preview).
const STORAGE_KEY = 'calendarioMaterias.doneDays';
let markedDays = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  markedDays = new Set(saved);
} catch (e) { markedDays = new Set(); }

function saveMarkedDays(){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...markedDays])); }
  catch (e) { /* storage unavailable — state stays in memory for this session */ }
}

// aulas em que faltei — marcadas uma a uma (não o dia inteiro, como o
// "concluído" acima). A chave identifica o evento sem precisar de um id
// próprio no JSON.
const MISSED_KEY = 'calendarioMaterias.missedClasses';
const eventKey = e => `${e.date}|${e.disc}|${e.type}|${e.title}`;
let missedClasses = new Set();
try {
  missedClasses = new Set(JSON.parse(localStorage.getItem(MISSED_KEY) || '[]'));
} catch (e) { missedClasses = new Set(); }

function saveMissedClasses(){
  try { localStorage.setItem(MISSED_KEY, JSON.stringify([...missedClasses])); }
  catch (e) { /* storage unavailable — state stays in memory for this session */ }
}
const isMissed = e => missedClasses.has(eventKey(e));

// ---- controle de frequência ----
// Regra: 75% de frequência mínima, sem abono. Logo o teto de faltas é 25%
// dos encontros — floor() porque faltar mais que isso já derruba abaixo
// de 75% (ex.: 36 encontros → 9 faltas = 75% exatos; a 10a reprova).
const MIN_FREQUENCIA = 0.75;

// Conta ENCONTROS (datas únicas), não eventos: quando a mesma matéria tem
// aula e avaliação no mesmo dia, isso é um encontro só. AED fica fora
// porque cada plano de ensino conta a frequência dela de um jeito próprio.
function frequenciaPorDisciplina(){
  return Object.entries(discMeta)
    .filter(([code]) => code !== 'FERIADO')
    .map(([code, meta]) => {
      const encontros = events.filter(e => e.disc === code && (e.type === 'aula' || e.type === 'avaliacao'));
      const datas = new Set(encontros.map(e => e.date));
      const datasComFalta = new Set(encontros.filter(isMissed).map(e => e.date));
      const total = datas.size;
      const teto = Math.floor(total * (1 - MIN_FREQUENCIA));
      const usadas = datasComFalta.size;
      return {
        code, meta, total, teto, usadas,
        // "ead" = frequência vem da entrega das atividades no ambiente
        // virtual; "presencial" = comparecer à aula. Vem do plano de ensino
        // de cada disciplina, não é inferido.
        ead: meta.modalidade === 'ead',
        restam: teto - usadas,
        presenca: total ? (total - usadas) / total : 1,
      };
    });
}

const byDate = {};
events.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });

// ---- progress dots ----
const progressEl = document.getElementById('progress');
let dotsHtml = '';
for (let i = 0; i < totalCourses; i++) {
  dotsHtml += `<span class="dot ${i < loadedCourses ? 'filled' : ''}"></span>`;
}
progressEl.innerHTML = dotsHtml + `<span class="progress-label">${loadedCourses} de ${totalCourses} matérias carregadas</span>`;

// ---- painel de frequência ----
const freqEl = document.getElementById('freq');

function linhaFrequencia(f){
  let estado = 'ok';
  if (f.restam < 0) estado = 'reprovado';
  else if (f.restam === 0) estado = 'limite';
  else if (f.restam <= 2) estado = 'atencao';

  const unidade = f.ead ? 'não entregues' : 'usadas';
  const aviso = {
    reprovado: `passou do limite em ${Math.abs(f.restam)}`,
    limite: 'no limite — a próxima reprova',
    atencao: `${f.usadas} de ${f.teto} ${unidade} · atenção`,
    ok: `${f.usadas} de ${f.teto} ${unidade}`,
  }[estado];

  const rotulo = f.ead
    ? (f.restam === 1 ? 'entrega de folga' : 'entregas de folga')
    : (f.restam === 1 ? 'falta restante' : 'faltas restantes');

  // a barra mostra o quanto do teto já foi consumido
  const consumido = f.teto ? Math.min(100, (f.usadas / f.teto) * 100) : 0;

  return `<div class="freq-row ${estado}">
    <span class="freq-dot" style="background:${f.meta.color}"></span>
    <div class="freq-main">
      <div class="freq-name">${f.meta.name}</div>
      <div class="freq-bar"><span style="width:${consumido}%;background:${f.meta.color}"></span></div>
    </div>
    <div class="freq-nums">
      <div class="freq-big">${Math.max(0, f.restam)}<span>${rotulo}</span></div>
      <div class="freq-sub">${aviso}</div>
    </div>
  </div>`;
}

function renderFrequencia(){
  const todas = frequenciaPorDisciplina();
  const presencial = todas.filter(f => !f.ead);
  const ead = todas.filter(f => f.ead);

  const grupo = (classe, titulo, legenda, lista) => lista.length ? `<div class="freq-group ${classe}">
      <div class="freq-group-head">
        <span class="freq-group-title">${titulo}</span>
        <span class="freq-group-sub">${legenda}</span>
      </div>
      ${lista.map(linhaFrequencia).join('')}
    </div>` : '';

  freqEl.innerHTML = `<div class="freq-head">
      <span class="freq-title">Controle de faltas</span>
      <span class="freq-rule">mínimo de 75% · sem abono</span>
    </div>
    ${grupo('g-presencial', 'Presencial', 'presença = comparecer à aula', presencial)}
    ${grupo('g-ead', 'EAD', 'presença = entregar a atividade no Moodle/AVA', ead)}
    <p class="freq-note">O teto é 25% dos encontros de cada matéria no calendário (aula e dia de prova). Marque no painel do dia. Nas matérias EAD os planos não listam as tarefas uma a uma — a unidade contada é o módulo/semana do cronograma.</p>`;
}

// ---- legend ----
const legendEl = document.getElementById('legend');
let legendHtml = '';
Object.entries(discMeta).forEach(([code, meta]) => {
  legendHtml += `<label data-disc="${code}">
    <input type="checkbox" checked data-disc="${code}">
    <span class="swatch" style="background:${meta.color}"></span>
    <span>${meta.name}</span>
  </label>`;
});
legendHtml += `<span class="exam-key"><span class="mini-ring"></span> Dia de prova (cor da matéria)</span>`;
legendHtml += `<span class="aed-key">⚑ AED</span>`;
legendEl.innerHTML = legendHtml;

legendEl.querySelectorAll('label').forEach(label => {
  label.addEventListener('click', (ev) => {
    ev.preventDefault();
    const code = label.dataset.disc;
    const input = label.querySelector('input');
    const nowChecked = !input.checked;
    input.checked = nowChecked;
    label.classList.toggle('off', !nowChecked);
    if (nowChecked) activeDiscs.add(code); else activeDiscs.delete(code);
    renderCalendar();
  });
});

// ---- calendar rendering ----
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const weekdaysFull = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const months = [{y:2026,m:7},{y:2026,m:8},{y:2026,m:9},{y:2026,m:10},{y:2026,m:11}];
const calEl = document.getElementById('calendar');
const todayStr = new Date().toISOString().slice(0,10);

// Builds a conic-gradient split into N equal color portions — one per
// exam that day, colored by that exam's discipline. This is what gives
// the day-cell border its "pie slice" striped look.
function examBorderGradient(colors){
  const n = colors.length;
  if (n === 1) return `conic-gradient(${colors[0]}, ${colors[0]})`;
  const stops = [];
  colors.forEach((c, i) => {
    const start = (i / n * 100).toFixed(3);
    const end = ((i + 1) / n * 100).toFixed(3);
    stops.push(`${c} ${start}%`, `${c} ${end}%`);
  });
  return `conic-gradient(${stops.join(', ')})`;
}

// Same idea as examBorderGradient, but as a left-to-right stripe —
// used to fill the exam chip inside the day cell (and never gets
// truncated away like a regular event chip would).
function examStripeGradient(colors){
  if (colors.length === 1) return colors[0];
  const n = colors.length;
  const stops = [];
  colors.forEach((c, i) => {
    const start = (i / n * 100).toFixed(3);
    const end = ((i + 1) / n * 100).toFixed(3);
    stops.push(`${c} ${start}%`, `${c} ${end}%`);
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function renderCalendar(){
  calEl.innerHTML = '';
  months.forEach(({y, m}) => {
    const first = new Date(y, m, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const monthDiv = document.createElement('div');
    monthDiv.className = 'month';
    monthDiv.innerHTML = `<h2>${monthNames[m]} de ${y}</h2>`;

    const grid = document.createElement('div');
    grid.className = 'grid';

    // abreviação de 3 letras em toda largura: medi que "Dom" ocupa ~28px
    // numa coluna de 39px até em telas de 320px. A inicial sozinha
    // ("D S T Q Q S S") era ambígua — dois S e dois Q.
    weekdaysFull.forEach((wd, i) => {
      const wdEl = document.createElement('div');
      wdEl.className = 'wd' + (i === 0 || i === 6 ? ' wd-fim' : '');
      wdEl.textContent = wd;
      grid.appendChild(wdEl);
    });

    for (let i = 0; i < startDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'day empty';
      grid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dow = new Date(y, m, d).getDay();
      const allDayEvents = byDate[dateStr] || [];
      const dayEvents = allDayEvents.filter(e => activeDiscs.has(e.disc));
      const examColors = dayEvents
        .filter(e => e.type === 'avaliacao')
        .map(e => (discMeta[e.disc] || {color:'#8A8578'}).color);
      const hasExam = examColors.length > 0;

      const dayEl = document.createElement('div');
      dayEl.className = 'day'
        + ((dow === 0 || dow === 6) ? ' weekend' : '')
        + (dateStr === todayStr ? ' today' : '')
        + (hasExam ? ' has-exam' : '')
        + (dayEvents.length ? ' has-events' : '')
        + (markedDays.has(dateStr) ? ' done' : '');

      if (hasExam) {
        dayEl.style.setProperty('--exam-grad', examBorderGradient(examColors));
      }

      let html = `<div class="num">${d}</div>`;

      if (dayEvents.length) {
        const examEvents = dayEvents.filter(e => e.type === 'avaliacao');
        const otherEvents = dayEvents.filter(e => e.type !== 'avaliacao');

        // desktop text chips: the exam chip (if any) always shows first,
        // in full — never hidden behind "+N" — since it's the most
        // important thing on the day. Remaining slots go to other events.
        // 3 slots porque o dia mais cheio do semestre tem 3 aulas.
        const MAX_CHIPS = 3;
        const examSlot = examEvents.length ? 1 : 0;
        const otherSlots = Math.max(0, MAX_CHIPS - examSlot);

        html += '<div class="evts-desktop">';

        if (examEvents.length) {
          const label = examEvents.length > 1
            ? `★ ${examEvents.length} provas neste dia`
            : `★ ${examEvents[0].title}`;
          // o chip agregado só conta como falta se faltei em todas as provas do dia
          const examMissed = examEvents.every(isMissed) ? ' missed' : '';
          html += `<div class="evt evt-exam${examMissed}" style="background:${examStripeGradient(examColors)}">${label}</div>`;
        }

        otherEvents.slice(0, otherSlots).forEach(e => {
          const meta = discMeta[e.disc] || {color:'#666', name:e.disc};
          const icon = e.type === 'aed' ? '⚑ ' : '';
          const isFer = e.disc === 'FERIADO';
          const cls = [isFer ? 'evt-fer' : '', isMissed(e) ? 'missed' : ''].filter(Boolean).join(' ');
          html += `<div class="evt${cls ? ' ' + cls : ''}" style="background:${meta.color}">${icon}${e.title}</div>`;
        });

        const hiddenOthers = Math.max(0, otherEvents.length - otherSlots);
        if (hiddenOthers > 0) {
          html += `<div class="more-chip">+${hiddenOthers}</div>`;
        }
        html += '</div>';

        // mobile dots
        html += '<div class="evts-mobile">';
        dayEvents.slice(0, 5).forEach(e => {
          const meta = discMeta[e.disc] || {color:'#666'};
          const isExam = e.type === 'avaliacao';
          const cls = [isExam ? 'pdot-exam' : '', isMissed(e) ? 'missed' : ''].filter(Boolean).join(' ');
          html += `<span class="pdot${cls ? ' ' + cls : ''}" style="background:${meta.color}"></span>`;
        });
        if (dayEvents.length > 5) html += `<span class="pmore">+${dayEvents.length - 5}</span>`;
        html += '</div>';
      }

      dayEl.innerHTML = html;
      if (dayEvents.length) {
        dayEl.addEventListener('click', () => openSheet(dateStr, dayEvents));
      }
      grid.appendChild(dayEl);
    }

    monthDiv.appendChild(grid);
    calEl.appendChild(monthDiv);
  });
}

// ---- detail sheet ----
const overlay = document.getElementById('overlay');
const sheetTitle = document.getElementById('sheetTitle');
const sheetBody = document.getElementById('sheetBody');

function openSheet(dateStr, dayEvents){
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  sheetTitle.textContent = `${weekdaysFull[dt.getDay()]}, ${d} de ${monthNames[m-1]}`.toLowerCase()
    .replace(/^./, c => c.toUpperCase());

  const isDone = markedDays.has(dateStr);
  let html = `<label class="done-toggle${isDone ? ' checked' : ''}" id="doneToggle">
    <input type="checkbox" id="doneCheck" ${isDone ? 'checked' : ''}>
    <span>Marcar este dia como concluído</span>
  </label>`;

  html += dayEvents.map(e => {
    const meta = discMeta[e.disc] || {name:e.disc, color:'#8A8578'};
    const isExam = e.type === 'avaliacao';
    const tagText = isExam ? '★ AVALIAÇÃO / PROVA' : (e.type === 'aed' ? '⚑ AED' : 'AULA');
    const borderStyle = `style="border-left-color:${meta.color}"`;
    const tagStyle = isExam ? `style="color:${meta.color}"` : '';
    const descHtml = e.desc ? `<div class="evt-desc">${e.desc}</div>` : '';
    const missed = isMissed(e);
    // em EAD a "falta" é não ter entregado a atividade, não a ausência
    const rotulo = meta.modalidade === 'ead' ? 'Não entreguei' : 'Faltei';
    // feriado não tem falta para marcar
    const missBtn = e.type === 'feriado' ? '' : `<button type="button" class="miss-btn${missed ? ' on' : ''}"
        data-key="${encodeURIComponent(eventKey(e))}" data-label="${rotulo}"
        aria-pressed="${missed}">${missed ? '✓ ' + rotulo : rotulo}</button>`;
    return `<div class="event-card${isExam ? ' exam' : ''}${missed ? ' missed' : ''}" ${borderStyle}>
      <div>
        <div class="disc-name">${meta.name}</div>
        <div class="evt-title">${e.title}</div>
        ${descHtml}
        <div class="tag" ${tagStyle}>${tagText}</div>
      </div>
      ${missBtn}
    </div>`;
  }).join('');

  sheetBody.innerHTML = html;

  const doneCheck = document.getElementById('doneCheck');
  const doneToggle = document.getElementById('doneToggle');
  doneCheck.addEventListener('change', () => {
    if (doneCheck.checked) markedDays.add(dateStr);
    else markedDays.delete(dateStr);
    doneToggle.classList.toggle('checked', doneCheck.checked);
    saveMarkedDays();
    renderCalendar();
  });

  sheetBody.querySelectorAll('.miss-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = decodeURIComponent(btn.dataset.key);
      const nowMissed = !missedClasses.has(key);
      if (nowMissed) missedClasses.add(key); else missedClasses.delete(key);
      btn.classList.toggle('on', nowMissed);
      btn.setAttribute('aria-pressed', String(nowMissed));
      const rotulo = btn.dataset.label || 'Faltei';
      btn.textContent = nowMissed ? `✓ ${rotulo}` : rotulo;
      btn.closest('.event-card').classList.toggle('missed', nowMissed);
      saveMissedClasses();
      renderCalendar();
      renderFrequencia();
    });
  });

  overlay.classList.add('open');
}
function closeSheet(){ overlay.classList.remove('open'); }
document.getElementById('sheetClose').addEventListener('click', closeSheet);
overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closeSheet(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });

renderCalendar();
renderFrequencia();
