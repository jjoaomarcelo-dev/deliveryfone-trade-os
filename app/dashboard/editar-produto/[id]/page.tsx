'use client'

import { useParams } from 'next/navigation'
import ProdutoForm from '../../../components/ProdutoForm'

export default function EditarProduto() {
  const params = useParams()
  return <ProdutoForm produtoId={params.id as string} />
}
