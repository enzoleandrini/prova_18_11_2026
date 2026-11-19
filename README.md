# Avaliação Prática de DevOps — Prova A: Cadastro de Produtos

**OpenTofu · cloud-init · Ansible · Docker · API REST (Node.js + TypeScript) · MySQL**

## Integrantes do grupo

| Nome completo                     | RA       |
| --------------------------------- | -------- |
| Enzo Dorigon Leandrini            | 23000663 |
| Felipe Fonseca Gimenes            | 23000242 |
| Marcos Vinicius Carvalho da Silva | 23000327 |

---

## Objetivo

Aplicação distribuída em duas VMs para cadastrar e consultar produtos de um catálogo de e-commerce, com infraestrutura automatizada e serviços em containers.

## Arquitetura

```
┌──────────────────────────────┐          HTTP           ┌──────────────────────────────────┐
│ VM1-WEB — aplicação web      │  ───────────────────▶   │ VM2-API — API e banco            │
│ Docker: nginx + HTML/CSS/JS  │   POST /produto         │ Docker: API Node.js (TypeScript) │
│ Formulário + "Listar todos"  │   GET  /produtos        │ Docker: MySQL 8 (persistência)   │
│ porta 80                     │   (CORS liberado)       │ porta 3000                       │
└──────────────────────────────┘                         └──────────────────────────────────┘

OpenTofu provisiona as VMs  │  cloud-init prepara o Docker  │  Ansible implanta os serviços
```

- **VM1-WEB**: container `nginx:alpine` servindo `index.html` (formulário de cadastro) e `produtos.html` (listagem, aberta pelo link **"Listar todos os produtos"**). As páginas consomem a API da VM2 via `fetch` — nenhum dado fixo ou em memória.
- **VM2-API**: `docker compose` com dois containers na mesma rede bridge: `api` (Node.js/Express em TypeScript) e `mysql` (MySQL 8.0 com volume persistente).

## Estrutura do repositório

```
.
├── ansible/
│   ├── inventory            # IPs das VMs + usuário/chave SSH
│   └── playbook.yml         # implanta API+MySQL na VM2-API e app web na VM1-WEB
├── iac/
│   ├── cloud_init.cfg       # usuário aluno, chave SSH e instalação do Docker
│   └── main.tf              # OpenTofu: cria VM1-WEB e VM2-API (libvirt)
├── app/
│   ├── Dockerfile           # nginx:alpine
│   ├── index.html           # formulário de cadastro
│   ├── produtos.html        # listagem de produtos
│   ├── script.js            # chamadas à API
│   └── style.css
├── api/
│   ├── Dockerfile           # build multi-stage (TypeScript -> JavaScript)
│   ├── docker-compose.yml   # api + mysql
│   ├── init.sql             # cria a tabela produtos
│   ├── package.json
│   ├── tsconfig.json
│   └── src/server.ts        # API REST
├── setup.sh                 # fluxo completo: tofu + IPs no inventory + ansible
└── README.md
```

## Dados do produto

| Campo                   | Tipo    | Coluna MySQL    |
| ----------------------- | ------- | --------------- |
| `nome_do_produto`       | Texto   | `VARCHAR(255)`  |
| `categoria`             | Texto   | `VARCHAR(100)`  |
| `preco`                 | Decimal | `DECIMAL(10,2)` |
| `quantidade_de_estoque` | Inteiro | `INT`           |

## Rotas da API REST (VM2-API, porta 3000)

| Método | Rota        | Descrição                                                                                         |
| ------ | ----------- | ------------------------------------------------------------------------------------------------- |
| `POST` | `/produto`  | Recebe os quatro campos (JSON) e cadastra o produto no MySQL. Retorna `201` com o produto criado. |
| `GET`  | `/produtos` | Retorna todos os produtos cadastrados em JSON.                                                    |

## CORS

A API usa o middleware `cors` liberando **somente a origem da aplicação web** (`http://<IP_VM1>`, variável `CORS_ORIGIN`, gerada automaticamente pelo Ansible) com os métodos **GET, POST e OPTIONS** e o cabeçalho `Content-Type`. A requisição de _preflight_ `OPTIONS` é respondida pelo próprio middleware. Nenhum mecanismo de segurança do navegador precisa ser desativado.

---

## Como executar

### Pré-requisitos (máquina host)

- Linux com KVM/libvirt (`qemu:///system`), a rede `default` ativa e o usuário com acesso ao libvirt (grupo `libvirt`)
- [OpenTofu](https://opentofu.org/), Ansible e Python 3
- Acesso à internet (download da imagem Ubuntu e das imagens Docker)
- Cerca de **3 GB de RAM livres** (VM1-WEB 1 GB + VM2-API 2 GB) e ~5 GB de disco

### Passo a passo rápido (recomendado)

Todos os comandos são executados **na raiz do repositório**.

**1. Chave SSH** — o projeto usa por padrão `~/.ssh/devops_lab` (privada) e `~/.ssh/devops_lab.pub` (pública). Se não existir, crie:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/devops_lab -N ""
```

**2. Executar o fluxo completo:**

```bash
bash setup.sh
```

O `setup.sh` faz tudo sozinho:

1. `tofu apply` → cria as VMs **VM1-WEB** e **VM2-API** (o cloud-init instala o Docker);
2. lê os IPs com `tofu output` e **atualiza o `ansible/inventory` automaticamente**;
3. roda o Ansible → sobe API + MySQL na VM2 e a aplicação web na VM1.

A primeira execução leva alguns minutos (download da imagem Ubuntu, boot das VMs, download das imagens Docker e build da API). Ao final o script exibe os endereços:

```
Aplicacao web: http://<IP_DA_VM1>
API:           http://<IP_DA_VM2>:3000/produtos
```

**3. Testar:** abra `http://<IP_DA_VM1>` no navegador, cadastre um produto e clique em **"Listar todos os produtos"**. Mais testes na seção [5. Acessar](#5-acessar).

**Usando outra chave SSH** (opcional):

```bash
SSH_KEY=~/.ssh/minha_chave bash setup.sh
```

(O script passa `ssh_public_key_path` para o OpenTofu e ajusta `ansible_ssh_private_key_file` no `ansible/inventory`.)

### Problemas comuns

| Erro | Solução |
| --- | --- |
| `domain 'VM1-WEB' already exists` (ou VM2-API) | Existe uma VM com esse nome fora do state do tofu: `sudo virsh destroy VM1-WEB; sudo virsh undefine VM1-WEB` (idem VM2-API) e rode `bash setup.sh` novamente. |
| `storage volume ... already exists` | Remova o volume órfão: `sudo virsh vol-delete --pool default <nome-do-volume>`. |
| MySQL reiniciando com `CPU does not support x86-64-v2` | As VMs precisam de `cpu mode = host-passthrough` (já configurado em `iac/main.tf`); recrie as VMs com `cd iac && tofu destroy` e `bash setup.sh`. |
| `libvirt_domain.vm: Still creating...` por vários minutos | A VM foi recriada reaproveitando o disco antigo e ficou sem rede (MAC novo). Cancele com **um** Ctrl+C, remova as VMs (`sudo virsh destroy`/`undefine`), recrie os discos com `cd iac && tofu destroy -auto-approve -target=libvirt_volume.vm_disk -target=libvirt_cloudinit_disk.init` e rode `bash setup.sh`. |
| Host sem memória / VMs lentas | Desligue outras VMs: `sudo virsh shutdown <nome>`. |

---

## Execução manual (passo a passo detalhado)

O fluxo abaixo é o mesmo que o `setup.sh` executa.

### 1. Chave SSH

Para usar outra chave manualmente, troque o caminho em dois lugares:

1. **OpenTofu** (chave pública):
   ```bash
   tofu apply -var 'ssh_public_key_path=~/.ssh/minha_chave.pub'
   ```
   (ou altere o `default` de `variable "ssh_public_key_path"` em `iac/main.tf`)
2. **Ansible** (chave privada) — em `ansible/inventory`:
   ```ini
   ansible_ssh_private_key_file=~/.ssh/minha_chave
   ```

### 2. Provisionar as VMs (OpenTofu + cloud-init)

```bash
cd iac
tofu init
tofu apply
tofu output ips
```

São criadas as VMs **VM1-WEB** (1 GB RAM) e **VM2-API** (2 GB RAM) com Ubuntu 24.04. O cloud-init cria o usuário `aluno` com a chave SSH e instala/ativa o Docker.

> A imagem Ubuntu cloud (`noble-server-cloudimg`) é baixada uma única vez e serve de **disco base** (sistema operacional) para as duas VMs; cada VM grava apenas as diferenças em seu próprio disco (`VM1-WEB.qcow2`, `VM2-API.qcow2`).
>
> As VMs usam `cpu mode = host-passthrough` porque a imagem do MySQL 8 exige CPU x86-64-v2, que o modelo padrão do QEMU (`qemu64`) não oferece.

### Verificar se as VMs estão ativas

```bash
# Listar
sudo virsh list --all
```

```bash
# IPs das VMs (lease DHCP da rede default)
sudo virsh net-dhcp-leases default
```

```bash
# Testar acesso SSH
ssh -i ~/.ssh/devops_lab aluno@<IP_DA_VM>
```

```bash
# Ligar / desligar uma VM
sudo virsh start VM1-WEB
sudo virsh shutdown VM1-WEB
```

### 3. Atualizar o inventory

Copie os IPs exibidos por `tofu output ips` para `ansible/inventory`:

```ini
[web]
VM1-WEB ansible_host=<IP_DA_VM1>

[api]
VM2-API ansible_host=<IP_DA_VM2>
```

### 4. Implantar os serviços (Ansible)

Na raiz do repositório:

```bash
ansible-playbook -i ansible/inventory ansible/playbook.yml
```

O playbook aguarda o cloud-init terminar e garante o Docker ativo nas duas VMs, e então:

1. **VM2-API**: copia `api/` para `/opt/api`, gera o `.env` (credenciais do MySQL + `CORS_ORIGIN=http://<IP_VM1>`) e executa `docker compose up -d --build`;
2. **VM1-WEB**: copia `app/` para `/opt/app`, gera `config.js` com `API_URL=http://<IP_VM2>:3000`, constrói a imagem e sobe o container na porta 80.

### 5. Acessar

- **Aplicação web:** `http://<IP_DA_VM1>`
- **API:** `http://<IP_DA_VM2>:3000/produtos`

Testes via terminal:

```bash
curl -X POST http://<IP_DA_VM2>:3000/produto \
  -H "Content-Type: application/json" \
  -d '{"nome_do_produto":"Teclado","categoria":"Periféricos","preco":149.90,"quantidade_de_estoque":10}'
```

```bash
curl http://<IP_DA_VM2>:3000/produtos
```

Conferir os registros direto no MySQL da VM2:

```bash
ssh -i ~/.ssh/devops_lab aluno@<IP_DA_VM2> "sudo docker compose -f /opt/api/docker-compose.yml exec mysql mysql -uprodutos -pprodutos123 produtos_db -e 'SELECT * FROM produtos;'"
```

### Remover o ambiente

```bash
cd iac && tofu destroy
```
