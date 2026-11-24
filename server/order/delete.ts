const DELETE_ORDER_BATCH_SIZE = 90;

function sqlPlaceholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

/**
 * Permanently deletes closed, unpaid orders. `orderDelivery` has no cascade
 * action, so children are removed in the same transaction. Both statements
 * repeat the status predicate so a race with a late payment can never delete a
 * paid order or its delivery records.
 */
export async function deleteClosedOrders(database: D1Database, orderIds: number[]) {
  let deleted = 0;
  for (let offset = 0; offset < orderIds.length; offset += DELETE_ORDER_BATCH_SIZE) {
    const chunk = orderIds.slice(offset, offset + DELETE_ORDER_BATCH_SIZE);
    const list = sqlPlaceholders(chunk.length);
    const results = await database.batch([
      database.prepare(`DELETE FROM orderDelivery WHERE orderId IN (SELECT id FROM \`order\` WHERE id IN (${list}) AND status = 'CLOSED' AND paymentStatus <> 'PAID')`).bind(...chunk),
      database.prepare(`DELETE FROM \`order\` WHERE id IN (${list}) AND status = 'CLOSED' AND paymentStatus <> 'PAID' RETURNING id`).bind(...chunk),
    ]);
    deleted += results[1]?.results.length ?? 0;
  }
  return deleted;
}
