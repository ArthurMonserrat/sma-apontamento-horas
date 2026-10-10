export type DEPColaborador = {
  nome: string
  cargo: string
}

export type DEPSquad = {
  nome: string
  supervisor: string
  colaboradores: DEPColaborador[]
}

export type DEPGerencia = {
  gerente: string
  squads: DEPSquad[]
}

export const organogramaDEP: DEPGerencia[] = [
  {
    gerente: 'Dalton Alves',
    squads: [
      {
        nome: 'S7 - FILIAL VIX',
        supervisor: 'Dalton Alves Ferreira',
        colaboradores: [
          { nome: 'Pedro Otávio Correia', cargo: 'Engenheiro' },
          { nome: 'Vitória Aparecida Almeida', cargo: 'Engenheiro' },
          { nome: 'Camilly Vitória M. V. Santos', cargo: 'Projetista' },
          { nome: 'Fernando G. Camporez', cargo: 'Projetista' },
          { nome: 'Danilo Durão Marianelli', cargo: 'Desenhista' },
          { nome: 'José Pedro Recla Giestas', cargo: 'Desenhista' },
          { nome: 'Mileny Alves dos Santos', cargo: 'Desenhista' },
          { nome: 'Paulo Victor C. Guarnier', cargo: 'Desenhista' },
          { nome: 'Laís Prata Decoté', cargo: 'Estagiário 4h' },
          { nome: 'Mateus Souza Soares', cargo: 'Estagiário 4h' },
        ],
      },
    ],
  },
  {
    gerente: 'Carlos Eduardo',
    squads: [
      {
        nome: 'S11 - MANDUCA',
        supervisor: 'Alexandre Manduca',
        colaboradores: [
          { nome: 'Danilo Carrasqueira', cargo: 'Engenheiro' },
          { nome: 'Joyce Kelly Alves', cargo: 'Engenheiro' },
          { nome: 'Roberta Neves', cargo: 'Engenheiro' },
          { nome: 'Jessyca Ramos Ferreira', cargo: 'Projetista' },
          { nome: 'Raissa Mendonça Gonçalves', cargo: 'Projetista' },
          { nome: 'Danilo Tavares Mansur', cargo: 'Desenhista' },
          { nome: 'Arthur Monserrat', cargo: 'Estagiário' },
          { nome: 'Eduardo A. Avelar', cargo: 'Estagiário' },
          { nome: 'Lukas Gunter Silva de Paula', cargo: 'Estagiário' },
        ],
      },
      {
        nome: 'S10 - RAMON',
        supervisor: 'Ramon Mota',
        colaboradores: [
          { nome: 'Eduardo Marques de Assis', cargo: 'Engenheiro' },
          { nome: 'Luis Mol', cargo: 'Projetista' },
          { nome: 'Pio Bezerra', cargo: 'Projetista' },
          { nome: 'João Clemente', cargo: 'Desenhista' },
          { nome: 'Fernando Almeida', cargo: 'Estagiário' },
          { nome: 'Victória Moreira Aguilar', cargo: 'Estagiário' },
          { nome: 'Marcelo Marques Silva', cargo: 'Estagiário 4h' },
        ],
      },
      {
        nome: 'S5 - FABRICIA',
        supervisor: 'Fabricia Silva',
        colaboradores: [
          { nome: 'Lucas de Oliveira Antunes', cargo: 'Engenheiro' },
          { nome: 'Aloisio Aparecido Vaz', cargo: 'Projetista' },
          { nome: 'Claudia G. Landa Prado', cargo: 'Projetista' },
          { nome: 'Gabriel Figueiredo Dias', cargo: 'Projetista' },
          { nome: 'José Antonio R. Jr.', cargo: 'Projetista' },
          { nome: 'Matheus M. Abijaudi', cargo: 'Projetista' },
          { nome: 'Thiago L. O. Andrade', cargo: 'Projetista' },
          { nome: 'Gustavo França M. dos Santos', cargo: 'Desenhista' },
          { nome: 'Kaique Daniel N. de Carvalho', cargo: 'Desenhista' },
          { nome: 'Maria Luiza M. Guimarães', cargo: 'Desenhista' },
          { nome: 'João Paulo Castro Ornelas', cargo: 'Estagiário' },
          { nome: 'Pedro Magalhães Mansueto', cargo: 'Estagiário' },
          { nome: 'Francisco Araújo Lopes', cargo: 'Estagiário 4h' },
          { nome: 'Guilherme A. S. dos Reis', cargo: 'Estagiário 4h' },
        ],
      },
      {
        nome: 'S6 - VINICIUS',
        supervisor: 'Vinicius Simões Passos',
        colaboradores: [
          { nome: 'Gabriel Valadares Veloso', cargo: 'Engenheiro' },
          { nome: 'Guilherme Borello', cargo: 'Engenheiro' },
          { nome: 'Paulão Diniz', cargo: 'Engenheiro' },
          { nome: 'Raoni de Faria Jardim', cargo: 'Engenheiro' },
          { nome: 'Danielle Silva Brandão', cargo: 'Projetista' },
          { nome: 'Diego H. M. dos Santos', cargo: 'Projetista' },
          { nome: 'Jonathan Oliveira', cargo: 'Projetista' },
          { nome: 'Ludmila M R Eufrásio', cargo: 'Projetista' },
          { nome: 'Maike Monteiro', cargo: 'Projetista' },
          { nome: 'Christian Rodrigues M.', cargo: 'Desenhista' },
          { nome: 'Lucas Victor R. Moreira', cargo: 'Desenhista' },
          { nome: 'Arthur Brasil Bahia Joviano', cargo: 'Estagiário' },
          { nome: 'Christian Duarte Silva Pessoa', cargo: 'Estagiário' },
          { nome: 'Gabriel Tavares Mansur', cargo: 'Estagiário' },
          { nome: 'Davi Picolli Lima', cargo: 'Estagiário 4h' },
          { nome: 'Ester Moreira Canuto', cargo: 'Estagiário 4h' },
        ],
      },
    ],
  },
  {
    gerente: 'Phelippe Rezende',
    squads: [
      {
        nome: 'S1 - PABLO',
        supervisor: 'Pablo Muzzi Câmara',
        colaboradores: [
          { nome: 'Anna Luiza Rosa Duarte', cargo: 'Engenheiro' },
          { nome: 'Filipe da Silveira Moreira', cargo: 'Engenheiro' },
          { nome: 'Halana Hess', cargo: 'Engenheiro' },
          { nome: 'Giovana Vecchio Soares', cargo: 'Projetista' },
          { nome: 'Iago Peres Pereira', cargo: 'Projetista' },
          { nome: 'Bruna Cristina de Almeida', cargo: 'Estagiário' },
          { nome: 'Gabriel Nonato Pereira', cargo: 'Estagiário' },
        ],
      },
      {
        nome: 'S2 - LEANDRO',
        supervisor: 'Leandro Gelmini de Almeida',
        colaboradores: [
          { nome: 'Antônio Narciso de O. Junior', cargo: 'Engenheiro' },
          { nome: 'Phillipe Barbosa e Silva', cargo: 'Engenheiro' },
          { nome: 'Warley Sérgio N. C. Junior', cargo: 'Engenheiro' },
          { nome: 'Douglas H. V. Ferreira', cargo: 'Projetista' },
          { nome: 'Marcos Paulo Santos', cargo: 'Projetista' },
          { nome: 'Paulo Emílio A. Ramirez', cargo: 'Projetista' },
          { nome: "Gioberto D'angelis Jr.", cargo: 'Desenhista' },
          { nome: 'Ayra Beatriz F. Oliveira', cargo: 'Estagiário 4h' },
          { nome: 'Rodrigo Izidoro de Abreu', cargo: 'Estagiário 4h' },
        ],
      },
      {
        nome: 'S9 - DANIELLE',
        supervisor: 'Danielle Marques',
        colaboradores: [
          { nome: 'Carlos Alberto M. P. de Souza', cargo: 'Engenheiro' },
          { nome: 'Flávio César Costa Sales', cargo: 'Engenheiro' },
          { nome: 'Jucielle Marques', cargo: 'Engenheiro' },
          { nome: 'Patricia Cordeiro Machado', cargo: 'Engenheiro' },
          { nome: 'Bárbara Reis', cargo: 'Projetista' },
          { nome: 'Leonardo Ermindo C. Junior', cargo: 'Projetista' },
          { nome: 'Priscila Diniz Teixeira', cargo: 'Projetista' },
          { nome: 'Victor A. L. Reis', cargo: 'Projetista' },
          { nome: 'Matheus Felipe M. Nogueira', cargo: 'Estagiário' },
          { nome: 'Pedro Henrique E. Hilario', cargo: 'Estagiário' },
        ],
      },
      {
        nome: 'S4 - DANIEL',
        supervisor: 'Daniel Silva',
        colaboradores: [
          { nome: 'Daniel Pedro de Souza e Silva', cargo: 'Engenheiro' },
          { nome: 'Lucas Batista de Moura Lima', cargo: 'Engenheiro' },
          { nome: 'Matheus B. P. Abolaro', cargo: 'Engenheiro' },
          { nome: 'Bruno Kleizer Gonçalves', cargo: 'Projetista' },
          { nome: 'Edgard Fischer', cargo: 'Projetista' },
          { nome: 'Luiz Humberto', cargo: 'Projetista' },
          { nome: 'Matheus F. Silva', cargo: 'Projetista' },
          { nome: 'Tarterio Matias Alves', cargo: 'Projetista' },
          { nome: 'Anna Beatriz Dos S. Pompeu', cargo: 'Desenhista' },
          { nome: 'Arisson Lopes Teixeira', cargo: 'Desenhista' },
          { nome: 'Felipe Marques de Lima', cargo: 'Desenhista' },
          { nome: 'Luiz Gustavo de Almeida', cargo: 'Desenhista' },
          { nome: 'João Victor M. de Carvalho', cargo: 'Estagiário' },
          { nome: 'Jonathan Gonçalves de Freitas', cargo: 'Estagiário' },
        ],
      },
      {
        nome: 'S8 - CIVIL',
        supervisor: 'Eduardo Carvalho Guimarães',
        colaboradores: [
          { nome: 'Evelyn Moraes Hosken de Sá', cargo: 'Engenheiro' },
          { nome: 'Ana Luiza F. Pimentel', cargo: 'Projetista' },
          { nome: 'Felipe Zola de Matos', cargo: 'Projetista' },
          { nome: 'Débora P. Alves de Sales', cargo: 'Desenhista' },
        ],
      },
      {
        nome: 'S3 - LUANA',
        supervisor: 'Luana Rodrigues',
        colaboradores: [
          { nome: 'Elizabeth C. Libanio', cargo: 'Engenheiro' },
          { nome: 'Julia Hemanoele da P. Matias', cargo: 'Projetista' },
          { nome: 'Victória Alves N. da Silva', cargo: 'Desenhista' },
          { nome: 'Marcus Mansur', cargo: 'Estagiário' },
        ],
      },
    ],
  },
]

export const getAllColaboradores = () => {
  const nomes = new Set<string>()
  organogramaDEP.forEach((gerencia) => {
    gerencia.squads.forEach((squad) => {
      nomes.add(squad.supervisor)
      squad.colaboradores.forEach((colab) => nomes.add(colab.nome))
    })
  })
  return Array.from(nomes).sort()
}
