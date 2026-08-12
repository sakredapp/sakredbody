-- The product that goes with a suggestion, when there is one.
--
-- See shared/models/apothecary.ts for why this is a join table rather than a
-- field on the primitive: the library is a constant, versioned with the code
-- and reviewable in a diff, while the catalogue is data that changes on its
-- own. A product id inside the constant would mean a deploy every time the
-- shop changed and a library that lies whenever it hasn't.
--
-- Nothing appears when nothing is linked. The guidance has to stand alone —
-- chamomile is useful advice whether or not Sakred sells any, and a card that
-- only appears when there is something to sell is an advert wearing
-- guidance's clothes.

CREATE TABLE IF NOT EXISTS support_products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_id  text NOT NULL,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  note        text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_products_support ON support_products (support_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_support_products ON support_products (support_id, product_id);

ALTER TABLE support_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_products_service ON support_products;
CREATE POLICY support_products_service ON support_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);
