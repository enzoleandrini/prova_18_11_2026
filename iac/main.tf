terraform {
    required_providers {
        libvirt = {
            source = "dmacvicar/libvirt"
            version = "0.8.3"
        }
    }
}

provider "libvirt" {
    uri = "qemu:///system"
}

# Caminho da chave PUBLICA usada para acessar as VMs.
# Para usar outra chave: tofu apply -var 'ssh_public_key_path=~/.ssh/outra_chave.pub'
variable "ssh_public_key_path" {
    type = string
    default = "~/.ssh/devops_lab.pub"
}

locals {
    vms = [
        { name = "VM1-WEB", memory = 1024 },  # aplicacao web (HTML em container)
        { name = "VM2-API", memory = 2048 },  # API Node.js + MySQL em containers
    ]
}

resource "libvirt_volume" "ubuntu_base" {
    name = "avaliacao-ubuntu-24.04-base.qcow2"
    pool = "default"
    source = "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
    format = "qcow2"
}

resource "libvirt_volume" "vm_disk" {
    count = length(local.vms)

    name = "${local.vms[count.index].name}.qcow2"
    pool = "default"
    base_volume_id = libvirt_volume.ubuntu_base.id
    format = "qcow2"

    size = 10 * 1024 * 1024 * 1024
}

resource "libvirt_cloudinit_disk" "init" {
    count = length(local.vms)

    name = "${local.vms[count.index].name}-cloudinit.iso"
    pool = "default"

    user_data = templatefile("${path.module}/cloud_init.cfg", {
        hostname = local.vms[count.index].name
        ssh_key = trimspace(file(pathexpand(var.ssh_public_key_path)))
    })
}

resource "libvirt_domain" "vm" {
    count = length(local.vms)

    name = local.vms[count.index].name
    memory = local.vms[count.index].memory
    vcpu = 1

    cloudinit = libvirt_cloudinit_disk.init[count.index].id

    # Repassa a CPU do host: a imagem do MySQL 8 exige x86-64-v2,
    # que o modelo padrao do QEMU (qemu64) nao oferece.
    cpu {
        mode = "host-passthrough"
    }

    network_interface {
        network_name = "default"
        wait_for_lease = true
    }

    disk {
        volume_id = libvirt_volume.vm_disk[count.index].id
    }

    console {
        type = "pty"
        target_type = "serial"
        target_port = "0"
    }
}

output "ips" {
    value = {
        for vm in libvirt_domain.vm : vm.name => vm.network_interface[0].addresses[0]
    }
}
