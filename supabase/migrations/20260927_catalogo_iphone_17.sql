-- Mantém o catálogo da linha 17 alinhado às capacidades oficiais.

UPDATE store_avaliacao_modelos
SET modelo = 'iPhone Air'
WHERE modelo = 'iPhone 17 Air';

UPDATE store_avaliacao_valores
SET modelo = 'iPhone Air'
WHERE modelo = 'iPhone 17 Air';

UPDATE products
SET modelo = 'iPhone Air'
WHERE modelo = 'iPhone 17 Air';

UPDATE avaliacoes_compra
SET modelo = 'iPhone Air'
WHERE modelo = 'iPhone 17 Air';

DELETE FROM store_avaliacao_valores
WHERE capacidade = '128GB'
  AND modelo IN ('iPhone 17', 'iPhone Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max');
