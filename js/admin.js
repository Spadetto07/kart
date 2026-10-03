/* =====================================================================
   VOTAÇÃO DO KART — área do organizador
   A senha vai junto em toda chamada e é conferida no banco. Ela fica
   só na memória desta aba: fechou a aba, tem que digitar de novo.
   ===================================================================== */

(function () {
  "use strict";

  const { rpc, configurado } = window.KartApi;
  const F = window.KartFmt;
  const cfg = window.KART_CONFIG;
  const $ = s => document.querySelector(s);

  let senha = "";
  const nomePista = id => (cfg.pistas.find(p => p.id === id) || { nome: id, nomeCurto: id });

  function aviso(el, texto, ok) {
    el.className = "aviso" + (ok ? " ok" : "");
    el.textContent = texto;
    el.hidden = false;
  }

  async function chamar(acao, dados) {
    const r = await rpc("kart_admin", { p_senha: senha, p_acao: acao || "painel", p_dados: dados || {} });
    if (r.ok) desenhar(r);
    return r;
  }

  /* ---------------- Entrada ---------------- */
  $("#entrada").addEventListener("submit", async ev => {
    ev.preventDefault();
    const caixa = $("#entrada-aviso"), botao = $("#btn-entrar");
    caixa.hidden = true;
    if (!configurado) {
      aviso(caixa, "O site ainda não foi ligado ao banco. Cole a URL e a chave do Supabase em js/config.js.");
      return;
    }
    senha = $("#senha").value;
    if (!senha) { aviso(caixa, "Digite a senha."); return; }

    botao.disabled = true; botao.textContent = "Conferindo…";
    const r = await chamar("painel");
    botao.disabled = false; botao.textContent = "Entrar";

    if (!r.ok) { senha = ""; aviso(caixa, r.mensagem || "Não deu para entrar."); return; }
    $("#senha").value = "";
    $("#entrada").hidden = true;
    $("#painel").hidden = false;
  });

  /* ---------------- Painel ---------------- */
  function desenhar(r) {
    const pilotos = r.pilotos || [];
    const votaram = pilotos.filter(p => p.voto_realizado);

    $("#n-votos").textContent = votaram.length;
    $("#n-pilotos").textContent = pilotos.length;
    $("#n-pilotos-rotulo").textContent = r.config.lista_fechada ? "pilotos na lista" : "pilotos cadastrados";
    $("#n-faltam").textContent = pilotos.length - votaram.length;

    $("#ch-aberta").checked = r.config.votacao_aberta;
    $("#ch-fechada").checked = r.config.lista_fechada;

    // Resultado por pista
    const total = votaram.length;
    const porPista = {};
    cfg.pistas.forEach(p => { porPista[p.id] = 0; });
    votaram.forEach(p => { porPista[p.pista] = (porPista[p.pista] || 0) + 1; });
    const maior = Math.max.apply(null, Object.values(porPista));
    $("#res-pistas").innerHTML = cfg.pistas.map(p => {
      const n = porPista[p.id], pct = total ? Math.round(n * 100 / total) : 0;
      return '<div class="barra-pista' + (n < maior ? " atras" : "") + '">' +
        '<div class="linha"><span class="nome">' + F.escapar(p.nome) + '</span><span class="conta">' + F.votos(n) + ", " + pct + "%</span></div>" +
        '<div class="barra-trilho"><div class="barra-cheia" style="width:' + pct + '%"></div></div></div>';
    }).join("");

    // Combinações mais votadas
    const conta = {};
    votaram.forEach(p => { const k = [p.pista, p.data, p.horario].join("|"); conta[k] = (conta[k] || 0) + 1; });
    const combos = Object.entries(conta).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    $("#res-combos").innerHTML = combos.length
      ? combos.map(([k, n]) => {
          const [pista, data, horario] = k.split("|");
          return '<li><span class="quando">' + F.escapar(nomePista(pista).nomeCurto) + ", " + F.dataCurta(data) + ", " + F.hora(horario) +
                 '</span><span class="n">' + F.votos(n) + "</span></li>";
        }).join("")
      : '<li><span class="apoio">Ninguém votou ainda.</span></li>';

    // Tabela de pilotos
    $("#pilotos-vazio").hidden = pilotos.length > 0;
    $("#pilotos").innerHTML = pilotos.map(p => {
      const voto = p.voto_realizado
        ? F.escapar(nomePista(p.pista).nomeCurto) + ", " + F.dataCurta(p.data) + ", " + F.hora(p.horario)
        : "Ainda não votou";
      return '<tr class="' + (p.voto_realizado ? "" : "sem-voto") + '">' +
        "<td>" + (p.nome ? F.escapar(p.nome) : '<span class="apoio">sem nome</span>') + "</td>" +
        '<td class="whitespace-nowrap">' + F.telefone(p.telefone) + "</td>" +
        "<td>" + voto + "</td>" +
        '<td class="whitespace-nowrap text-right">' +
          (p.voto_realizado ? '<button type="button" class="link mr-4" data-acao="anular_voto" data-tel="' + p.telefone + '">Anular voto</button>' : "") +
          '<button type="button" class="link" data-acao="remover_piloto" data-tel="' + p.telefone + '">Remover</button>' +
        "</td></tr>";
    }).join("");
  }

  async function executar(acao, dados, mensagemOk) {
    const caixa = $("#painel-aviso");
    const r = await chamar(acao, dados);
    if (r.ok) {
      aviso(caixa, typeof mensagemOk === "function" ? mensagemOk(r) : mensagemOk, true);
    } else {
      aviso(caixa, r.mensagem || "Não deu para concluir.");
      if (r.erro === "senha_errada" || r.erro === "bloqueado") { $("#painel").hidden = true; $("#entrada").hidden = false; }
    }
    caixa.scrollIntoView({ block: "nearest" });
    return r;
  }

  $("#btn-recarregar").addEventListener("click", () => executar("painel", {}, "Painel atualizado."));

  $("#ch-aberta").addEventListener("change", e =>
    executar("config", { votacao_aberta: e.target.checked }, e.target.checked ? "Votação aberta." : "Votação encerrada."));

  $("#ch-fechada").addEventListener("change", e =>
    executar("config", { lista_fechada: e.target.checked },
      e.target.checked ? "Lista fechada: só vota quem está na lista de pilotos." : "Lista aberta: qualquer WhatsApp vota uma vez."));

  $("#btn-adicionar").addEventListener("click", async () => {
    const campo = $("#lista");
    if (!campo.value.trim()) { aviso($("#painel-aviso"), "Cole ou digite pelo menos um piloto."); return; }
    const r = await executar("adicionar_pilotos", { lista: campo.value }, x =>
      x.gravados + (x.gravados === 1 ? " piloto gravado" : " pilotos gravados") +
      (x.ignorados ? ". " + x.ignorados + (x.ignorados === 1 ? " linha ficou" : " linhas ficaram") + " de fora por não ter um celular válido." : "."));
    if (r.ok && !r.ignorados) campo.value = "";
  });

  /* ---------------- Anular voto / remover piloto ---------------- */
  let pendente = null;
  $("#pilotos").addEventListener("click", e => {
    const b = e.target.closest("button[data-acao]");
    if (!b) return;
    const anular = b.dataset.acao === "anular_voto";
    pendente = { acao: b.dataset.acao, tel: b.dataset.tel };
    $("#confirma-titulo").textContent = anular ? "Anular este voto?" : "Remover este piloto?";
    $("#confirma-texto").textContent = anular
      ? "O voto de " + F.telefone(b.dataset.tel) + " é apagado e o número pode votar de novo."
      : F.telefone(b.dataset.tel) + " sai da lista e o voto dele, se houver, é apagado.";
    $("#btn-sim").textContent = anular ? "Anular voto" : "Remover piloto";
    $("#confirma").showModal();
  });
  $("#btn-nao").addEventListener("click", () => $("#confirma").close());
  $("#btn-sim").addEventListener("click", async () => {
    $("#confirma").close();
    if (!pendente) return;
    const { acao, tel } = pendente;
    pendente = null;
    await executar(acao, { telefone: tel }, acao === "anular_voto" ? "Voto anulado." : "Piloto removido.");
  });
})();
