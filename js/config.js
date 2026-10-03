/* =====================================================================
   CONFIGURAÇÃO DO SITE — este é o único arquivo que você precisa editar.
   ===================================================================== */

window.KART_CONFIG = {

  /* 1. CHAVES DO SUPABASE  (guia: README.md, passo 3)
        No Supabase, botão "Connect" no topo da tela: Project URL e
        Publishable key. A chave certa é a PÚBLICA: começa com
        "sb_publishable_" (ou, nos projetos antigos, a "anon public").
        Ela pode ficar no GitHub sem problema.
        Nunca cole aqui a chave "secret" nem a "service_role".          */
  SUPABASE_URL: "https://raoxmntysbwfugdbtnti.supabase.co",
  API_KEY: "sb_publishable_ptU6MVWyPpzbOP7-t8GPuA_A6mmHzLt",

  /* 2. TEXTOS */
  evento: "Scuderia Tracomal Racing",

  /* 3. PISTAS
        O "id" liga a pista às datas guardadas no banco: não mude.
        As fotos ficam na pasta fotos/ com o nome id-1.jpg, id-2.jpg...
        Datas e horários NÃO ficam aqui: vêm do banco (supabase/setup.sql). */
  pistas: [
    {
      id: "kis",
      nome: "Kartódromo Internacional da Serra",
      nomeCurto: "Kartódromo da Serra",
      local: "Portal de Jacaraípe, Serra/ES",
      mapa: "Kartódromo Internacional da Serra, Serra ES",
      valor: 130,
      minutos: 25,
      fotos: 7,
      vantagens: [
        "25 minutos de pista, 5 a mais que na FKI",
        "Menor custo por minuto de corrida",
        "Altura mínima menor: 1,55 m",
        "Abre domingo de manhã, a partir das 08h30"
      ],
      regras: [
        "Idade mínima de 13 anos",
        "Altura mínima de 1,55 m"
      ],
      funcionamento: [
        "Quarta e quinta, das 16h30 às 21h",
        "Sábado, das 13h30 às 19h",
        "Domingo, das 08h30 às 16h"
      ]
    },
    {
      id: "fki",
      nome: "FKI Racing Vitória",
      nomeCurto: "FKI Racing Vitória",
      local: "Av. José Maria Vivacqua, 910, Jardim Camburi, Vitória/ES",
      mapa: "FKI Racing, Avenida José Maria Vivacqua 910, Jardim Camburi, Vitória ES",
      valor: 110,
      minutos: 20,
      fotos: 7,
      vantagens: [
        "R$ 20 a menos por pessoa",
        "5 minutos de classificação definem o grid, depois 15 de corrida",
        "Abre de terça a sexta à noite, fim de semana e feriado",
        "Bateria fechada para a turma a partir de 10 pilotos (cabem até 15)",
        "Sem idade mínima"
      ],
      regras: [
        "Altura mínima de 1,60 m; adulto um pouco abaixo faz o teste do pedal",
        "Menor de 18 anos só com o responsável legal",
        "Chegar 40 minutos antes, para o briefing de segurança"
      ],
      funcionamento: [
        "Terça a sexta, das 17h às 21h",
        "Sábado, domingo e feriado, das 14h às 20h"
      ]
    }
  ]
};
