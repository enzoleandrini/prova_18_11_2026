import express, { Request, Response } from "express";
import cors from "cors";
import mysql, { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

// Schema de validacao do produto (Zod)
const produtoSchema = z.object({
  nome_do_produto: z
    .string({ required_error: "Informe o nome do produto.", invalid_type_error: "O nome deve ser um texto." })
    .trim()
    .min(1, "Informe o nome do produto.")
    .max(255, "O nome deve ter no maximo 255 caracteres."),
  categoria: z
    .string({ required_error: "Informe a categoria.", invalid_type_error: "A categoria deve ser um texto." })
    .trim()
    .min(1, "Informe a categoria.")
    .max(100, "A categoria deve ter no maximo 100 caracteres."),
  preco: z
    .number({ required_error: "Informe o preco.", invalid_type_error: "O preco deve ser um numero." })
    .positive("O preco deve ser maior que zero.")
    .max(99999999.99, "Preco muito alto."),
  quantidade_de_estoque: z
    .number({ required_error: "Informe a quantidade em estoque.", invalid_type_error: "A quantidade deve ser um numero." })
    .int("A quantidade deve ser um numero inteiro.")
    .nonnegative("A quantidade nao pode ser negativa."),
});

type Produto = z.infer<typeof produtoSchema>;

const PORT = Number(process.env.PORT ?? 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost";

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "mysql",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "produtos",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "produtos_db",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});

const app = express();

// CORS: somente a origem da aplicacao web (VM1-WEB), metodos GET e POST.
// O preflight OPTIONS e respondido automaticamente pelo middleware.
app.use(
  cors({
    origin: CORS_ORIGIN.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());

// POST /produto -> valida com Zod e cadastra o produto no MySQL
app.post("/produto", async (req: Request, res: Response) => {
  const validacao = produtoSchema.safeParse(req.body ?? {});
  if (!validacao.success) {
    const campos = validacao.error.flatten().fieldErrors;
    res.status(400).json({
      erro: "Dados invalidos.",
      campos: Object.fromEntries(Object.entries(campos).map(([campo, msgs]) => [campo, msgs?.[0]])),
    });
    return;
  }
  const produto: Produto = validacao.data;

  try {
    const [resultado] = await pool.execute<ResultSetHeader>(
      "INSERT INTO produtos (nome_do_produto, categoria, preco, quantidade_de_estoque) VALUES (?, ?, ?, ?)",
      [produto.nome_do_produto, produto.categoria, produto.preco, produto.quantidade_de_estoque]
    );
    res.status(201).json({ id: resultado.insertId, ...produto });
  } catch (erro) {
    console.error("Erro ao cadastrar produto:", erro);
    res.status(500).json({ erro: "Erro ao cadastrar produto." });
  }
});

// GET /produtos -> retorna todos os produtos cadastrados
app.get("/produtos", async (_req: Request, res: Response) => {
  try {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT id, nome_do_produto, categoria, preco, quantidade_de_estoque FROM produtos ORDER BY id"
    );
    res.json(linhas);
  } catch (erro) {
    console.error("Erro ao listar produtos:", erro);
    res.status(500).json({ erro: "Erro ao listar produtos." });
  }
});

async function aguardarBanco(tentativas = 30): Promise<void> {
  for (let i = 1; i <= tentativas; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("Conectado ao MySQL.");
      return;
    } catch {
      console.log(`Aguardando MySQL (${i}/${tentativas})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Nao foi possivel conectar ao MySQL.");
}

aguardarBanco()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`API rodando na porta ${PORT} (CORS liberado para ${CORS_ORIGIN})`);
    });
  })
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
