import { getContext } from "telefunc";
import { getOrderForQuery } from "./service";

type TelefuncContext = {
  env?: {
    DB?: D1Database;
  };
};

export type PublicOrder = NonNullable<Awaited<ReturnType<typeof getOrderForQuery>>>;

export async function onQueryOrder(input: {
  orderNo: string;
  queryToken: string;
}): Promise<PublicOrder | null> {
  const context = getContext<TelefuncContext>();
  if (!context.env?.DB) throw new Error("DATABASE_UNAVAILABLE");

  return getOrderForQuery(context.env.DB, input.orderNo, input.queryToken);
}
