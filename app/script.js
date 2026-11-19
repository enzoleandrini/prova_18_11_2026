// window.API_URL vem do config.js gerado pelo Ansible (IP da VM2-API).
const API_URL = window.API_URL || "http://localhost:3000";

function mostrarMensagem(texto, erro) {
  const el = document.getElementById("mensagem");
  el.textContent = texto;
  el.className = erro ? "erro" : "sucesso";
}

function mostrarToast(texto, erro) {
  const toast = document.createElement("div");
  toast.className = `toast ${erro ? "toast-erro" : "toast-sucesso"}`;
  toast.innerHTML = `<span class="toast-icone">${erro ? "✕" : "✓"}</span><span></span>`;
  toast.lastChild.textContent = texto;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visivel"));
  setTimeout(() => {
    toast.classList.remove("visivel");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Validacao do formulario (mesmas regras do schema Zod da API)
function validarProduto(form) {
  const erros = {};
  const nome = form.nome_do_produto.value.trim();
  const categoria = form.categoria.value.trim();
  const precoTexto = form.preco.value.trim().replace(",", ".");
  const qtdTexto = form.quantidade_de_estoque.value.trim();

  if (!nome) erros.nome_do_produto = "Informe o nome do produto.";
  else if (nome.length > 255) erros.nome_do_produto = "O nome deve ter no máximo 255 caracteres.";

  if (!categoria) erros.categoria = "Informe a categoria.";
  else if (categoria.length > 100) erros.categoria = "A categoria deve ter no máximo 100 caracteres.";

  if (!precoTexto) erros.preco = "Informe o preço.";
  else if (!/^\d+(\.\d{1,2})?$/.test(precoTexto)) erros.preco = "Preço inválido. Ex.: 149,90";
  else if (Number(precoTexto) <= 0) erros.preco = "O preço deve ser maior que zero.";

  if (!qtdTexto) erros.quantidade_de_estoque = "Informe a quantidade em estoque.";
  else if (!/^\d+$/.test(qtdTexto)) erros.quantidade_de_estoque = "A quantidade deve ser um número inteiro (≥ 0).";

  return {
    erros,
    produto: {
      nome_do_produto: nome,
      categoria,
      preco: Number(precoTexto),
      quantidade_de_estoque: Number(qtdTexto),
    },
  };
}

function mostrarErrosCampos(form, erros) {
  form.querySelectorAll(".erro-campo").forEach((el) => {
    const campo = el.dataset.campo;
    el.textContent = erros[campo] || "";
    form[campo].classList.toggle("invalido", Boolean(erros[campo]));
  });
}

function iniciarCadastro() {
  const form = document.getElementById("form-produto");

  // Limpa o erro do campo assim que o usuario digita
  form.addEventListener("input", (evento) => {
    const campo = evento.target.name;
    const el = form.querySelector(`.erro-campo[data-campo="${campo}"]`);
    if (el) el.textContent = "";
    evento.target.classList.remove("invalido");
  });

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const { erros, produto } = validarProduto(form);
    mostrarErrosCampos(form, erros);
    if (Object.keys(erros).length > 0) {
      mostrarToast("Corrija os campos destacados.", true);
      return;
    }

    try {
      const resposta = await fetch(`${API_URL}/produto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(produto),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (dados.campos) mostrarErrosCampos(form, dados.campos);
        mostrarToast(dados.erro || "Erro ao cadastrar produto.", true);
        return;
      }

      mostrarToast(`${dados.nome_do_produto} cadastrado com sucesso!`, false);
      form.reset();
    } catch (erro) {
      mostrarToast("Falha ao comunicar com a API.", true);
    }
  });
}

async function listarProdutos() {
  const corpo = document.getElementById("lista-produtos");

  try {
    const resposta = await fetch(`${API_URL}/produtos`);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const produtos = await resposta.json();

    corpo.innerHTML = "";
    if (produtos.length === 0) {
      mostrarMensagem("Nenhum produto cadastrado.", false);
      return;
    }

    for (const p of produtos) {
      const linha = document.createElement("tr");
      const valores = [
        p.id,
        p.nome_do_produto,
        p.categoria,
        Number(p.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        p.quantidade_de_estoque,
      ];
      valores.forEach((valor, i) => {
        const celula = document.createElement("td");
        if (i === 2) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = valor;
          celula.appendChild(badge);
        } else {
          celula.textContent = valor;
        }
        linha.appendChild(celula);
      });
      corpo.appendChild(linha);
    }
  } catch (erro) {
    mostrarMensagem(`Falha ao buscar produtos: ${erro.message}`, true);
  }
}
