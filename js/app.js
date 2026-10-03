/* =====================================================================
   VOTAÇÃO DO KART — tela de votação
   Fluxo: portão (nome + WhatsApp) -> pista -> dia -> horário -> voto.
   O navegador só mostra e pergunta; quem decide é o banco.
   ===================================================================== */

(function () {
  "use strict";

  const { rpc, configurado, demo } = window.KartApi;
  const F = window.KartFmt;
  const cfg = window.KART_CONFIG;
  const $ = (s, raiz) => (raiz || document).querySelector(s);
  const $$ = (s, raiz) => Array.from((raiz || document).querySelectorAll(s));

  const estado = {
    telefone: "",      // já validado pelo banco
    nome: "",
    pista: null,       // "kis" | "fki"
    data: null,        // "2026-10-17"
    horario: null,     // "14:30"
    dias: {}           // dias[pista][data] = { feriado, horarios[] }
  };

  const pistaPorId = id => cfg.pistas.find(p => p.id === id);
  const SETA_ESQ = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 4 6.5 10l6 6"/></svg>';
  const SETA_DIR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 4l6 6-6 6"/></svg>';
  const MARCA = '<svg class="marca" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>';

  /* ------------------------------------------------------------------
     Início
     ------------------------------------------------------------------ */
  function iniciar() {
    $("#evento").textContent = cfg.evento;
    document.title = "Votação: " + cfg.evento;

    if (demo) {
      avisoTopo("Modo demonstração: os votos daqui não são gravados.");
    } else if (!configurado) {
      $("#portao").hidden = true;
      $("#sem-config").hidden = false;
    }

    montarPistas();

    $("#telefone").addEventListener("input", e => { e.target.value = F.mascara(e.target.value); });
    $("#portao").addEventListener("submit", liberar);
    $("#btn-trocar").addEventListener("click", () => location.reload());
    $("#btn-votar").addEventListener("click", abrirConfirmacao);
    $("#btn-voltar").addEventListener("click", () => $("#confirma").close());
    $("#btn-gravar").addEventListener("click", gravarVoto);
    $("#btn-atualizar").addEventListener("click", () => mostrarPlacar(estado.telefone, false));
    $("#btn-zap").href = "https://wa.me/?text=" + encodeURIComponent(
      "Votação do kart: escolhe a pista, o dia e o horário aqui: " + location.origin + location.pathname);

    iniciarFotoAmpliada();
  }

  function avisoTopo(texto) {
    const f = $("#faixa-aviso");
    f.textContent = texto;
    f.hidden = false;
  }

  function aviso(el, texto, botao) {
    el.className = "aviso";
    el.innerHTML = "";
    el.append(document.createTextNode(texto));
    if (botao) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link";
      b.style.marginLeft = ".5rem";
      b.textContent = botao.texto;
      b.addEventListener("click", botao.acao);
      el.append(b);
    }
    el.hidden = false;
  }

  function ocupado(botao, texto) {
    if (texto) {
      botao.dataset.texto = botao.textContent;
      botao.textContent = texto;
      botao.disabled = true;
    } else {
      botao.textContent = botao.dataset.texto || botao.textContent;
      botao.disabled = false;
    }
  }

  /* ------------------------------------------------------------------
     Portão: confere o telefone no banco
     ------------------------------------------------------------------ */
  async function liberar(ev) {
    ev.preventDefault();
    const campoNome = $("#nome"), campoTel = $("#telefone"), caixa = $("#portao-aviso");
    const nome = campoNome.value.replace(/\s+/g, " ").trim();
    const tel = F.soNumeros(campoTel.value);

    caixa.hidden = true;
    campoNome.removeAttribute("aria-invalid");
    campoTel.removeAttribute("aria-invalid");

    if (nome.length < 2) {
      campoNome.setAttribute("aria-invalid", "true");
      aviso(caixa, "Escreva seu nome para o organizador saber quem votou.");
      campoNome.focus();
      return;
    }
    if (!tel) {
      campoTel.setAttribute("aria-invalid", "true");
      aviso(caixa, "Digite o WhatsApp com DDD: 11 números, como 27 99999-9999.");
      campoTel.focus();
      return;
    }

    const botao = $("#btn-liberar");
    ocupado(botao, "Conferindo…");
    const [v, o] = await Promise.all([rpc("kart_verificar", { p_telefone: tel }), rpc("kart_opcoes")]);
    ocupado(botao);

    if (!v.ok) {
      if (v.erro === "ja_votou") {
        aviso(caixa, v.mensagem, { texto: "Ver o placar", acao: () => mostrarPlacar(tel, false) });
      } else {
        if (v.erro === "telefone_invalido") campoTel.setAttribute("aria-invalid", "true");
        aviso(caixa, v.mensagem || "Não deu para conferir o número. Tente de novo.");
      }
      return;
    }
    if (!o.ok || !Array.isArray(o.dias)) {
      aviso(caixa, o.mensagem || "Não deu para carregar as datas. Tente de novo.");
      return;
    }
    if (!o.dias.length) {
      aviso(caixa, "Não há mais datas abertas para votação.");
      return;
    }

    estado.telefone = v.telefone;
    estado.nome = v.nome || nome;
    estado.dias = {};
    o.dias.forEach(d => {
      (estado.dias[d.pista] = estado.dias[d.pista] || {})[d.data] = { feriado: d.feriado, horarios: d.horarios };
    });

    entrarNaVotacao();
  }

  function entrarNaVotacao() {
    $("#portao").hidden = true;
    $("#liberado").hidden = false;
    $("#liberado-nome").textContent = "Fala, " + estado.nome.split(" ")[0] + ". Voto liberado.";
    $("#liberado-tel").textContent = "WhatsApp " + F.telefone(estado.telefone);

    $("#votacao").hidden = false;
    $("#largada").hidden = false;
    montarCalendario();
    montarHorarios();
    atualizar();

    const alvo = $("#t-pista");
    alvo.scrollIntoView({ block: "start" });
    alvo.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------
     Cartões das pistas
     ------------------------------------------------------------------ */
  function montarPistas() {
    $("#pistas").innerHTML = cfg.pistas.map(p => {
      const porMinuto = p.valor / p.minutos;
      const fotos = Array.from({ length: p.fotos }, (_, i) =>
        '<button type="button" class="foto" data-i="' + i + '" aria-label="Ampliar foto ' + (i + 1) + " de " + p.fotos + '">' +
        '<img src="fotos/' + p.id + "-" + (i + 1) + '.jpg" alt="' + F.escapar(p.nome) + ", foto " + (i + 1) + '"' +
        (i ? ' loading="lazy"' : "") + ' decoding="async"></button>').join("");
      const itens = lista => lista.map(t => "<li>" + F.escapar(t) + "</li>").join("");

      return '<article class="pista" data-pista="' + p.id + '">' +
        '<div class="galeria">' +
          '<div class="galeria-trilho">' + fotos + "</div>" +
          '<button type="button" class="galeria-seta ant" aria-label="Foto anterior">' + SETA_ESQ + "</button>" +
          '<button type="button" class="galeria-seta prox" aria-label="Próxima foto">' + SETA_DIR + "</button>" +
          '<span class="galeria-conta" aria-hidden="true">1 / ' + p.fotos + "</span>" +
        "</div>" +
        '<div class="pista-corpo">' +
          '<h3 class="pista-nome">' + F.escapar(p.nome) + "</h3>" +
          '<p class="apoio mt-2">' + F.escapar(p.local) + ' <a class="link whitespace-nowrap" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
            encodeURIComponent(p.mapa) + '">Ver no mapa</a></p>' +
          '<dl class="numeros">' +
            '<div class="numero"><dd>' + F.reais(p.valor) + "</dd><dt>por pessoa</dt></div>" +
            '<div class="numero"><dd>' + p.minutos + " min</dd><dt>de pista</dt></div>" +
            '<div class="numero"><dd>' + F.reais(Math.round(porMinuto * 100) / 100) + "</dd><dt>por minuto</dt></div>" +
          "</dl>" +
          "<h4>Vantagens</h4><ul class=\"lista\">" + itens(p.vantagens) + "</ul>" +
          "<h4>Regras</h4><ul class=\"lista discreta\">" + itens(p.regras) + "</ul>" +
          "<h4>Quando abre</h4><ul class=\"lista discreta\">" + itens(p.funcionamento) + "</ul>" +
          '<div class="escolher"><label>' +
            '<input type="radio" class="so-leitor" name="pista" value="' + p.id + '">' +
            '<span class="botao cheio">' + MARCA + '<span class="rotulo">Votar nesta pista</span></span>' +
          "</label></div>" +
        "</div>" +
      "</article>";
    }).join("");

    $$("#pistas .pista").forEach(cartao => {
      const trilho = $(".galeria-trilho", cartao);
      const conta = $(".galeria-conta", cartao);
      const total = trilho.children.length;
      const atual = () => Math.round(trilho.scrollLeft / trilho.clientWidth);
      const ir = i => trilho.scrollTo({ left: Math.max(0, Math.min(total - 1, i)) * trilho.clientWidth, behavior: "smooth" });

      $(".ant", cartao).addEventListener("click", () => ir(atual() - 1));
      $(".prox", cartao).addEventListener("click", () => ir(atual() + 1));
      trilho.addEventListener("scroll", () => { conta.textContent = (atual() + 1) + " / " + total; }, { passive: true });
      trilho.addEventListener("click", e => {
        const foto = e.target.closest(".foto");
        if (foto) abrirFoto(cartao.dataset.pista, Number(foto.dataset.i));
      });

      $('input[name="pista"]', cartao).addEventListener("change", e => escolherPista(e.target.value));
    });
  }

  function escolherPista(id) {
    estado.pista = id;
    const dias = estado.dias[id] || {};
    if (estado.data && !dias[estado.data]) { estado.data = null; estado.horario = null; }
    if (estado.data && estado.horario && !dias[estado.data].horarios.includes(estado.horario)) estado.horario = null;

    $$("#pistas .pista").forEach(c => {
      const sim = c.dataset.pista === id;
      c.classList.toggle("escolhida", sim);
      $(".rotulo", c).textContent = sim ? "Pista escolhida" : "Votar nesta pista";
    });
    montarCalendario();
    montarHorarios();
    atualizar();
  }

  /* ------------------------------------------------------------------
     Calendário: só os dias em que a pista escolhida abre
     ------------------------------------------------------------------ */
  function montarCalendario() {
    const caixa = $("#calendario"), dica = $("#dia-dica");
    const p = pistaPorId(estado.pista);

    if (!p) {
      dica.textContent = "Cada pista abre em dias diferentes.";
      caixa.innerHTML = '<p class="vazio-dica sm:col-span-2">Escolha a pista primeiro para ver os dias em que ela abre.</p>';
      return;
    }

    const dias = estado.dias[p.id] || {};
    const datas = Object.keys(dias).sort();
    if (!datas.length) {
      dica.textContent = "";
      caixa.innerHTML = '<p class="vazio-dica sm:col-span-2">Esta pista não tem mais datas abertas para votação.</p>';
      return;
    }

    const temFeriado = datas.some(d => dias[d].feriado);
    dica.innerHTML = "Dias em que " + (p.id === "kis" ? "o " : "a ") + F.escapar(p.nomeCurto) + " abre." +
      (temFeriado ? ' <span class="legenda-feriado">Dia com ponto é feriado.</span>' : "");

    const primeiro = F.data(datas[0]), ultimo = F.data(datas[datas.length - 1]);
    let html = "";
    for (let m = new Date(primeiro.getFullYear(), primeiro.getMonth(), 1); m <= ultimo; m.setMonth(m.getMonth() + 1)) {
      const ano = m.getFullYear(), mes = m.getMonth();
      const diasNoMes = new Date(ano, mes + 1, 0).getDate();
      let grade = F.SEM3.map(s => '<span class="cab">' + s + "</span>").join("");
      grade += "<span></span>".repeat(new Date(ano, mes, 1).getDay());
      for (let d = 1; d <= diasNoMes; d++) {
        const iso = F.iso(new Date(ano, mes, d));
        const info = dias[iso];
        if (!info) { grade += '<span class="dia-fechado" aria-hidden="true">' + d + "</span>"; continue; }
        grade += '<label class="dia' + (info.feriado ? " feriado" : "") + '"' +
          (info.feriado ? ' title="Feriado: ' + F.escapar(info.feriado) + '"' : "") + ">" +
          '<input type="radio" class="so-leitor" name="data" value="' + iso + '"' + (iso === estado.data ? " checked" : "") +
          ' aria-label="' + F.dataLonga(iso) + (info.feriado ? ", feriado" : "") + '">' +
          "<span>" + d + "</span></label>";
      }
      html += '<div class="mes"><h3>' + F.MESES[mes] + '</h3><div class="mes-grade">' + grade + "</div></div>";
    }
    caixa.innerHTML = html;

    $$('input[name="data"]', caixa).forEach(i => i.addEventListener("change", e => {
      estado.data = e.target.value;
      if (estado.horario && !dias[estado.data].horarios.includes(estado.horario)) estado.horario = null;
      montarHorarios();
      atualizar();
    }));
  }

  function montarHorarios() {
    const caixa = $("#horarios");
    const info = estado.pista && estado.data && (estado.dias[estado.pista] || {})[estado.data];
    if (!info) {
      caixa.innerHTML = '<p class="vazio-dica w-full">Escolha o dia para ver os horários.</p>';
      return;
    }
    caixa.innerHTML = info.horarios.map(h =>
      '<label class="hora"><input type="radio" class="so-leitor" name="horario" value="' + h + '"' +
      (h === estado.horario ? " checked" : "") + "><span>" + F.hora(h) + "</span></label>").join("");
    $$('input[name="horario"]', caixa).forEach(i => i.addEventListener("change", e => {
      estado.horario = e.target.value;
      atualizar();
    }));
  }

  /* ------------------------------------------------------------------
     Semáforo + botão: só libera com as quatro luzes acesas
     ------------------------------------------------------------------ */
  function atualizar() {
    const feito = {
      telefone: !!estado.telefone,
      pista: !!estado.pista,
      data: !!estado.data,
      horario: !!estado.horario
    };
    $$("#semaforo li").forEach(li => li.classList.toggle("acesa", feito[li.dataset.luz]));

    const pronto = feito.telefone && feito.pista && feito.data && feito.horario;
    $("#largada").classList.toggle("pronta", pronto);
    $("#btn-votar").disabled = !pronto;

    const falta = [];
    if (!feito.pista) falta.push("a pista");
    if (!feito.data) falta.push("o dia");
    if (!feito.horario) falta.push("o horário");

    $("#resumo").textContent = pronto
      ? pistaPorId(estado.pista).nome + ", " + F.dataLonga(estado.data) + ", às " + F.hora(estado.horario) + "."
      : "Falta escolher " + (falta.length > 1 ? falta.slice(0, -1).join(", ") + " e " + falta[falta.length - 1] : falta[0]) + ".";
  }

  /* ------------------------------------------------------------------
     Voto
     ------------------------------------------------------------------ */
  function abrirConfirmacao() {
    if ($("#btn-votar").disabled) return;
    $("#c-pista").textContent = pistaPorId(estado.pista).nome;
    $("#c-data").textContent = F.dataLonga(estado.data);
    $("#c-hora").textContent = F.hora(estado.horario);
    $("#confirma-aviso").hidden = true;
    $("#confirma").showModal();
  }

  async function gravarVoto() {
    const botao = $("#btn-gravar"), caixa = $("#confirma-aviso");
    caixa.hidden = true;
    ocupado(botao, "Gravando…");
    const r = await rpc("kart_votar", {
      p_telefone: estado.telefone,
      p_nome: estado.nome,
      p_pista: estado.pista,
      p_data: estado.data,
      p_horario: estado.horario
    });
    ocupado(botao);

    if (r.ok) {
      $("#confirma").close();
      mostrarPlacar(estado.telefone, true);
      return;
    }
    if (r.erro === "ja_votou") {
      // O número votou em outra aba ou aparelho enquanto esta tela estava aberta.
      const tel = estado.telefone;
      $("#confirma").close();
      ["#liberado", "#votacao", "#largada"].forEach(s => { $(s).hidden = true; });
      $("#portao").hidden = false;
      aviso($("#portao-aviso"), r.mensagem, { texto: "Ver o placar", acao: () => mostrarPlacar(tel, false) });
      window.scrollTo(0, 0);
      return;
    }
    aviso(caixa, r.mensagem || "Não deu para gravar o voto. Tente de novo.");
  }

  /* ------------------------------------------------------------------
     Placar parcial (o banco só entrega para quem já votou)
     ------------------------------------------------------------------ */
  const textoVoto = v => pistaPorId(v.pista).nome + ", " + F.dataLonga(v.data) + ", às " + F.hora(v.horario) + ".";

  // O voto só é mostrado na tela de quem acabou de votar. O banco não
  // devolve o voto de um número: na turma todos sabem o WhatsApp de todos.
  let meuVoto = null;

  function abrirTelaPlacar() {
    ["#portao", "#liberado", "#votacao", "#largada"].forEach(s => { $(s).hidden = true; });
    $(".topo").hidden = true;
    $("#evento-placar").textContent = cfg.evento;
    $("#placar-titulo").textContent = meuVoto ? "Voto registrado" : "Este número já votou";
    $("#meu-voto").textContent = meuVoto ? textoVoto(meuVoto)
      : "Cada WhatsApp vota uma vez. Para trocar o voto, fale com o organizador.";
    if ($("#placar").hidden) {
      $("#placar").hidden = false;
      window.scrollTo(0, 0);
      $("#placar-titulo").focus({ preventScroll: true });
    }
  }

  async function mostrarPlacar(telefone, acabouDeVotar) {
    estado.telefone = telefone;

    // Quem acabou de votar vê a confirmação na hora, mesmo que o placar demore.
    if (acabouDeVotar) {
      meuVoto = { pista: estado.pista, data: estado.data, horario: estado.horario };
      abrirTelaPlacar();
    }

    const naTelaDoPlacar = !$("#placar").hidden;
    const botao = naTelaDoPlacar ? $("#btn-atualizar") : $("#btn-liberar");
    ocupado(botao, naTelaDoPlacar ? "Atualizando…" : "Abrindo o placar…");
    const r = await rpc("kart_resultado", { p_telefone: telefone });
    ocupado(botao);

    if (!r.ok) {
      aviso(naTelaDoPlacar ? $("#placar-aviso") : $("#portao-aviso"),
            r.mensagem || "Não deu para carregar o placar. Tente de novo.");
      return;
    }

    $("#placar-aviso").hidden = true;
    if (!naTelaDoPlacar) abrirTelaPlacar();

    $("#placar-total").textContent =
      (r.total === 1 ? "1 piloto votou" : r.total + " pilotos votaram") +
      (r.lista ? ", de " + r.lista + " na lista" : "") +
      (r.votacao_aberta ? ". A votação continua aberta." : ". Votação encerrada.");

    const porPista = {};
    cfg.pistas.forEach(p => { porPista[p.id] = 0; });
    r.votos.forEach(v => { porPista[v.pista] = (porPista[v.pista] || 0) + v.votos; });
    const maior = Math.max.apply(null, Object.values(porPista));

    $("#placar-pistas").innerHTML = cfg.pistas.map(p => {
      const n = porPista[p.id], pct = r.total ? Math.round(n * 100 / r.total) : 0;
      return '<div class="barra-pista' + (n < maior ? " atras" : "") + '">' +
        '<div class="linha"><span class="nome">' + F.escapar(p.nome) + '</span><span class="conta">' + F.votos(n) + ", " + pct + "%</span></div>" +
        '<div class="barra-trilho"><div class="barra-cheia" style="width:' + pct + '%"></div></div></div>';
    }).join("");

    $("#placar-combos").innerHTML = r.votos.slice(0, 6).map(v => {
      const eMeu = meuVoto && v.pista === meuVoto.pista && v.data === meuVoto.data && v.horario === meuVoto.horario;
      return "<li" + (eMeu ? ' class="meu"' : "") + '><span class="quando">' +
        F.escapar(pistaPorId(v.pista).nomeCurto) + ", " + F.dataCurta(v.data) + ", " + F.hora(v.horario) +
        '</span><span class="n">' + F.votos(v.votos) + "</span></li>";
    }).join("");
    $("#placar-dados").hidden = false;
  }

  /* ------------------------------------------------------------------
     Foto ampliada
     ------------------------------------------------------------------ */
  const foto = { pista: null, i: 0 };

  function abrirFoto(idPista, i) {
    foto.pista = pistaPorId(idPista);
    trocarFoto(i);
    $("#ampliada").showModal();
  }

  function trocarFoto(i) {
    const p = foto.pista;
    foto.i = (i + p.fotos) % p.fotos;
    const img = $("#ampliada-img");
    img.src = "fotos/" + p.id + "-" + (foto.i + 1) + ".jpg";
    img.alt = p.nome + ", foto " + (foto.i + 1);
    $("#ampliada-conta").textContent = (foto.i + 1) + " / " + p.fotos;
  }

  function iniciarFotoAmpliada() {
    const d = $("#ampliada");
    $("#ampliada-ant").addEventListener("click", () => trocarFoto(foto.i - 1));
    $("#ampliada-prox").addEventListener("click", () => trocarFoto(foto.i + 1));
    $("#ampliada-fechar").addEventListener("click", () => d.close());
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
    d.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft") trocarFoto(foto.i - 1);
      if (e.key === "ArrowRight") trocarFoto(foto.i + 1);
    });
  }

  iniciar();
})();
