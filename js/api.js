/* =====================================================================
   Conversa com o banco (Supabase) e utilidades de texto.
   Usado pelo index.html e pelo admin.html. Não precisa editar.

   Toda regra de segurança mora no banco (supabase/setup.sql). Aqui só
   se chamam as funções de lá: nada de localStorage, nada de lista de
   telefones no navegador.
   ===================================================================== */

(function () {
  "use strict";

  const cfg = window.KART_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(cfg.API_KEY || "").trim();

  const configurado =
    /^https?:\/\/[^\s/]+$/.test(url) && !/SEU-PROJETO/i.test(url) &&
    key.length > 20 && !/COLE_AQUI/i.test(key);

  // index.html?demo  ->  mostra o site com dados de mentira, sem gravar nada.
  const demo = !configurado && new URLSearchParams(location.search).has("demo");

  const MSG_REDE = "Sem resposta do servidor. Confira a internet e tente de novo.";

  // A chave nova do Supabase (sb_publishable_...) vai só no cabeçalho "apikey".
  // A chave antiga (anon, começa com "eyJ") vai também no "Authorization".
  // Se o servidor recusar um formato, tenta o outro antes de desistir.
  const soApikey = { "Content-Type": "application/json", "apikey": key };
  const comBearer = { "Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key };
  const formatos = key.startsWith("eyJ") ? [comBearer, soApikey] : [soApikey, comBearer];

  async function chamar(funcao, dados, cabecalhos) {
    const corte = new AbortController();
    const relogio = setTimeout(() => corte.abort(), 12000);
    try {
      return await fetch(url + "/rest/v1/rpc/" + funcao, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify(dados || {}),
        signal: corte.signal
      });
    } finally {
      clearTimeout(relogio);
    }
  }

  async function rpc(funcao, dados) {
    if (demo) return demoRpc(funcao, dados || {});
    if (!configurado) {
      return { ok: false, erro: "sem_config", mensagem: "O site ainda não foi ligado ao banco de dados." };
    }
    try {
      let r = await chamar(funcao, dados, formatos[0]);
      if (r.status === 401) r = await chamar(funcao, dados, formatos[1]);

      if (r.status === 401 || r.status === 403) {
        return { ok: false, erro: "chave", mensagem: "O Supabase recusou a chave. Confira a API_KEY em js/config.js." };
      }
      if (r.status === 404) {
        return { ok: false, erro: "sem_banco", mensagem: "O banco ainda não foi criado. Rode o arquivo supabase/setup.sql no Supabase." };
      }
      if (!r.ok) {
        return { ok: false, erro: "servidor", mensagem: "O servidor respondeu com erro " + r.status + ". Tente de novo em instantes." };
      }
      const corpo = await r.json();
      return corpo && typeof corpo === "object" ? corpo : { ok: false, erro: "servidor", mensagem: MSG_REDE };
    } catch (e) {
      return { ok: false, erro: "rede", mensagem: MSG_REDE };
    }
  }

  /* ------------------------------------------------------------------
     Modo demonstração: imita o banco dentro da página. Serve só para
     ver o site antes de configurar o Supabase. Nada é gravado.
     ------------------------------------------------------------------ */
  const mem = { votos: {} };

  function demoDias() {
    const feriados = { "2026-10-12": "Nossa Senhora Aparecida", "2026-11-02": "Finados",
                       "2026-11-15": "Proclamação da República", "2026-11-20": "Consciência Negra" };
    const kis = { 3: ["16:30", "17:30", "18:30", "19:30"], 4: ["16:30", "17:30", "18:30", "19:30"],
                  6: ["13:30", "14:30", "15:30", "16:30", "17:30"],
                  0: ["08:30", "09:30", "10:30", "11:30", "12:30", "13:30", "14:30"] };
    const fkiNoite = ["17:00", "18:00", "19:00", "20:00"];
    const fkiTarde = ["14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
    const dias = [];
    const hoje = fmt.iso(new Date());
    for (let d = new Date(2026, 9, 6); d <= new Date(2026, 10, 30); d.setDate(d.getDate() + 1)) {
      const iso = fmt.iso(d), sem = d.getDay(), fer = feriados[iso] || null;
      if (iso < hoje) continue;
      if (kis[sem]) dias.push({ pista: "kis", data: iso, feriado: fer, horarios: kis[sem] });
      if (fer || sem === 0 || sem === 6) dias.push({ pista: "fki", data: iso, feriado: fer, horarios: fkiTarde });
      else if (sem >= 2 && sem <= 5) dias.push({ pista: "fki", data: iso, feriado: null, horarios: fkiNoite });
    }
    return dias;
  }

  function demoRpc(funcao, d) {
    const tel = fmt.soNumeros(d.p_telefone);
    const jaVotou = { ok: false, erro: "ja_votou", mensagem: "Este piloto já registrou seu voto." };
    const resposta = (() => {
      switch (funcao) {
        case "kart_opcoes":
          return { ok: true, votacao_aberta: true, dias: demoDias() };
        case "kart_verificar":
          if (!tel) return { ok: false, erro: "telefone_invalido", mensagem: "Digite o WhatsApp com DDD: 11 números, como 27 99999-9999." };
          return mem.votos[tel] ? jaVotou : { ok: true, telefone: tel, nome: null };
        case "kart_votar":
          if (mem.votos[tel]) return jaVotou;
          mem.votos[tel] = { pista: d.p_pista, data: d.p_data, horario: d.p_horario };
          return { ok: true };
        case "kart_resultado": {
          if (!mem.votos[tel]) return { ok: false, erro: "nao_votou", mensagem: "O placar aparece depois que você votar." };
          const conta = {};
          const exemplo = [["kis", "2026-10-17", "14:30"], ["kis", "2026-10-17", "14:30"], ["fki", "2026-10-16", "19:00"],
                           ["kis", "2026-10-18", "09:30"], ["fki", "2026-10-17", "16:00"], ["fki", "2026-10-16", "19:00"]];
          Object.values(mem.votos).map(v => [v.pista, v.data, v.horario]).concat(exemplo)
            .forEach(v => { conta[v.join("|")] = (conta[v.join("|")] || 0) + 1; });
          const votos = Object.entries(conta).map(([k, n]) => {
            const [pista, data, horario] = k.split("|");
            return { pista, data, horario, votos: n };
          }).sort((a, b) => b.votos - a.votos);
          return { ok: true, votacao_aberta: true, lista: null,
                   total: votos.reduce((s, v) => s + v.votos, 0), votos };
        }
        default:
          return { ok: false, erro: "demo", mensagem: "Isto só funciona com o Supabase configurado." };
      }
    })();
    return new Promise(ok => setTimeout(() => ok(resposta), 350));
  }

  /* ------------------------------------------------------------------
     Formatação
     ------------------------------------------------------------------ */
  const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const SEM3 = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                 "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dois = n => String(n).padStart(2, "0");

  const fmt = {
    MESES, SEM3,
    // "2026-10-07" -> Date no fuso local (sem o deslize de fuso do new Date(iso))
    data(iso) { const [a, m, d] = String(iso).split("-").map(Number); return new Date(a, m - 1, d); },
    iso(d) { return d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate()); },
    // "sábado, 10 de outubro"
    dataLonga(iso) { const d = fmt.data(iso); return SEMANA[d.getDay()] + ", " + d.getDate() + " de " + MESES[d.getMonth()]; },
    // "sáb 10/10"
    dataCurta(iso) { const d = fmt.data(iso); return SEM3[d.getDay()] + " " + dois(d.getDate()) + "/" + dois(d.getMonth() + 1); },
    // "16:30" -> "16h30", "17:00" -> "17h"
    hora(h) { const [hh, mm] = String(h).split(":"); return Number(hh) + "h" + (mm === "00" ? "" : mm); },
    reais(v) { return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); },
    // devolve os 11 números do celular (DDD + 9 dígitos) ou ""
    soNumeros(t) {
      let n = String(t || "").replace(/\D/g, "");
      if (n.length === 13 && n.startsWith("55")) n = n.slice(2);
      if (n.length === 12 && n.startsWith("0")) n = n.slice(1);
      return /^[1-9]\d9\d{8}$/.test(n) ? n : "";
    },
    // "27999998888" -> "(27) 99999-8888"
    telefone(n) { n = String(n || ""); return n.length === 11 ? "(" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7) : n; },
    // máscara enquanto digita
    mascara(t) {
      let n = String(t || "").replace(/\D/g, "");
      if (n.length > 11 && n.startsWith("55")) n = n.slice(2);
      if (n.length > 11 && n.startsWith("0")) n = n.slice(1);
      n = n.slice(0, 11);
      if (n.length <= 2) return n.length ? "(" + n : "";
      if (n.length <= 7) return "(" + n.slice(0, 2) + ") " + n.slice(2);
      return "(" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7);
    },
    votos(n) { return n + (n === 1 ? " voto" : " votos"); },
    escapar(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  };

  window.KartApi = { rpc, configurado, demo };
  window.KartFmt = fmt;
})();
