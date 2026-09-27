import type { SupabaseClient } from '@supabase/supabase-js'

export const TAXA_TRIBUTARIA_ESTIMADA_PADRAO = 8

export function calcularValorAposTributos(valor: number, percentual: number): number {
  const taxaValida = Math.min(Math.max(percentual, 0), 100)
  return valor * (1 - taxaValida / 100)
}

export async function getTaxaTributariaEstimada(
  supabase: SupabaseClient,
  storeId: string
): Promise<number> {
  const { data } = await supabase
    .from('store_payment_config')
    .select('taxa_tributaria_estimada')
    .eq('store_id', storeId)
    .maybeSingle()

  const percentual = Number(data?.taxa_tributaria_estimada)
  return Number.isFinite(percentual) ? percentual : TAXA_TRIBUTARIA_ESTIMADA_PADRAO
}
