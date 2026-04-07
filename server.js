require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const TIPO_MENSAGEM = {
  pos_compra: "Pós-compra (agradecimento e fidelização)",
  reativacao: "Reativação de cliente inativo",
  carrinho_abandonado: "Carrinho abandonado / orçamento sem resposta",
  promocao: "Promoção ou oferta especial",
  aniversario: "Aniversário do cliente",
  novidade: "Lançamento de produto ou novidade",
  cobranca_suave: "Cobrança amigável / lembrete de pagamento",
};

const TOM_VOZ = {
  formal: "Formal e profissional",
  amigavel: "Amigável e descontraído",
  urgente: "Urgente e persuasivo",
  empatico: "Empático e cuidadoso",
};

app.post("/api/gerar-mensagens", async (req, res) => {
  const {
    nomeCliente,
    nomeLoja,
    segmento,
    tipoMensagem,
    tomVoz,
    produto,
    valor,
    contextoExtra,
    quantidade,
  } = req.body;

  if (!nomeCliente || !nomeLoja || !tipoMensagem || !tomVoz) {
    return res.status(400).json({
      error: "Campos obrigatórios: nomeCliente, nomeLoja, tipoMensagem, tomVoz",
    });
  }

  const qtd = Math.min(Math.max(parseInt(quantidade) || 3, 1), 5);

  const tipoDescricao = TIPO_MENSAGEM[tipoMensagem] || tipoMensagem;
  const tomDescricao = TOM_VOZ[tomVoz] || tomVoz;

  const prompt = `Você é um especialista em marketing de varejo e comunicação via WhatsApp.

Gere exatamente ${qtd} variações de mensagens de WhatsApp para a seguinte situação:

**Dados da Loja:**
- Nome da loja: ${nomeLoja}
- Segmento: ${segmento || "Varejo em geral"}

**Dados do Cliente:**
- Nome: ${nomeCliente}
${produto ? `- Produto/Serviço: ${produto}` : ""}
${valor ? `- Valor: R$ ${valor}` : ""}

**Tipo de Mensagem:** ${tipoDescricao}
**Tom de Voz:** ${tomDescricao}
${contextoExtra ? `**Contexto Adicional:** ${contextoExtra}` : ""}

**Diretrizes:**
- Mensagens curtas e diretas (máximo 3-4 parágrafos)
- Use emojis moderadamente (1-3 por mensagem) para parecer natural no WhatsApp
- Personalize com o nome do cliente
- Inclua uma chamada para ação (CTA) clara
- Formate para WhatsApp: sem markdown, parágrafos separados por linha em branco
- Cada variação deve ter abordagem diferente mas manter o mesmo objetivo
- NÃO use asteriscos, cerquilhas ou outros formatadores markdown

Responda em JSON com o seguinte formato:
{
  "mensagens": [
    {
      "variacao": 1,
      "titulo": "Título descritivo curto da abordagem",
      "texto": "Texto completo da mensagem"
    }
  ]
}`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Resposta inesperada da API");
    }

    // Extrai JSON da resposta
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Formato de resposta inválido");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    res.json({
      sucesso: true,
      mensagens: parsed.mensagens,
      uso: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    console.error("Erro ao gerar mensagens:", err.message);

    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(401).json({ error: "Chave de API inválida" });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res
        .status(429)
        .json({ error: "Limite de requisições atingido. Tente novamente." });
    }

    res.status(500).json({
      error: "Erro ao gerar mensagens. Tente novamente.",
      detalhe: err.message,
    });
  }
});

app.get("/api/opcoes", (req, res) => {
  res.json({
    tiposMensagem: Object.entries(TIPO_MENSAGEM).map(([valor, label]) => ({
      valor,
      label,
    })),
    tomsVoz: Object.entries(TOM_VOZ).map(([valor, label]) => ({ valor, label })),
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
});
