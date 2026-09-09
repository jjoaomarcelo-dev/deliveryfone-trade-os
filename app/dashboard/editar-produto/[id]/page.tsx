'use client'

import { useParams } from 'next/navigation'
import ProdutoForm from '../../../features/products/components/ProdutoForm'

export default function EditarProduto() {
  const params = useParams()
  return <ProdutoForm produtoId={params.id as string} />
}
