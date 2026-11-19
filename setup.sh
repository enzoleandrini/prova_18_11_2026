#!/usr/bin/env bash
# Fluxo completo: OpenTofu (VMs) -> atualiza IPs no inventory -> Ansible (servicos)
set -euo pipefail

cd "$(dirname "$0")"

# Chave SSH (privada). A publica deve estar em "${SSH_KEY}.pub".
# Para usar outra chave: SSH_KEY=~/.ssh/minha_chave bash setup.sh
SSH_KEY="${SSH_KEY:-$HOME/.ssh/devops_lab}"

if [[ ! -f "$SSH_KEY" || ! -f "${SSH_KEY}.pub" ]]; then
    echo "Chave SSH nao encontrada: $SSH_KEY (e ${SSH_KEY}.pub)"
    echo "Crie com: ssh-keygen -t ed25519 -f $SSH_KEY -N \"\""
    exit 1
fi

echo "==> [1/3] Provisionando VMs com OpenTofu (chave: ${SSH_KEY}.pub)"
(cd iac && tofu init -input=false && tofu apply -auto-approve -input=false -var "ssh_public_key_path=${SSH_KEY}.pub")

echo "==> [2/3] Atualizando ansible/inventory com os IPs das VMs"
IPS_JSON=$(cd iac && tofu output -json ips)
VM1_IP=$(echo "$IPS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["VM1-WEB"])')
VM2_IP=$(echo "$IPS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["VM2-API"])')

sed -i -E "s/^(VM1-WEB ansible_host=).*/\1${VM1_IP}/" ansible/inventory
sed -i -E "s/^(VM2-API ansible_host=).*/\1${VM2_IP}/" ansible/inventory
# So altera a chave no inventory se uma chave diferente foi informada
if [[ "$SSH_KEY" != "$HOME/.ssh/devops_lab" ]]; then
    sed -i -E "s|^(ansible_ssh_private_key_file=).*|\1${SSH_KEY}|" ansible/inventory
fi

# Remove host keys antigas (VMs recriadas ganham chaves novas)
ssh-keygen -R "$VM1_IP" >/dev/null 2>&1 || true
ssh-keygen -R "$VM2_IP" >/dev/null 2>&1 || true

echo "    VM1-WEB = ${VM1_IP}"
echo "    VM2-API = ${VM2_IP}"

echo "==> [3/3] Implantando servicos com Ansible"
ansible-playbook -i ansible/inventory ansible/playbook.yml

echo
echo "Pronto!"
echo "  Aplicacao web: http://${VM1_IP}"
echo "  API:           http://${VM2_IP}:3000/produtos"
