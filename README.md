# Estância Imperial Sports

Site e dashboard de agendamento para a arena Estância Imperial Sports — quadras de areia para vôlei de praia, futevôlei e beach tennis.

## Stack

- [Vite](https://vite.dev) + React + TypeScript
- Tailwind CSS + [shadcn/ui](https://ui.shadcn.com)
- [Supabase](https://supabase.com) (banco de dados, autenticação e RLS)
- [TanStack Query](https://tanstack.com/query) para dados assíncronos
- [Recharts](https://recharts.org) para os gráficos do dashboard

## Funcionalidades

- **Site público**: landing page da arena, listagem de quadras, fluxo de agendamento online com seleção de quadra/data/horário disponível, cadastro e login de clientes, histórico de reservas ("Minha conta").
- **Dashboard administrativo** (`/admin`): visão geral com métricas e gráficos, agenda diária por quadra, gestão de reservas, cadastro de quadras, organização de pagamentos (PIX/dinheiro/cartão) e cadastro de clientes.
- **Regra de acesso**: o primeiro usuário a se cadastrar no site vira administrador automaticamente; os demais são clientes.
- Pagamento é organizado manualmente (PIX combinado via WhatsApp e confirmado pelo admin no dashboard) — não há gateway de pagamento integrado por padrão.

## Desenvolvimento local

```bash
npm install
cp .env.example .env # já preenchido com as credenciais do projeto Supabase
npm run dev
```

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública (anon/publishable) do Supabase |

## Build

```bash
npm run build
```

## Deploy

O projeto está configurado para deploy contínuo na [Vercel](https://vercel.com), lendo as variáveis de ambiente acima.
