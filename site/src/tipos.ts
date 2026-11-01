// Só o que o código novo precisa saber da foto. O formato completo está em docs/painel.md.
export type Registro = { fonte: string; serie: string; dimensao: string; data_ref: string; valor: number; unidade: string; descricao: string };

export type Foto = {
  versao: number;
  data: string;
  gerado_em: string;
  status: string;
  fontes: any[];
  conferencias: any[];
  derivados: any;
  mudancas: any[];
  registros: Registro[];
};

/** O que as contas das calculadoras e das frases recebem: a foto, as duas curvas e o spread de risco do momento. */
export type Estado = {
  foto: Foto;
  parametros: any;
  curvas: { nominal: any | null; real: any | null };
  spread: number;
};

export type Tela = "briefing" | "mercado" | "calculadoras" | "bastidores";
