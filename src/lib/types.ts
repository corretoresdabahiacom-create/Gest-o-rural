export type Role = 'owner' | 'admin' | 'viewer'
export type Bond = 'clt' | 'diarista' | 'autonomo' | 'outro'

export const BOND_LABEL: Record<Bond, string> = { clt: 'CLT', diarista: 'Diarista', autonomo: 'Autônomo', outro: 'Outro' }
export const ROLE_LABEL: Record<Role, string> = { owner: 'Proprietário', admin: 'Administrador', viewer: 'Somente leitura' }

export interface Farm {
  id: string
  name: string
  ownerUid: string
  ownerName?: string
  ownerPhone?: string
  ownerDocument?: string
  logoUrl?: string | null
  alertDays: number[]
  arroba?: { vivo: number; carcaca: number; outra: number; outraLabel: string }
}
export interface Member { uid: string; email: string; name: string; role: Role }
export interface Invite { email: string; role: Role; farmName: string; farmId: string }
export interface Named { id: string; name: string; active: boolean }

export interface Collaborator {
  id: string
  name: string
  laborTypeId: string
  phone?: string
  cpf?: string
  admissionDate?: string | null
  bond: Bond
  referenceAmount?: number | null
  notes?: string
  active: boolean
}

export interface ExpenseEntry {
  id: string
  kind: 'labor' | 'other'
  date: string
  amount: number
  laborTypeId?: string
  laborTypeName?: string
  collaboratorId?: string
  collaboratorName?: string
  categoryId?: string
  categoryName?: string
  description?: string
  note?: string
  batchId?: string
  obligationId?: string
}

export type ObligationType = 'ferias' | 'adiantamento_ferias' | 'terco_ferias' | 'decimo_1' | 'decimo_2' | 'outro'
export const OBLIGATION_LABEL: Record<ObligationType, string> = {
  ferias: 'Férias',
  adiantamento_ferias: 'Adiantamento de férias',
  terco_ferias: '1/3 constitucional de férias',
  decimo_1: '13º salário — 1ª parcela',
  decimo_2: '13º salário — 2ª parcela',
  outro: 'Outro pagamento periódico',
}

export interface Obligation {
  id: string
  type: ObligationType
  title?: string
  collaboratorId: string
  collaboratorName: string
  referencePeriod?: string
  dueDate: string
  paidDate?: string | null
  amount?: number | null
  note?: string
  status: 'pendente' | 'pago'
  recurrence: 'none' | 'yearly'
  nextId?: string
}

export const DEFAULT_LABOR_TYPES = ['Vaqueiro', 'Tratorista', 'Diarista', 'Diarista do lar']
export const DEFAULT_CATEGORIES = [
  'Combustível', 'Alimentação', 'Manutenção de máquinas', 'Manutenção de veículos', 'Medicamentos veterinários',
  'Sal mineral', 'Compra de insumos', 'Energia elétrica', 'Água', 'Material de construção', 'Peças e ferramentas',
  'Serviços terceirizados', 'Outros',
]
export const DEFAULT_ALERT_DAYS = [30, 15, 7, 0]
